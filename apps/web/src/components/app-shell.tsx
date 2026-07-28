"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Inbox as InboxIcon,
  LayoutDashboard,
  Radar,
  Settings,
  Target,
} from "lucide-react";
import { AgentStatusControl } from "./agent-status-control";
import { CommandMenu } from "./command-menu";
import { AgentNotificationCenter } from "./agent-notifications";
import { NavoBrand } from "./navo-brand";

const primaryNav = [
  { label: "Overview", href: "/app/overview", icon: LayoutDashboard },
  { label: "Accounts", href: "/app/accounts", icon: Building2 },
  { label: "Signals", href: "/app/signals", icon: Radar },
  { label: "Missions", href: "/app/missions", icon: Target },
  { label: "Approvals", href: "/app/approvals", icon: ClipboardCheck },
  { label: "Inbox", href: "/app/conversations", icon: InboxIcon, related: ["/app/tasks"] },
  { label: "Analytics", href: "/app/analytics", icon: BarChart3 },
] as const;

const secondaryNav = [
  { label: "Settings", href: "/app/settings", icon: Settings, related: ["/app/knowledge"] },
] as const;

function isActiveRoute(pathname: string, href: string, related: readonly string[] = []) {
  if (href === "/app/overview") return pathname === href;
  return [href, ...related].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const focusedBuilder = pathname.endsWith("/builder");

  return (
    <div className={`app-shell${focusedBuilder ? " app-shell-builder" : ""}`}>
      <aside className="sidebar">
        <Link href="/app/overview" className="brand" aria-label="Navo Command Center">
          <NavoBrand mode="responsive" tone="white" priority />
        </Link>

        <div className="workspace-switcher" aria-label="Current workspace">
          <div style={{ textAlign: "left" }}>
            <strong>Nova Automation</strong>
            <small>Demo seller workspace</small>
          </div>
          <span className="env-badge">Demo</span>
        </div>

        <nav className="nav" aria-label="Primary navigation">
          {primaryNav.map((item) => {
            const { label, href, icon: Icon } = item;
            const active = isActiveRoute(pathname, href, "related" in item ? item.related : []);
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
        </nav>

        <nav className="sidebar-footer" aria-label="Secondary navigation">
          {secondaryNav.map((item) => {
            const { label, href, icon: Icon } = item;
            const active = isActiveRoute(pathname, href, "related" in item ? item.related : []);
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
        </nav>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <AgentStatusControl />
          <div className="topbar-actions">
            <CommandMenu />
            <AgentNotificationCenter />
            <Link className="topbar-avatar" aria-label="Workspace settings" href="/app/settings" title="Xiaolan Liu · Workspace Owner">
              XL
            </Link>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
