import { useCallback, useEffect, useState } from "react";
import type { TabActivity, TerminalTabData } from "../../lib/types";
import { assistantLogoSrc, getAssistantLogoClass } from "../../lib/assistantLogos";
import { handleActionKey } from "../../lib/a11y";
import { useTerminalStore } from "../../stores/useTerminalStore";
import tabKindMeta from "../../lib/tabKindMeta";
import SidebarSectionToggle from "./SidebarSectionToggle";

export interface AgentSessionItem {
  tab: TerminalTabData;
  projectName: string;
  branchName: string | null;
}

interface AgentSessionListProps {
  sessions: AgentSessionItem[];
  activeRepoPath: string | null;
  activeTabId: string | null;
  onSelectSession: (repoPath: string, tabId: string) => void;
}

const MAX_VISIBLE_SESSIONS = 4;
const COLLAPSED_STORAGE_KEY = "shep:sidebar-agent-sessions-collapsed";

function dotClass(activity: TabActivity | undefined): string {
  if (!activity) return "sidebar-status-dot--idle";
  if (!activity.alive) return activity.exitCode === 0 ? "sidebar-status-dot--idle" : "sidebar-status-dot--exited";
  if (activity.active) return "sidebar-status-dot--active";
  return "sidebar-status-dot--idle";
}

function AgentSessionRow({
  item,
  isActive,
  onSelect,
}: {
  item: AgentSessionItem;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { tab, projectName, branchName } = item;
  const logoUrl = tab.assistantId ? assistantLogoSrc[tab.assistantId] : null;
  const activity: TabActivity | undefined = useTerminalStore((s) => s.tabActivity[tab.ptyId]);
  const title = branchName ? `${projectName} - ${branchName}` : projectName;

  return (
    <div
      className={`list-item agent-session-row ${isActive ? "active" : ""}`}
      onClick={onSelect}
      onKeyDown={(event) => handleActionKey(event, onSelect)}
      title={title}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`Open agent session in ${title}`}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          width={14}
          height={14}
          className={tab.assistantId ? getAssistantLogoClass(tab.assistantId) : undefined}
        />
      ) : (
        <span className="shrink-0">{tabKindMeta.assistant.icon(14)}</span>
      )}
      <span className="agent-session-row__text">
        <span className="agent-session-row__project">{projectName}</span>
        {branchName && <span className="agent-session-row__branch">{branchName}</span>}
      </span>
      <span className={`sidebar-status-dot agent-session-row__dot ${dotClass(activity)}`} />
    </div>
  );
}

export default function AgentSessionList({
  sessions,
  activeRepoPath,
  activeTabId,
  onSelectSession,
}: AgentSessionListProps) {
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true",
  );
  const visibleSessions = collapsed ? [] : sessions.slice(0, MAX_VISIBLE_SESSIONS);
  const overflowCount = Math.max(0, sessions.length - MAX_VISIBLE_SESSIONS);

  const handleToggle = useCallback(() => {
    setCollapsed((value) => !value);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  if (sessions.length === 0) return null;

  return (
    <div className="sidebar-section px-2 pb-1">
      <SidebarSectionToggle
        label="Agent Sessions"
        icon={tabKindMeta.assistant.icon(14)}
        collapsed={collapsed}
        badge={sessions.length}
        onToggle={handleToggle}
      />

      {!collapsed && (
        <div className="sidebar-section__list">
          {visibleSessions.map((item) => (
            <AgentSessionRow
              key={`${item.tab.repoPath}:${item.tab.id}`}
              item={item}
              isActive={item.tab.repoPath === activeRepoPath && item.tab.id === activeTabId}
              onSelect={() => onSelectSession(item.tab.repoPath, item.tab.id)}
            />
          ))}
          {overflowCount > 0 && (
            <div className="sidebar-section__overflow">+{overflowCount} more in projects</div>
          )}
        </div>
      )}
    </div>
  );
}
