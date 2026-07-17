"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Loader2,
  MemoryStick,
  Pause,
  Play,
  ShieldCheck,
  Target,
  Wrench,
  X,
} from "lucide-react";
import { AgentOperatingMode, type OperatingMode } from "./agent-operating-mode";

export type AgentRuntimeStatus =
  | "IDLE"
  | "PLANNING"
  | "RUNNING"
  | "WAITING_FOR_APPROVAL"
  | "BLOCKED"
  | "PAUSED"
  | "COMPLETED"
  | "ERROR";

export type AgentSnapshot = {
  status: AgentRuntimeStatus;
  headline: string;
  detail: string;
  activeMissions: number;
  pendingApprovals: number;
  operatingMode: OperatingMode;
  knowledgeHealth: number;
  connectedTools: string[];
  capabilities: string[];
  approvalPolicy: string;
  testMode: boolean;
  emailSinkEnabled: boolean;
  maxDailyActions: number;
  schedule: string;
  currentMission: null | {
    id: string;
    name: string;
    objective: string;
    status: string;
    progress: number;
    processedCount: number;
    targetCount: number;
    pendingApprovalCount: number;
    currentStep: string | null;
  };
  currentPlan: Array<{
    id: string;
    order: number;
    title: string;
    description: string | null;
    status: string;
    errorMessage: string | null;
  }>;
  recentEvents: Array<{
    id: string;
    title: string;
    description: string | null;
    severity: string;
    occurredAt: string;
  }>;
};

type DrawerTab = "PLAN" | "ACTIVITY" | "MEMORY" | "CONTROLS";

const tabs: { id: DrawerTab; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: "PLAN", label: "Plan", icon: Target },
  { id: "ACTIVITY", label: "Activity", icon: Activity },
  { id: "MEMORY", label: "Context", icon: MemoryStick },
  { id: "CONTROLS", label: "Controls", icon: ShieldCheck },
];

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "recently";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1_000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function planTone(status: string) {
  if (status === "COMPLETED") return "done";
  if (status === "RUNNING" || status === "ACTIVE") return "active";
  return "next";
}

function eventTone(severity: string) {
  if (/ERROR|CRITICAL/.test(severity)) return "warning";
  if (/WARNING/.test(severity)) return "warning";
  if (/SUCCESS/.test(severity)) return "success";
  return "accent";
}

export function AgentDrawer({
  open,
  snapshot,
  busy,
  error,
  onClose,
  onPause,
  onResume,
}: {
  open: boolean;
  snapshot: AgentSnapshot;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("PLAN");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const paused = snapshot.status === "PAUSED";
  const mission = snapshot.currentMission;
  const completedSteps = snapshot.currentPlan.filter((step) => step.status === "COMPLETED").length;

  return (
    <div className="agent-drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside className="agent-drawer" role="dialog" aria-modal="true" aria-labelledby="agent-drawer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="agent-drawer-header">
          <div>
            <span className={`agent-status-dot status-${snapshot.status.toLowerCase()}`} />
            <strong id="agent-drawer-title">{snapshot.headline}</strong>
            <p>{snapshot.detail}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close Navo panel"><X size={17} /></button>
        </header>

        <div className="agent-drawer-tabs" role="tablist" aria-label="Navo agent details">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        <div className="agent-drawer-body">
          {tab === "PLAN" && (
            <div className="drawer-section-stack" role="tabpanel">
              {mission ? (
                <section className="agent-drawer-card mission-brief">
                  <span className="eyebrow">Current mission · {mission.status.replaceAll("_", " ")}</span>
                  <h3>{mission.name}</h3>
                  <div className="mission-brief-meta"><span>{mission.processedCount} / {mission.targetCount} processed</span><span>{mission.progress}% complete</span></div>
                  <div className="progress" aria-label={`${mission.progress}% mission progress`}><span style={{ width: `${Math.max(0, Math.min(100, mission.progress))}%` }} /></div>
                  <Link href={`/app/missions/${mission.id}`} onClick={onClose}>Open mission <ChevronRight size={13} /></Link>
                </section>
              ) : (
                <section className="agent-drawer-card mission-brief">
                  <span className="eyebrow">Current mission</span><h3>No mission is running</h3>
                  <p className="muted">Open the Command Center to give Navo a bounded outcome.</p>
                  <Link href="/app/overview" onClick={onClose}>Open Command Center <ChevronRight size={13} /></Link>
                </section>
              )}

              <section>
                <div className="drawer-section-heading"><h3>Execution plan</h3><span>{completedSteps} of {snapshot.currentPlan.length} complete</span></div>
                {snapshot.currentPlan.length ? (
                  <ol className="agent-plan-list">
                    {snapshot.currentPlan.map((step) => {
                      const tone = planTone(step.status);
                      return (
                        <li key={step.id} className={`plan-${tone}`}>
                          <span className="plan-marker">{tone === "done" ? <Check size={12} /> : tone === "active" ? <Loader2 size={12} /> : <Circle size={9} />}</span>
                          <span><strong>{step.title}</strong>{(step.description || step.errorMessage) && <small>{step.errorMessage ?? step.description}</small>}</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : <p className="muted">No execution plan is active.</p>}
              </section>

              <div className="drawer-waiting-state">
                {snapshot.pendingApprovals ? <Clock3 size={14} /> : <Check size={14} />}
                <span>
                  <strong>{snapshot.pendingApprovals ? `${snapshot.pendingApprovals} approval${snapshot.pendingApprovals === 1 ? "" : "s"} waiting` : "No human input required"}</strong>
                  <small>Navo will not take outbound action without approval.</small>
                </span>
              </div>
            </div>
          )}

          {tab === "ACTIVITY" && (
            <div className="drawer-section-stack" role="tabpanel">
              <div className="drawer-section-heading"><h3>Recent activity</h3><span className="live-label"><i /> Persisted</span></div>
              <div className="agent-event-list">
                {snapshot.recentEvents.map((item) => (
                  <div className="agent-event" key={item.id}>
                    <span className={`event-marker event-${eventTone(item.severity)}`} />
                    <span><strong>{item.title}</strong><small>{relativeTime(item.occurredAt)}{item.description ? ` · ${item.description}` : ""}</small></span>
                  </div>
                ))}
                {!snapshot.recentEvents.length && <p className="muted">No activity has been recorded yet.</p>}
              </div>
              <Link className="button button-secondary" href="/app/runs" onClick={onClose}>View all Agent Activity</Link>
            </div>
          )}

          {tab === "MEMORY" && (
            <div className="drawer-section-stack" role="tabpanel">
              <section className="agent-drawer-card">
                <div className="drawer-card-title"><BookOpen size={16} /><h3>Knowledge context</h3></div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 12 }}><strong style={{ fontSize: 25 }}>{snapshot.knowledgeHealth}%</strong><small className="muted">knowledge health</small></div>
                <Link href="/app/knowledge" onClick={onClose}>Review knowledge <ChevronRight size={13} /></Link>
              </section>
              <section>
                <div className="drawer-section-heading"><h3>Available capabilities</h3></div>
                <ul className="memory-fact-list">
                  {(snapshot.capabilities.length ? snapshot.capabilities : ["No capabilities configured"]).map((capability) => <li key={capability}>{capability}</li>)}
                </ul>
              </section>
              <section>
                <div className="drawer-section-heading"><h3>Connected tools</h3></div>
                <div className="context-health-list">
                  {(snapshot.connectedTools.length ? snapshot.connectedTools : ["No tools configured"]).map((tool) => <div key={tool}><Wrench size={15} /><span><strong>{tool}</strong><small>Workspace connection</small></span><b>Ready</b></div>)}
                </div>
              </section>
              <Link className="button button-secondary" href="/app/memory" onClick={onClose}>Browse account memory</Link>
            </div>
          )}

          {tab === "CONTROLS" && (
            <div className="drawer-section-stack" role="tabpanel">
              <AgentOperatingMode value={snapshot.operatingMode} disabled />
              <small className="muted">Operating mode is configured at workspace level.</small>

              {error && <div className="agent-control-error" role="alert"><AlertTriangle size={15} /> {error}</div>}

              <section>
                <div className="drawer-section-heading"><h3>Agent controls</h3></div>
                <div className="agent-control-actions">
                  <button className={`button ${paused ? "button-primary" : "button-secondary"}`} type="button" onClick={paused ? onResume : onPause} disabled={busy}>
                    {busy ? <Loader2 className="spin" size={15} /> : paused ? <Play size={15} /> : <Pause size={15} />}
                    {busy ? "Updating…" : paused ? "Resume Navo" : "Pause Navo"}
                  </button>
                  {mission ? <Link className="button button-secondary" href={`/app/missions/${mission.id}`} onClick={onClose}>Mission controls</Link> : <button className="button button-secondary" type="button" disabled>No current mission</button>}
                </div>
              </section>

              <section className="agent-policy-list">
                <div><ShieldCheck size={15} /><span><strong>Approval policy</strong><small>{snapshot.approvalPolicy.replaceAll("_", " ")}</small></span><b>On</b></div>
                <div><Clock3 size={15} /><span><strong>Daily schedule</strong><small>{snapshot.schedule}</small></span><b>{snapshot.maxDailyActions}/day</b></div>
                <div><Target size={15} /><span><strong>Test mode</strong><small>{snapshot.emailSinkEnabled ? "Email delivery is isolated to EmailSink" : "EmailSink is disabled"}</small></span><b>{snapshot.testMode ? "On" : "Off"}</b></div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
