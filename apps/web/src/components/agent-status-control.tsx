"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AgentDrawer, type AgentRuntimeStatus, type AgentSnapshot } from "./agent-drawer";

const fallbackSnapshot: AgentSnapshot = {
  status: "IDLE",
  headline: "Navo is ready",
  detail: "Monitoring workspace missions",
  activeMissions: 0,
  pendingApprovals: 0,
  operatingMode: "APPROVAL_CONTROLLED",
  knowledgeHealth: 0,
  connectedTools: [],
  capabilities: [],
  approvalPolicy: "REQUIRED_FOR_OUTBOUND",
  testMode: true,
  emailSinkEnabled: true,
  maxDailyActions: 50,
  schedule: "Workspace schedule",
  currentMission: null,
  currentPlan: [],
  recentEvents: [],
};

const statusHeadlines: Record<AgentRuntimeStatus, string> = {
  IDLE: "Navo is ready",
  PLANNING: "Navo is planning",
  RUNNING: "Navo is active",
  WAITING_FOR_APPROVAL: "Navo is waiting for approval",
  BLOCKED: "Navo is blocked",
  PAUSED: "Navo is paused",
  COMPLETED: "Navo completed today’s plan",
  ERROR: "Navo needs attention",
};

function normalizeSnapshot(payload: unknown): AgentSnapshot {
  if (!payload || typeof payload !== "object") return fallbackSnapshot;
  const candidate = payload as Record<string, unknown>;
  const nested = candidate.agent && typeof candidate.agent === "object"
    ? (candidate.agent as Record<string, unknown>)
    : candidate;
  const data = candidate.data && typeof candidate.data === "object"
    ? (candidate.data as Record<string, unknown>)
    : {};
  const profile = data.profile && typeof data.profile === "object" ? data.profile as Record<string, unknown> : {};
  const preferences = data.preferences && typeof data.preferences === "object" ? data.preferences as Record<string, unknown> : {};
  const currentMission = data.currentMission && typeof data.currentMission === "object"
    ? data.currentMission as Record<string, unknown>
    : null;
  const schedule = preferences.dailySchedule && typeof preferences.dailySchedule === "object"
    ? preferences.dailySchedule as Record<string, unknown>
    : {};
  const rawStatus = String(nested.status ?? fallbackSnapshot.status).toUpperCase();
  const status = rawStatus in statusHeadlines
    ? (rawStatus as AgentRuntimeStatus)
    : fallbackSnapshot.status;
  const rawMode = String(nested.operatingMode ?? fallbackSnapshot.operatingMode).toUpperCase();
  const operatingMode = ["OBSERVE", "RECOMMEND", "APPROVAL_CONTROLLED", "AUTOPILOT"].includes(rawMode)
    ? (rawMode as AgentSnapshot["operatingMode"])
    : fallbackSnapshot.operatingMode;

  const stringList = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item)) : [];
  const numberValue = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const currentPlan = Array.isArray(data.currentPlan) ? data.currentPlan : [];
  const recentEvents = Array.isArray(data.recentEvents) ? data.recentEvents : [];

  return {
    status,
    headline: String(nested.headline ?? nested.label ?? statusHeadlines[status]),
    detail: String(nested.detail ?? nested.currentAction ?? fallbackSnapshot.detail),
    activeMissions: numberValue(nested.activeMissions ?? data.activeMissionCount, fallbackSnapshot.activeMissions),
    pendingApprovals: numberValue(nested.pendingApprovals ?? data.pendingApprovalCount, fallbackSnapshot.pendingApprovals),
    operatingMode,
    knowledgeHealth: numberValue(profile.knowledgeHealth, fallbackSnapshot.knowledgeHealth),
    connectedTools: stringList(profile.connectedTools),
    capabilities: stringList(profile.capabilities).map((item) => item.replaceAll("_", " ")),
    approvalPolicy: String(preferences.approvalPolicy ?? fallbackSnapshot.approvalPolicy),
    testMode: preferences.testMode === undefined ? fallbackSnapshot.testMode : Boolean(preferences.testMode),
    emailSinkEnabled: preferences.emailSinkEnabled === undefined ? fallbackSnapshot.emailSinkEnabled : Boolean(preferences.emailSinkEnabled),
    maxDailyActions: numberValue(preferences.maxDailyActions, fallbackSnapshot.maxDailyActions),
    schedule: schedule.enabled === false
      ? "Disabled"
      : `${String(schedule.start ?? "08:00")}–${String(schedule.end ?? "18:00")} · ${String(schedule.timezone ?? "workspace time")}`,
    currentMission: currentMission ? {
      id: String(currentMission.id ?? ""),
      name: String(currentMission.name ?? "Current mission"),
      objective: String(currentMission.objective ?? ""),
      status: String(currentMission.status ?? "ACTIVE"),
      progress: numberValue(currentMission.progress, 0),
      processedCount: numberValue(currentMission.processedCount, 0),
      targetCount: numberValue(currentMission.targetCount, 0),
      pendingApprovalCount: numberValue(currentMission.pendingApprovalCount, 0),
      currentStep: currentMission.currentStep ? String(currentMission.currentStep) : null,
    } : null,
    currentPlan: currentPlan.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const step = item as Record<string, unknown>;
      return [{
        id: String(step.id ?? `${step.order ?? "step"}-${step.title ?? ""}`),
        order: numberValue(step.order, 0),
        title: String(step.title ?? "Plan step"),
        description: step.description ? String(step.description) : null,
        status: String(step.status ?? "PENDING"),
        errorMessage: step.errorMessage ? String(step.errorMessage) : null,
      }];
    }),
    recentEvents: recentEvents.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const event = item as Record<string, unknown>;
      return [{
        id: String(event.id ?? `${event.occurredAt ?? "event"}-${event.title ?? ""}`),
        title: String(event.title ?? "Agent event"),
        description: event.description ? String(event.description) : null,
        severity: String(event.severity ?? "INFO"),
        occurredAt: String(event.occurredAt ?? new Date().toISOString()),
      }];
    }),
  };
}

export function AgentStatusControl() {
  const [snapshot, setSnapshot] = useState<AgentSnapshot>(fallbackSnapshot);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetch("/api/agent/status", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: unknown) => {
          if (!cancelled && payload) setSnapshot(normalizeSnapshot(payload));
        })
        .catch(() => {
          // Keep the last known state when the runtime is temporarily unavailable.
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const updateStatus = async (action: "pause" | "resume") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/${action}`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string | { message?: string } } | null;
        const message = typeof body?.error === "string" ? body.error : body?.error?.message;
        throw new Error(message ?? `Could not ${action} Navo.`);
      }
      const payload = await response.json().catch(() => null);
      setSnapshot((current) => {
        if (payload) {
          const next = normalizeSnapshot(payload);
          return {
            ...current,
            status: next.status,
            headline: next.headline,
            detail: next.detail,
            activeMissions: next.activeMissions,
            pendingApprovals: next.pendingApprovals,
            operatingMode: next.operatingMode,
          };
        }
        return {
              ...current,
              status: action === "pause" ? "PAUSED" : "RUNNING",
              headline: action === "pause" ? statusHeadlines.PAUSED : statusHeadlines.RUNNING,
              detail: action === "pause" ? "Missions are safely paused" : fallbackSnapshot.detail,
        };
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Navo could not be updated. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="agent-status-control"
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
      >
        <span className={`agent-status-dot status-${snapshot.status.toLowerCase()}`} />
        <span className="agent-status-copy">
          <strong>{snapshot.headline}</strong>
          <small>
            {loading ? (
              <><Loader2 className="spin" size={10} /> Checking status…</>
            ) : (
              <>{snapshot.activeMissions} active missions · {snapshot.pendingApprovals} needs approval</>
            )}
          </small>
        </span>
        <ChevronDown size={14} />
      </button>
      {typeof document !== "undefined" && createPortal(<AgentDrawer
        open={drawerOpen}
        snapshot={snapshot}
        busy={busy}
        error={error}
        onClose={() => setDrawerOpen(false)}
        onPause={() => void updateStatus("pause")}
        onResume={() => void updateStatus("resume")}
      />, document.body)}
    </>
  );
}
