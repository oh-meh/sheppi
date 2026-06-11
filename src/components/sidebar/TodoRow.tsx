import { useTodoStore } from "../../stores/useTodoStore";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { panelTabId } from "../../lib/types";
import tabKindMeta from "../../lib/tabKindMeta";

interface TodoRowProps {
  repoPath: string;
}

export default function TodoRow({ repoPath }: TodoRowProps) {
  const files = useTodoStore((s) => s.projectTodos[repoPath]);
  const isActive = useTerminalStore((s) => {
    const path = s.activeProjectPath;
    if (!path) return false;
    return s.projectState[path]?.activeTabId === panelTabId("todos");
  });

  const openCount =
    files?.reduce(
      (sum, file) => sum + file.items.filter((item) => !item.checked).length,
      0,
    ) ?? 0;

  return (
    <button
      onClick={() => useTerminalStore.getState().addPanelTab("todos")}
      className={`section-toggle ${isActive ? "!text-[var(--text-primary)] !bg-white/6" : ""}`}
    >
      <span className="shrink-0" style={{ color: "var(--section-icon-color)" }}>
        {tabKindMeta.todos.icon(14)}
      </span>
      <span className="truncate">To-dos</span>
      {openCount > 0 && <span className="badge">{openCount}</span>}
    </button>
  );
}
