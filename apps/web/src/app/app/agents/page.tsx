import Link from "next/link";
import { Activity, Bot, CheckCircle2, Clock3, Cpu, Target } from "lucide-react";
import { DEMO_WORKSPACE_ID, getAgentStatus, getMission, getMissions } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader, StatusBadge } from "@navo/ui";
import { DirectorConfigForm } from "@/components/director-config-form";

export const metadata = { title: "Capabilities" };

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString() : "Not scheduled";
}

function directorDecision(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const decision = value as { action?: unknown; reason?: unknown };
  return {
    action: typeof decision.action === "string" ? decision.action.replaceAll("_", " ") : "No decision yet",
    reason: typeof decision.reason === "string" ? decision.reason : null,
  };
}

export default async function CapabilitiesPage() {
  const [missions, agent] = await Promise.all([getMissions(DEMO_WORKSPACE_ID), getAgentStatus(DEMO_WORKSPACE_ID)]);
  const details = await Promise.all(missions.slice(0, 30).map((mission) => getMission(DEMO_WORKSPACE_ID, mission.id)));
  const observed = new Map<string, { label: string; attempts: number; completed: number; failed: number; skipped: number; providers: Set<string>; lastMissionId: string }>();
  for (const detail of details) {
    if (!detail) continue;
    for (const step of detail.steps) {
      const id = step.relatedPlayNodeId ?? step.title;
      const item = observed.get(id) ?? { label: step.title, attempts: 0, completed: 0, failed: 0, skipped: 0, providers: new Set<string>(), lastMissionId: detail.mission.id };
      item.attempts += ["COMPLETED", "FAILED", "SKIPPED"].includes(step.status) ? 1 : 0;
      item.completed += step.status === "COMPLETED" ? 1 : 0;
      item.failed += step.status === "FAILED" ? 1 : 0;
      item.skipped += step.status === "SKIPPED" ? 1 : 0;
      if (detail.mission.provider) item.providers.add(detail.mission.provider);
      item.lastMissionId = detail.mission.id;
      observed.set(id, item);
    }
  }
  const items = [...observed.entries()].sort((a, b) => b[1].attempts - a[1].attempts || a[1].label.localeCompare(b[1].label));
  const attempts = items.reduce((sum, [, item]) => sum + item.attempts, 0);
  const completed = items.reduce((sum, [, item]) => sum + item.completed, 0);
  const missionTypes = new Set(missions.map((mission) => mission.type)).size;
  const profile = agent.profile;
  const decision = directorDecision(profile?.lastDirectorDecision);

  return <div className="page">
    <PageHeader eyebrow="MISSION RUNTIME" title="Capabilities" description="Capabilities observed from immutable Mission plans and their registered execution steps. Legacy Play node runs are intentionally excluded." actions={<Link className="button button-primary" href="/app/missions/new"><Target size={15}/>Create mission</Link>}/>
    <section className="metrics-grid">
      <MetricCard label="Observed capabilities" value={items.length} helper={`${missions.length} missions sampled`} icon={<Bot size={14}/>}/>
      <MetricCard label="Executed steps" value={attempts} helper="Completed, failed or skipped" icon={<Activity size={14}/>}/>
      <MetricCard label="Completion rate" value={`${Math.round(completed / Math.max(attempts, 1) * 100)}%`} helper={`${completed} completed`} icon={<CheckCircle2 size={14}/>}/>
      <MetricCard label="Mission types" value={missionTypes} helper="Observed runtime scopes" icon={<Target size={14}/>}/>
    </section>
    <section className="card" style={{ marginBottom: 14 }}>
      <div className="card-header">
        <div><h2>Agent Director</h2><span className="card-subtitle">Autonomous root-Mission scheduling and guardrails</span></div>
        <Badge tone={profile?.directorEnabled ? "success" : "neutral"}>{profile?.directorEnabled ? "Enabled" : "Disabled"}</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <div className="guardrail-item"><small>Last decision</small><strong style={{ textTransform: "capitalize" }}>{decision?.action ?? "No decision yet"}</strong><span className="muted">{decision?.reason ?? "The Director has not evaluated this workspace."}</span></div>
        <div className="guardrail-item"><small>Next tick</small><strong>{formatDate(profile?.nextDirectorTickAt)}</strong><span className="muted"><Clock3 size={12} /> Scheduled by the worker</span></div>
        <div className="guardrail-item"><small>Interval / cooldown</small><strong>{profile?.directorIntervalMinutes ?? 15}m / {profile?.directorCooldownMinutes ?? 60}m</strong><span className="muted">Checks / new-root Mission pause</span></div>
        <div className="guardrail-item"><small>Daily limit</small><strong>{profile?.directorDailyMissionLimit ?? 3} root Missions</strong><span className="muted">Max {profile?.directorMaxActiveMissions ?? 1} active at once</span></div>
      </div>
      <DirectorConfigForm initialConfig={{
        enabled: profile?.directorEnabled ?? false,
        intervalMinutes: profile?.directorIntervalMinutes ?? 15,
        cooldownMinutes: profile?.directorCooldownMinutes ?? 60,
        maxActiveMissions: profile?.directorMaxActiveMissions ?? 1,
        dailyMissionLimit: profile?.directorDailyMissionLimit ?? 3,
      }} />
    </section>
    {items.length ? <div className="integration-grid">{items.map(([id, item]) => <article className="integration-card" key={id}>
      <div className="integration-icon"><Cpu size={18}/></div>
      <div className="card-header"><div><h3>{item.label}</h3><small className="muted mono">{id}</small></div><StatusBadge status={item.failed ? "REVIEW" : item.completed ? "ACTIVE" : "WAITING"}/></div>
      <div className="guardrail-item"><small>Completed / attempts</small><strong>{item.completed}/{item.attempts}</strong></div>
      <div className="guardrail-item"><small>Skipped / failed</small><strong>{item.skipped} / {item.failed}</strong></div>
      <div className="guardrail-item"><small>Providers</small><strong>{[...item.providers].join(", ") || "Not executed"}</strong></div>
      <div className="toolbar-group" style={{marginTop:12}}><Badge tone="neutral">Mission step</Badge><Link className="muted" href={`/app/missions/${item.lastMissionId}`}>Latest mission</Link></div>
    </article>)}</div> : <div className="empty-state"><Bot/><strong>No Mission capability data yet</strong><p>Create and run a Mission to observe registered capabilities.</p></div>}
  </div>;
}
