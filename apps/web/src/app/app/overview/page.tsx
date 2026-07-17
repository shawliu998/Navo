import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Clock3,
  ListChecks,
  MessageSquareReply,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { DEMO_WORKSPACE_ID, getAgentStatus, getOverview } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader, StatusBadge } from "@navo/ui";
import { AgentCommandComposer } from "@/components/agent-command-composer";

export const metadata = { title: "Command Center" };

function relativeTime(value: Date) {
  const seconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1_000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function eventTone(severity: string) {
  if (/ERROR|CRITICAL/.test(severity)) return "danger" as const;
  if (/WARNING/.test(severity)) return "warning" as const;
  return "info" as const;
}

export default async function OverviewPage() {
  const [overview, agent] = await Promise.all([
    getOverview(DEMO_WORKSPACE_ID),
    getAgentStatus(DEMO_WORKSPACE_ID),
  ]);
  const metrics = overview.metrics;
  const mission = agent.currentMission;
  const activeStep = agent.currentPlan.find((step) => step.status === "RUNNING" || step.status === "ACTIVE");
  const completedSteps = agent.currentPlan.filter((step) => step.status === "COMPLETED").length;
  const agentStatus = agent.profile?.status ?? "IDLE";
  const isPaused = agentStatus === "PAUSED";

  return (
    <div className="page">
      <PageHeader
        eyebrow="Navo · Live workspace"
        title="Command Center"
        description="Set an outcome, inspect Navo's live plan, and keep every external action inside an explicit approval boundary."
        actions={(
          <>
            <Link href="/app/missions" className="button button-secondary"><Target size={15} />All missions</Link>
            <Link href="/app/approvals" className="button button-primary"><ListChecks size={15} />Review approvals</Link>
          </>
        )}
      />

      <section className="card" style={{ marginBottom: 14, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <span className="attention-icon" style={{ background: isPaused ? "#fff4df" : "#e9f7f1", color: isPaused ? "var(--warning)" : "var(--success)" }}>
          {isPaused ? <PauseCircle size={17} /> : <Bot size={17} />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: "block", fontSize: 13 }}>{isPaused ? "Navo is paused" : agent.profile?.currentActivity ?? mission?.currentStep ?? "Navo is ready"}</strong>
          <small className="muted">
            {agent.activeMissionCount} active mission{agent.activeMissionCount === 1 ? "" : "s"} · {agent.pendingApprovalCount} pending approval{agent.pendingApprovalCount === 1 ? "" : "s"}
            {agent.profile?.lastHeartbeatAt ? ` · heartbeat ${relativeTime(agent.profile.lastHeartbeatAt)}` : ""}
          </small>
        </span>
        <StatusBadge status={agentStatus} />
      </section>

      <AgentCommandComposer />

      <section className="metrics-grid" style={{ gridTemplateColumns: "repeat(6,minmax(120px,1fr))", marginTop: 14 }}>
        <MetricCard label="Target accounts" value={metrics.imported} icon={<Building2 size={14} />} helper={`${metrics.researched} researched`} />
        <MetricCard label="Qualified" value={metrics.qualified} icon={<Target size={14} />} helper={`${Math.round(metrics.qualified / Math.max(metrics.imported, 1) * 100)}% of accounts`} />
        <MetricCard label="Active missions" value={agent.activeMissionCount} icon={<PlayCircle size={14} />} helper={`${agent.activeMissions.length} open or paused`} />
        <MetricCard label="Pending approvals" value={agent.pendingApprovalCount} icon={<Clock3 size={14} />} helper="Human decision required" />
        <MetricCard label="Positive replies" value={metrics.positive} icon={<MessageSquareReply size={14} />} helper={`${metrics.replies} total replies`} />
        <MetricCard label="Open actions" value={metrics.openTasks} icon={<ListChecks size={14} />} helper={`${metrics.overdueTasks} overdue`} />
      </section>

      <section className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h2>Current mission</h2>
              <span className="card-subtitle">Database-backed mission progress and active step</span>
            </div>
            {mission && <StatusBadge status={mission.status} />}
          </div>
          {mission ? (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
                <div>
                  <Link href={`/app/missions/${mission.id}`} style={{ fontSize: 16, fontWeight: 740 }}>{mission.name}</Link>
                  <p className="muted" style={{ margin: "7px 0 14px", lineHeight: 1.5 }}>{mission.objective}</p>
                </div>
                <strong style={{ fontSize: 24 }}>{mission.progress}%</strong>
              </div>
              <div className="progress" aria-label={`${mission.progress}% mission progress`}><span style={{ width: `${Math.max(0, Math.min(100, mission.progress))}%` }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 13 }}>
                <div className="guardrail-item"><small>Processed</small><strong>{mission.processedCount} / {mission.targetCount}</strong></div>
                <div className="guardrail-item"><small>Qualified</small><strong>{mission.qualifiedCount}</strong></div>
                <div className="guardrail-item"><small>Approvals</small><strong>{mission.pendingApprovalCount}</strong></div>
              </div>
              <div className="alert alert-info" style={{ marginTop: 13 }}>
                <Activity size={15} />
                <span><strong>{activeStep?.title ?? mission.currentStep ?? "Waiting for the next plan step"}</strong>{activeStep?.description ? ` · ${activeStep.description}` : ""}</span>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Target size={24} />
              <strong>No mission is running</strong>
              <p>Give Navo an outcome above to preview a bounded plan.</p>
            </div>
          )}
        </article>

        <article className="card">
          <div className="card-header">
            <div><h2>Needs your attention</h2><span className="card-subtitle">Approvals and operational exceptions</span></div>
            <Link href="/app/approvals" className="muted"><ArrowRight size={16} /></Link>
          </div>
          <div className="attention-list">
            <Link href="/app/approvals" className="attention-item">
              <div className="attention-left"><span className="attention-icon"><Clock3 size={16} /></span><span><strong style={{ display: "block", fontSize: 12 }}>{agent.pendingApprovalCount} actions need approval</strong><small className="muted">Outbound remains blocked until reviewed</small></span></div><ArrowRight size={14} className="muted" />
            </Link>
            <Link href="/app/tasks" className="attention-item">
              <div className="attention-left"><span className="attention-icon"><ListChecks size={16} /></span><span><strong style={{ display: "block", fontSize: 12 }}>{metrics.openTasks} open next actions</strong><small className="muted">{metrics.overdueTasks} are overdue</small></span></div><ArrowRight size={14} className="muted" />
            </Link>
            <div className="attention-item">
              <div className="attention-left"><span className="attention-icon" style={{ background: "#e9f7f1", color: "var(--success)" }}><ShieldCheck size={16} /></span><span><strong style={{ display: "block", fontSize: 12 }}>Approval-controlled mode</strong><small className="muted">{agent.preferences?.testMode === false ? "Live delivery policy applies" : "Email delivery is isolated to EmailSink"}</small></span></div><CheckCircle2 size={14} className="success-text" />
            </div>
          </div>
        </article>
      </section>

      <section className="bottom-grid">
        <article className="card">
          <div className="card-header"><div><h2>Execution plan</h2><span className="card-subtitle">{completedSteps} of {agent.currentPlan.length} steps completed</span></div></div>
          {agent.currentPlan.slice(0, 6).map((step) => (
            <div className="list-row" key={step.id}>
              <span><strong style={{ display: "block", fontSize: 12 }}>{step.order}. {step.title}</strong><small className="muted">{step.description ?? "No additional detail"}</small></span>
              <StatusBadge status={step.status} />
            </div>
          ))}
          {!agent.currentPlan.length && <p className="muted">A plan will appear when a mission is created.</p>}
        </article>

        <article className="card">
          <div className="card-header"><div><h2>Agent activity</h2><span className="card-subtitle">Latest persisted events</span></div><Link href="/app/runs" className="muted">View runs</Link></div>
          {agent.recentEvents.slice(0, 5).map((event) => (
            <div className="list-row" key={event.id}>
              <span><strong style={{ display: "block", fontSize: 12 }}>{event.title}</strong><small className="muted">{relativeTime(event.occurredAt)}{event.description ? ` · ${event.description}` : ""}</small></span>
              <Badge tone={eventTone(event.severity)}>{event.severity}</Badge>
            </div>
          ))}
          {!agent.recentEvents.length && <p className="muted">No agent events have been recorded yet.</p>}
        </article>

        <article className="card">
          <div className="card-header"><div><h2>Top playbooks</h2><span className="card-subtitle">Most recently used workspace plays</span></div><Sparkles size={15} className="muted" /></div>
          {overview.topPlays.slice(0, 4).map((play) => (
            <Link href={`/app/plays/${play.id}/builder`} className="list-row" key={play.id}>
              <span><strong style={{ display: "block", fontSize: 12 }}>{play.name}</strong><small className="muted">{play.successRate ? `${play.successRate}% success` : "No completed runs yet"}</small></span>
              <StatusBadge status={play.status} />
            </Link>
          ))}
        </article>
      </section>
    </div>
  );
}
