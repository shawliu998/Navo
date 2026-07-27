import Link from "next/link";
import { Activity, ArrowRight, GitBranch, Plus, Target, Workflow } from "lucide-react";
import { DEMO_WORKSPACE_ID, getMissions, getPlays } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader, StatusBadge } from "@navo/ui";

export const metadata = { title: "Playbooks" };

export default async function PlaysPage() {
  const [plays, missions] = await Promise.all([getPlays(DEMO_WORKSPACE_ID), getMissions(DEMO_WORKSPACE_ID)]);
  const published = plays.filter((play) => play.activeVersionId);
  const reused = plays.filter((play) => missions.some((mission) => mission.playId === play.id));

  return <div className="page">
    <PageHeader eyebrow="REUSABLE EXECUTION" title="Playbooks" description="Package research, qualification, approval, and follow-up into reusable versions, then track how Missions use them." actions={<Link href="/app/plays/new" className="button button-primary"><Plus size={15}/>Create playbook</Link>}/>
    <section className="metrics-grid">
      <MetricCard label="Playbooks" value={plays.length} helper={`${published.length} have a published version`} icon={<Workflow size={14}/>}/>
      <MetricCard label="Used by missions" value={reused.length} helper={`${missions.filter((mission) => mission.playId).length} mission assignments`} icon={<Target size={14}/>}/>
      <MetricCard label="Active" value={plays.filter((play) => play.status === "ACTIVE").length} helper="Available for execution" icon={<Activity size={14}/>}/>
    </section>
    <div className="stack">{plays.map((play) => {
      const usages = missions.filter((mission) => mission.playId === play.id);
      return <article className="card" key={play.id}>
        <div className="card-header">
          <div className="company-cell"><span className="company-logo"><GitBranch size={15}/></span><span className="company-meta"><Link href={`/app/plays/${play.id}/builder`}><strong>{play.name}</strong></Link><small>{play.description ?? "No description"}</small></span></div>
          <div className="toolbar-group"><StatusBadge status={play.status}/><Link className="icon-button" href={`/app/plays/${play.id}/builder`} aria-label={`Open ${play.name}`}><ArrowRight size={14}/></Link></div>
        </div>
        <div className="detail-grid" style={{marginTop: 14}}>
          <div className="guardrail-item"><small>Published version</small><strong>{play.activeVersionId ? "Available" : "Not published"}</strong><span className="muted">{play.draftVersionId ? "Draft changes in progress" : "No draft changes"}</span></div>
          <div className="guardrail-item"><small>Observed performance</small><strong>{play.successRate == null ? "No success rate yet" : `${play.successRate}% success`}</strong><span className="muted">{play.lastRunAt ? `Last run ${play.lastRunAt.toLocaleDateString("en-US")}` : "Never run"}</span></div>
          <div className="guardrail-item"><small>Owner</small><strong>{play.ownerName ?? "Unassigned"}</strong><span className="muted">Workspace scoped</span></div>
        </div>
        <div style={{marginTop: 14}}>
          <div className="card-header"><div><h3>Mission usage</h3><span className="card-subtitle">{usages.length ? `${usages.length} mission${usages.length === 1 ? "" : "s"} use this playbook` : "Not assigned to a mission"}</span></div>{usages.length > 0 && <Badge tone="accent">{usages.length} uses</Badge>}</div>
          {usages.length > 0 ? usages.map((mission) => <Link href={`/app/missions/${mission.id}`} className="list-row" key={mission.id}><span><strong>{mission.name}</strong><small className="muted" style={{display: "block"}}>{mission.currentStep ?? mission.objective}</small></span><span className="toolbar-group"><Badge tone="neutral">{mission.progress}%</Badge><StatusBadge status={mission.status}/></span></Link>) : <p className="muted" style={{fontSize: 12, marginBottom: 0}}>Assign this playbook when creating a mission to reuse its published execution graph.</p>}
        </div>
      </article>;
    })}</div>
    <div className="alert alert-info" style={{marginTop: 14}}><Activity size={17}/><span>Published versions are immutable. Editing an active playbook creates a new draft while existing Missions retain their original execution link.</span></div>
  </div>;
}
