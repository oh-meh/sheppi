import { useState, Fragment } from "react";
import { Square, SquareCheckBig } from "lucide-react";
import tabKindMeta from "../../lib/tabKindMeta";
import type { TodoFile, TodoItem } from "../../lib/types";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { useTodoStore } from "../../stores/useTodoStore";
import { useNoticeStore } from "../../stores/useNoticeStore";
import { getErrorMessage } from "../../lib/errors";

interface TodoFileSectionProps {
  file: TodoFile;
  showFileLabel: boolean;
  onToggle: (file: TodoFile, item: TodoItem) => void;
}

function TodoFileSection({ file, showFileLabel, onToggle }: TodoFileSectionProps) {
  let previousSection: string | null | undefined;

  return (
    <div className="todos-panel__file">
      {showFileLabel && <div className="todos-panel__file-label">{file.relativePath}</div>}
      {file.items.map((item) => {
        const sectionChanged = item.section !== previousSection;
        previousSection = item.section;
        return (
          <Fragment key={`${item.line}-${item.text}`}>
            {sectionChanged && item.section && (
              <div className="todos-panel__section">{item.section}</div>
            )}
            <button
              className={`todos-panel__item ${item.checked ? "todos-panel__item--done" : ""}`}
              style={item.indent > 0 ? { paddingLeft: 10 + item.indent * 8 } : undefined}
              onClick={() => onToggle(file, item)}
            >
              <span className="todos-panel__item-box">
                {item.checked ? <SquareCheckBig size={15} /> : <Square size={15} />}
              </span>
              <span className="todos-panel__item-text">{item.text}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

export default function TodosPanel() {
  const activeProjectPath = useTerminalStore((s) => s.activeProjectPath);
  const files = useTodoStore((s) =>
    activeProjectPath ? s.projectTodos[activeProjectPath] : undefined,
  );
  const pushNotice = useNoticeStore((s) => s.pushNotice);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  if (!activeProjectPath) {
    return (
      <div className="commands-panel commands-panel--empty">
        Select a project to see its to-dos
      </div>
    );
  }

  const todoFiles = files ?? [];
  const allItems = todoFiles.flatMap((f) => f.items);
  const openCount = allItems.filter((i) => !i.checked).length;
  const doneCount = allItems.length - openCount;
  const hasFile = todoFiles.length > 0;

  const handleToggle = (file: TodoFile, item: TodoItem) => {
    useTodoStore
      .getState()
      .toggleItem(activeProjectPath, file.path, item.line, item.text, !item.checked)
      .catch((error) => {
        pushNotice({
          tone: "error",
          title: "Couldn't update to-do",
          message: getErrorMessage(error),
        });
      });
  };

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      // New items go to the primary (first-discovered) file; with no file
      // yet, the backend creates TODO.md at the project root.
      await useTodoStore
        .getState()
        .addItem(activeProjectPath, todoFiles[0]?.path ?? null, text);
      setDraft("");
    } catch (error) {
      pushNotice({
        tone: "error",
        title: "Couldn't add to-do",
        message: getErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="commands-panel">
      <div className="commands-panel__header">
        <div className="commands-panel__title-wrap">
          <span className="shrink-0">{tabKindMeta.todos.icon(15)}</span>
          <div className="commands-panel__title-block">
            <div className="commands-panel__title">To-dos</div>
            <div className="commands-panel__subtitle">
              {hasFile
                ? `${openCount} open · ${doneCount} done · ${todoFiles
                    .map((f) => f.relativePath)
                    .join(", ")}`
                : "No TODO.md in this project"}
            </div>
          </div>
        </div>
      </div>

      <div className="todos-panel__list">
        {!hasFile && (
          <div className="todos-panel__empty">
            Add a to-do below and Shep will create a <code>TODO.md</code> at the
            project root. It&apos;s a plain markdown checklist — you and your coding
            agents share the same file, and edits from either side show up here.
          </div>
        )}
        {todoFiles.map((file) => (
          <TodoFileSection
            key={file.path}
            file={file}
            showFileLabel={todoFiles.length > 1}
            onToggle={handleToggle}
          />
        ))}
        {hasFile && allItems.length === 0 && (
          <div className="todos-panel__empty">This list is empty — add a to-do below.</div>
        )}
      </div>

      <form
        className="todos-panel__add"
        onSubmit={(e) => {
          e.preventDefault();
          void handleAdd();
        }}
      >
        <input
          className="todos-panel__add-input"
          type="text"
          placeholder={hasFile ? "Add a to-do" : "Add a to-do (creates TODO.md)"}
          value={draft}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className="glass-button todos-panel__add-btn"
          disabled={!draft.trim() || saving}
        >
          {saving ? "Adding..." : "Add"}
        </button>
      </form>
    </div>
  );
}
