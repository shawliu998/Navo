import Link from "next/link";
import { Activity, Bot, CheckCircle2, Cpu, Target } from "lucide-react";
import { DEMO_WORKSPACE_ID, getMission, getMissions } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader, StatusBadge } from "@navo/ui";

export const metadata = { title: "Capabilities" };

export default async function CapabilitiesPage() {
  const missions = await getMissions(DEMO_WORKSPACE_ID);
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

  return <div className="page">
    <PageHeader eyebrow="MISSION RUNTIME" title="Capabilities" description="Capabilities observed from immutable Mission plans and their registered execution steps. Legacy Play node runs are intentionally excluded." actions={<Link className="button button-primary" href="/app/missions/new"><Target size={15}/>Create mission</Link>}/>
    <section className="metrics-grid">
      <MetricCard label="Observed capabilities" value={items.length} helper={`${missions.length} missions sampled`} icon={<Bot size={14}/>}/>
      <MetricCard label="Executed steps" value={attempts} helper="Completed, failed or skipped" icon={<Activity size={14}/>}/>
      <MetricCard label="Completion rate" value={`${Math.round(completed / Math.max(attempts, 1) * 100)}%`} helper={`${completed} completed`} icon={<CheckCircle2 size={14}/>}/>
      <MetricCard label="Mission types" value={missionTypes} helper="Observed runtime scopes" icon={<Target size={14}/>}/>
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
