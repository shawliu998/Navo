"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  BrainCircuit,
  Building2,
  ChevronDown,
  CircleHelp,
  GitBranch,
  Inbox,
  LayoutDashboard,
  Link2,
  ListChecks,
  ListTodo,
  MessageSquareText,
  PlaySquare,
  Radar,
  Settings,
  Target,
  UsersRound,
} from "lucide-react";
import { AgentStatusControl } from "./agent-status-control";
import { CommandMenu } from "./command-menu";

const navGroups = [
  {
    label: "Navo",
    items: [
      ["Command Center", "/app/overview", LayoutDashboard],
      ["Missions", "/app/missions", Target],
    ],
  },
  {
    label: "Discover",
    items: [
      ["Accounts", "/app/accounts", Building2],
      ["Signals", "/app/signals", Radar],
    ],
  },
  {
    label: "Execute",
    items: [
      ["Playbooks", "/app/plays", GitBranch],
      ["Sequences", "/app/sequences", PlaySquare],
    ],
  },
  {
    label: "Human Control",
    items: [
      ["Approvals", "/app/approvals", ListChecks],
      ["Tasks", "/app/tasks", ListTodo],
    ],
  },
  {
    label: "Intelligence",
    items: [
      ["Conversations", "/app/conversations", MessageSquareText],
      ["Memory", "/app/memory", BrainCircuit],
    ],
  },
  {
    label: "Monitor",
    items: [
      ["Agent Activity", "/app/runs", Activity],
      ["Analytics", "/app/analytics", BarChart3],
    ],
  },
  {
    label: "Configure",
    items: [
      ["Knowledge", "/app/knowledge", BookOpen],
      ["Capabilities", "/app/agents", Bot],
      ["Integrations", "/app/integrations", Link2],
      ["Settings", "/app/settings", Settings],
    ],
  },
] as const;

function isActiveRoute(pathname: string, href: string) {
  if (href === "/app/overview") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/app/overview" className="brand" aria-label="Navo Command Center">
          <span className="brand-mark">N</span>
          <span>Navo</span>
        </Link>

        <button className="workspace-switcher" aria-label="Switch workspace" type="button">
          <div style={{ textAlign: "left" }}>
            <strong>Nova Automation</strong>
            <small>Owner workspace</small>
          </div>
          <span className="env-badge">Demo</span>
          <ChevronDown size={13} />
        </button>

        <nav className="nav" aria-label="Primary navigation">
          {navGroups.map((group) => (
            <div key={group.label} className="nav-section">
              <div className="nav-group">{group.label}</div>
              {group.items.map(([label, href, Icon]) => {
                const active = isActiveRoute(pathname, href);
                return (
                  <Link
                    key={href}
                    className={`nav-link${active ? " nav-link-active" : ""}`}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    title={label}
                  >
                    <Icon />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <a
            className="nav-link"
            href="https://github.com/shawliu998/Navo"
            target="_blank"
            rel="noreferrer"
            title="Help"
          >
            <CircleHelp />
            <span>Help</span>
          </a>
          <div className="user-card">
            <span className="avatar">刘</span>
            <div>
              <strong>刘晓岚</strong>
              <small>Workspace Owner</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <AgentStatusControl />
          <div className="topbar-actions">
            <CommandMenu />
            <button className="icon-button" aria-label="Notifications" type="button">
              <Inbox size={16} />
              <span className="notification-dot" aria-hidden="true" />
            </button>
            <button className="icon-button topbar-members" aria-label="Workspace members" type="button">
              <UsersRound size={16} />
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
