use std::fs;
use std::path::{Path, PathBuf};

/// Directories never scanned for todo files — build artifacts, deps, VCS internals.
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    ".next",
    "dist",
    "build",
    "__pycache__",
    "vendor",
    ".shep-worktrees",
];

/// Filenames (lowercased) recognized as todo files.
const TODO_FILENAMES: &[&str] = &["todo.md", "todos.md"];

/// How deep below the repo root to look for todo files.
const MAX_SCAN_DEPTH: usize = 3;

/// Hard cap on discovered files so a pathological repo can't flood the UI.
const MAX_TODO_FILES: usize = 20;

/// Skip parsing files larger than this — a real todo list is never 1 MB.
const MAX_FILE_BYTES: u64 = 1024 * 1024;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    /// 0-based line index in the file; used for surgical edits.
    pub line: usize,
    pub text: String,
    pub checked: bool,
    /// Leading whitespace width, for rendering nested items.
    pub indent: usize,
    /// Nearest preceding markdown heading, if any.
    pub section: Option<String>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TodoFile {
    pub path: String,
    pub relative_path: String,
    pub items: Vec<TodoItem>,
}

pub fn read_todos(repo_path: &str) -> Result<Vec<TodoFile>, String> {
    let root = PathBuf::from(repo_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {repo_path}"));
    }

    let mut found: Vec<PathBuf> = Vec::new();
    scan_dir(&root, 0, &mut found);

    // Root-level file first, then shallower paths, then alphabetical.
    found.sort_by_key(|p| (p.components().count(), p.clone()));
    found.truncate(MAX_TODO_FILES);

    let mut files = Vec::new();
    for path in found {
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let relative_path = path
            .strip_prefix(&root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());
        files.push(TodoFile {
            path: path.to_string_lossy().to_string(),
            relative_path,
            items: parse_items(&content),
        });
    }
    Ok(files)
}

pub fn toggle_todo(
    file_path: &str,
    line: usize,
    expected_text: &str,
    checked: bool,
) -> Result<(), String> {
    let content =
        fs::read_to_string(file_path).map_err(|e| format!("Failed to read {file_path}: {e}"))?;
    let mut lines: Vec<String> = content.split('\n').map(String::from).collect();

    let target = lines
        .get(line)
        .ok_or_else(|| "To-do list changed on disk — try again".to_string())?;
    let parsed = parse_checkbox_line(target)
        .ok_or_else(|| "To-do list changed on disk — try again".to_string())?;
    if parsed.text != expected_text {
        return Err("To-do list changed on disk — try again".to_string());
    }

    // The first '[' on a checkbox line is the marker; flip only that byte.
    let bracket = target.find('[').ok_or("Malformed to-do line")?;
    let mut updated = target.clone();
    updated.replace_range(bracket + 1..bracket + 2, if checked { "x" } else { " " });
    lines[line] = updated;

    fs::write(file_path, lines.join("\n"))
        .map_err(|e| format!("Failed to write {file_path}: {e}"))
}

pub fn add_todo(repo_path: &str, file_path: Option<&str>, text: &str) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("To-do text is empty".to_string());
    }

    let path = match file_path {
        Some(p) => PathBuf::from(p),
        None => {
            // Lazy creation: the file materializes with the first to-do.
            let path = Path::new(repo_path).join("TODO.md");
            if !path.exists() {
                return fs::write(&path, format!("# TODO\n\n- [ ] {text}\n"))
                    .map_err(|e| format!("Failed to create TODO.md: {e}"));
            }
            path
        }
    };

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let mut lines: Vec<String> = content.split('\n').map(String::from).collect();

    // Insert after the last existing checkbox so the new item joins the list
    // block instead of landing below trailing notes; fall back to EOF.
    let insert_at = lines
        .iter()
        .rposition(|l| parse_checkbox_line(l).is_some())
        .map(|i| i + 1)
        .unwrap_or(lines.len());
    lines.insert(insert_at, format!("- [ ] {text}"));

    let mut joined = lines.join("\n");
    if !joined.ends_with('\n') {
        joined.push('\n');
    }
    fs::write(&path, joined).map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

fn scan_dir(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };

        if path.is_dir() {
            if depth + 1 > MAX_SCAN_DEPTH || name.starts_with('.') || IGNORED_DIRS.contains(&name)
            {
                continue;
            }
            scan_dir(&path, depth + 1, found);
        } else if TODO_FILENAMES.contains(&name.to_lowercase().as_str()) {
            let small = entry.metadata().map(|m| m.len() <= MAX_FILE_BYTES).unwrap_or(false);
            if small {
                found.push(path);
            }
        }
    }
}

struct ParsedCheckbox<'a> {
    text: &'a str,
    checked: bool,
    indent: usize,
}

/// Parse a GFM task-list line: `- [ ] text`, `- [x] text` (also `*`/`+` bullets).
fn parse_checkbox_line(line: &str) -> Option<ParsedCheckbox<'_>> {
    let trimmed = line.trim_start();
    let indent = line.len() - trimmed.len();

    let rest = trimmed
        .strip_prefix("- ")
        .or_else(|| trimmed.strip_prefix("* "))
        .or_else(|| trimmed.strip_prefix("+ "))?;
    let rest = rest.trim_start();

    let mut chars = rest.chars();
    if chars.next() != Some('[') {
        return None;
    }
    let mark = chars.next()?;
    if chars.next() != Some(']') {
        return None;
    }
    let checked = match mark {
        ' ' => false,
        'x' | 'X' => true,
        _ => return None,
    };

    let after = chars.as_str();
    if !after.is_empty() && !after.starts_with(' ') {
        return None;
    }
    Some(ParsedCheckbox {
        text: after.trim(),
        checked,
        indent,
    })
}

fn parse_items(content: &str) -> Vec<TodoItem> {
    let mut items = Vec::new();
    let mut section: Option<String> = None;

    for (line_idx, line) in content.split('\n').enumerate() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') {
            let title = trimmed.trim_start_matches('#');
            if title.starts_with(' ') || title.is_empty() {
                let title = title.trim();
                section = (!title.is_empty()).then(|| title.to_string());
            }
            continue;
        }
        if let Some(parsed) = parse_checkbox_line(line) {
            if parsed.text.is_empty() {
                continue;
            }
            items.push(TodoItem {
                line: line_idx,
                text: parsed.text.to_string(),
                checked: parsed.checked,
                indent: parsed.indent,
                section: section.clone(),
            });
        }
    }
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_checkboxes_with_sections() {
        let content = "# TODO\n\n## Now\n- [ ] first\n  - [x] nested done\n* [ ] star bullet\n\n## Later\n- [-] declined ignored\n- [ ]\n- [ ] last\n";
        let items = parse_items(content);
        assert_eq!(items.len(), 4);
        assert_eq!(items[0].text, "first");
        assert_eq!(items[0].section.as_deref(), Some("Now"));
        assert!(!items[0].checked);
        assert!(items[1].checked);
        assert_eq!(items[1].indent, 2);
        assert_eq!(items[3].text, "last");
        assert_eq!(items[3].section.as_deref(), Some("Later"));
    }

    #[test]
    fn ignores_non_checkbox_lines() {
        let items = parse_items("plain text\n- regular bullet\n-[ ] no space\n[ ] no bullet\n");
        assert!(items.is_empty());
    }

    fn temp_repo(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("shep-todos-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn toggle_flips_only_the_marker() {
        let dir = temp_repo("toggle");
        let path = dir.join("TODO.md");
        fs::write(&path, "# TODO\n\n- [ ] keep [brackets] intact\n- [x] other\n").unwrap();
        let p = path.to_string_lossy().to_string();

        toggle_todo(&p, 2, "keep [brackets] intact", true).unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "# TODO\n\n- [x] keep [brackets] intact\n- [x] other\n"
        );

        // Stale expected text → error, file untouched
        assert!(toggle_todo(&p, 3, "something else", false).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn add_creates_file_lazily_and_inserts_after_last_item() {
        let dir = temp_repo("add");
        let repo = dir.to_string_lossy().to_string();

        add_todo(&repo, None, "first task").unwrap();
        let path = dir.join("TODO.md");
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "# TODO\n\n- [ ] first task\n"
        );

        fs::write(&path, "# TODO\n\n- [ ] a\n\ntrailing notes\n").unwrap();
        add_todo(&repo, Some(&path.to_string_lossy()), "b").unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "# TODO\n\n- [ ] a\n- [ ] b\n\ntrailing notes\n"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn discovers_files_case_insensitively_and_skips_ignored_dirs() {
        let dir = temp_repo("scan");
        fs::write(dir.join("todo.md"), "- [ ] root\n").unwrap();
        fs::create_dir_all(dir.join("docs")).unwrap();
        fs::write(dir.join("docs/TODOS.md"), "- [ ] nested\n").unwrap();
        fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();
        fs::write(dir.join("node_modules/pkg/TODO.md"), "- [ ] ignored\n").unwrap();

        let files = read_todos(&dir.to_string_lossy()).unwrap();
        let rels: Vec<&str> = files.iter().map(|f| f.relative_path.as_str()).collect();
        assert_eq!(rels, vec!["todo.md", "docs/TODOS.md"]);
        let _ = fs::remove_dir_all(&dir);
    }
}
