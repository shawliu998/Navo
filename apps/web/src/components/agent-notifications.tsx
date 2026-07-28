"use client";

import { Inbox, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgentNotification } from "@/lib/agent-notifications";
import { NavoBrand } from "@/components/navo-brand";

type NotificationsPayload = {
  data?: AgentNotification[];
  meta?: { actionableCount?: number };
};

function relativeTime(value: string | null) {
  if (!value) return "Time unavailable";
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return "Time unavailable";
  const minutes = Math.round(elapsed / 60_000);
  if (Math.abs(minutes) < 1) return "Just now";
  if (Math.abs(minutes) < 60) return `${Math.abs(minutes)}m ago`;
  const hours = Math.round(Math.abs(minutes) / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AgentNotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [actionableCount, setActionableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch("/api/agent/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as NotificationsPayload;
        if (!mounted) return;
        setNotifications(Array.isArray(payload.data) ? payload.data : []);
        setActionableCount(typeof payload.meta?.actionableCount === "number" ? payload.meta.actionableCount : 0);
      } catch {
        // Keep the last successful response visible when the polling request fails.
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => { document.removeEventListener("keydown", closeOnEscape); document.removeEventListener("mousedown", closeOnOutsideClick); };
  }, [open]);

  return <div className="notification-center" ref={containerRef}>
    <button
      className="icon-button notification-trigger"
      aria-label={actionableCount > 0 ? `Notifications, ${actionableCount} actionable` : "Notifications"}
      aria-expanded={open}
      aria-controls="agent-notification-popover"
      type="button"
      onClick={() => setOpen((value) => !value)}
    >
      <Inbox size={16} />
      {actionableCount > 0 && <span className="notification-badge" aria-label={`${actionableCount} actionable notifications`}>{actionableCount > 99 ? "99+" : actionableCount}</span>}
    </button>
    {open && <section id="agent-notification-popover" className="notification-popover" role="dialog" aria-label="Agent notifications">
      <header className="notification-header">
        <div><strong>Agent notifications</strong><small>{actionableCount > 0 ? `${actionableCount} actionable` : "No action needed"}</small></div>
        <button className="icon-button" type="button" aria-label="Close notifications" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="notification-list" aria-live="polite">
        {loading && notifications.length === 0 ? <div className="notification-empty"><Loader2 className="spin" size={17}/><span>Loading activity…</span></div> : notifications.length === 0 ? <div className="notification-empty"><NavoBrand mode="mark" className="empty-state-brand-mark"/><strong>No recent agent notifications</strong><span>Mission results and operator actions will appear here.</span></div> : notifications.map((notification) => <Link key={notification.id} href={notification.href} className={`notification-item notification-${notification.severity.toLowerCase()}`} onClick={() => setOpen(false)}>
          <span className="notification-item-marker" aria-hidden="true">{notification.severity === "ERROR" ? <TriangleAlert size={13}/> : ""}</span>
          <span className="notification-item-copy"><strong>{notification.title}</strong><span>{notification.detail}</span><small>{relativeTime(notification.occurredAt)}</small></span>
        </Link>)}
      </div>
      <footer className="notification-footer">Actionable count only · read state is not persisted</footer>
    </section>}
  </div>;
}
