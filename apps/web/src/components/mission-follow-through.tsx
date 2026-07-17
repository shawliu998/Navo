"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ClipboardPlus, FilePenLine, Loader2, RotateCcw, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CompletionBrief } from "@/lib/mission-completion-brief";
import { getDraftComparison } from "@/lib/draft-comparison";

function messageFrom(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : fallback;
}
const sourceLabel = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0] ?? url;

export function MissionCompletionBrief({ brief, missionId }: { brief: CompletionBrief; missionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"task" | "retry" | null>(null);
  const [notice, setNotice] = useState("");
  const objective = "Re-research this selected account using its public website, save literal evidence, qualify fit, and prepare a DRAFT-only outreach message.";
  const createTask = async () => {
    setBusy("task"); setNotice("");
    try {
      const response = await fetch(`/api/missions/${missionId}/follow-up-task`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { meta?: { created?: boolean } } | null;
      if (!response.ok) throw new Error(messageFrom(payload, "Could not create a follow-up task."));
      setNotice(payload?.meta?.created ? "Follow-up task created. No message was sent." : "A follow-up task already exists for this mission.");
      router.refresh();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not create a follow-up task."); }
    finally { setBusy(null); }
  };
  const retry = async () => {
    setBusy("retry"); setNotice("");
    try {
      const response = await fetch(`/api/missions/${missionId}/retry`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { missionId?: string } | null;
      if (!response.ok || !payload?.missionId) throw new Error(messageFrom(payload, "Could not create a retry mission."));
      router.push(`/app/missions/${payload.missionId}`); router.refresh();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not create a retry mission."); }
    finally { setBusy(null); }
  };
  const title = brief.state === "completed" ? "Agent Completion Brief" : brief.state === "failed" ? "Agent Failure Brief" : "Agent Delivery Brief";
  return <section className="card" aria-label="Agent Completion Brief" style={{ borderColor: brief.state === "failed" ? "var(--danger)" : "var(--accent)", marginBottom: 18 }}>
    <div className="card-header"><div><span className="eyebrow">NAVO DELIVERY</span><h2>{title}</h2></div><span className={`badge ${brief.state === "completed" ? "badge-success" : brief.state === "failed" ? "badge-warning" : "badge-neutral"}`}>{brief.state.toUpperCase()}</span></div>
    <p className="summary-text">{brief.conclusion}</p>
    {brief.state === "completed" && <div className="command-result-body"><div><span>Qualification</span><strong>{brief.qualified === null ? "Not available" : brief.qualificationStatus === "REVIEW" ? "Needs review" : brief.qualified ? "Qualified" : "Not qualified"}{brief.score !== null ? ` · ${brief.score}/100` : ""}</strong></div>{brief.findings.length > 0 && <div><span>Key findings</span><strong>{brief.findings.join(" · ")}</strong></div>}<div><span>Evidence</span><strong>{brief.evidenceCount} persisted item{brief.evidenceCount === 1 ? "" : "s"}{brief.sourceUrls.length > 0 && <> · {brief.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" style={{ marginRight: 7 }}>{sourceLabel(url)}</a>)}</>}</strong></div>{brief.risks.length > 0 && <div><span>Risks</span><strong>{brief.risks.join(" · ")}</strong></div>}{brief.draftSubject && <div><span>DRAFT subject</span><strong>{brief.draftSubject}</strong></div>}<div><span>Recommended next step</span><strong>{brief.recommendedNextStep}</strong></div></div>}
    {brief.state !== "completed" && brief.risks.length > 0 && <div className="alert alert-warning">{brief.risks[0]}</div>}
    <div className="page-actions" style={{ marginTop: 14, flexWrap: "wrap" }}>
      {brief.accountId && <Link className="button button-secondary" href={`/app/missions/new?accountId=${encodeURIComponent(brief.accountId)}&objective=${encodeURIComponent(objective)}`}><RotateCcw size={14}/>Research again</Link>}
      {brief.state === "completed" && <button className="button button-primary" type="button" onClick={() => void createTask()} disabled={busy !== null}>{busy === "task" ? <Loader2 className="spin" size={14}/> : <ClipboardPlus size={14}/>}Create follow-up task</button>}
      {brief.state === "failed" && <button className="button button-primary" type="button" onClick={() => void retry()} disabled={busy !== null}>{busy === "retry" ? <Loader2 className="spin" size={14}/> : <RotateCcw size={14}/>}Retry as new mission</button>}
    </div>
    {notice && <p className="muted" role="status" style={{ margin: "10px 0 0" }}><CheckCircle2 size={13} style={{ verticalAlign: "-2px" }}/> {notice}</p>}
  </section>;
}

export function DraftMessageEditor({ missionId, message }: { missionId: string; message: { id: string; subject: string; body: string; originalSubject?: string | null; originalBody?: string | null; updatedAt: string; revision: number } }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false); const [subject, setSubject] = useState(message.subject); const [body, setBody] = useState(message.body); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const comparison = getDraftComparison({ originalSubject: message.originalSubject, originalBody: message.originalBody, currentSubject: subject, currentBody: body });
  const lastUpdated = new Date(message.updatedAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
  const cancel = () => { setSubject(message.subject); setBody(message.body); setError(""); setEditing(false); };
  const save = async () => {
    if (!subject.trim() || !body.trim()) return setError("Subject and body cannot be empty.");
    if (body.trim().length > 4_000) return setError("Draft body must be 4,000 characters or fewer.");
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/missions/${missionId}/draft`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: message.id, subject, body, revision: message.revision }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageFrom(payload, "Could not save this DRAFT."));
      setEditing(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this DRAFT."); }
    finally { setBusy(false); }
  };
  const comparisonBlock = comparison.showOriginal && <details className="draft-comparison">
    <summary>Original vs Current <span className="badge badge-neutral">Original is read-only</span></summary>
    <div className="draft-comparison-grid">
      <article><div className="draft-comparison-label">Original</div><strong>{comparison.originalSubject}</strong><p>{comparison.originalBody}</p></article>
      <article><div className="draft-comparison-label">Current</div><strong>{comparison.currentSubject}</strong><p>{comparison.currentBody}</p></article>
    </div>
  </details>;
  const currentDraft = <><strong>{subject}</strong><p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{body}</p></>;
  return <div className="draft-editor-shell">
    <div className="draft-meta"><span>Current revision</span><strong>{lastUpdated}</strong><span className="badge badge-neutral">DRAFT only · no email sent</span></div>
    {comparisonBlock}
    {!editing ? <>{currentDraft}<button className="button button-secondary" type="button" onClick={() => setEditing(true)}><FilePenLine size={14}/>Edit draft</button></> : <div className="stack" style={{ gap: 10 }}><label className="field"><span>Subject</span><input value={subject} maxLength={180} onChange={(event) => setSubject(event.target.value)} /></label><label className="field"><span>Body</span><textarea value={body} maxLength={4_000} rows={9} onChange={(event) => setBody(event.target.value)} /><small className="muted">{body.length}/4000 · DRAFT only, no email is sent.</small></label>{error && <div className="alert alert-warning" role="alert">{error}</div>}<div className="page-actions"><button className="button button-primary" type="button" onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="spin" size={14}/> : <Save size={14}/>}Save draft</button><button className="button button-ghost" type="button" onClick={cancel} disabled={busy}><X size={14}/>Cancel</button></div></div>}
  </div>;
}
