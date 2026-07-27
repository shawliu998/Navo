"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export function AccountAgentAssessment({ accountId, accountName, qualification, fitScore, mission, whySelected, nextAction }: {
  accountId: string;
  accountName: string;
  qualification: string;
  fitScore: number | null;
  mission: { id: string; name: string; status: string } | null;
  whySelected: string | null;
  nextAction: string | null;
}) {
  const objective = `Assess ${accountName} and recommend the safest next best action using current evidence and memory.`;
  return <section className="card agent-assessment-card" data-testid="account-agent-assessment">
    <div className="card-header"><div><span className="eyebrow">NAVO ASSESSMENT</span><h2>What Navo thinks</h2></div><span className="badge badge-accent"><Sparkles size={12}/>Evidence-aware</span></div>
    <div className="agent-assessment-score"><strong>{fitScore ?? "—"}</strong><span><b>{qualification.replaceAll("_", " ")}</b><small>{whySelected ?? "Ready for a structured evidence review."}</small></span></div>
    <div className="agent-assessment-next"><small>Recommended next action</small><strong>{nextAction ?? "Review account fit and evidence quality"}</strong></div>
    {mission&&<Link className="agent-mission-link" href={`/app/missions/${mission.id}`}><span><small>Related mission · {mission.status}</small><strong>{mission.name}</strong></span><ArrowRight size={14}/></Link>}
    <Link className="button button-primary" href={`/app/missions/new?accountId=${encodeURIComponent(accountId)}&objective=${encodeURIComponent(objective)}`}><Sparkles size={14}/>Ask Navo about this account</Link>
  </section>;
}
