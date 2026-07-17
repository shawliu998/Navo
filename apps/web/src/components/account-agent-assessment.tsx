"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

type Assessment = { objective?: string; reasoning?: string[] };

export function AccountAgentAssessment({ accountName, qualification, fitScore, mission, whySelected, nextAction }: {
  accountName: string;
  qualification: string;
  fitScore: number | null;
  mission: { id: string; name: string; status: string } | null;
  whySelected: string | null;
  nextAction: string | null;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function askNavo() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/commands/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: `Assess ${accountName} and recommend the safest next best action using current evidence and memory.` }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Navo could not prepare an assessment.");
      setAssessment(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Navo could not prepare an assessment.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card agent-assessment-card" data-testid="account-agent-assessment">
    <div className="card-header"><div><span className="eyebrow">NAVO ASSESSMENT</span><h2>What Navo thinks</h2></div><span className="badge badge-accent"><Sparkles size={12}/>Evidence-aware</span></div>
    <div className="agent-assessment-score"><strong>{fitScore ?? "—"}</strong><span><b>{qualification.replaceAll("_", " ")}</b><small>{whySelected ?? "Ready for a structured evidence review."}</small></span></div>
    <div className="agent-assessment-next"><small>Recommended next action</small><strong>{nextAction ?? "Review account fit and evidence quality"}</strong></div>
    {mission&&<Link className="agent-mission-link" href={`/app/missions/${mission.id}`}><span><small>Related mission · {mission.status}</small><strong>{mission.name}</strong></span><ArrowRight size={14}/></Link>}
    {assessment&&<div className="agent-assessment-result" role="status"><strong>{assessment.objective}</strong><ul>{assessment.reasoning?.slice(0,3).map(reason=><li key={reason}>{reason}</li>)}</ul></div>}
    {error&&<div className="alert alert-warning" role="alert">{error}</div>}
    <button className="button button-primary" type="button" onClick={askNavo} disabled={busy}>{busy?<Loader2 className="spin" size={14}/>:<Sparkles size={14}/>} {assessment?"Refresh assessment":"Ask Navo about this account"}</button>
  </section>;
}
