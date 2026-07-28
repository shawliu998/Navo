"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, MessageSquare, MoreHorizontal, RotateCcw, X } from "lucide-react";

type ApprovalEditorProps = {
  approvalId: string;
  subject: string;
  body: string;
  status: string;
  contactName?: string | null;
  contactTitle?: string | null;
  missionName?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
  reason?: string | null;
};

export function ApprovalEditor({ approvalId, subject, body, status, contactName, contactTitle, missionName, reviewerName, reviewedAt, reason }: ApprovalEditorProps) {
  const router = useRouter();
  const [editedSubject, setSubject] = useState(subject);
  const [editedBody, setBody] = useState(body);
  const [changeRequest, setChangeRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = editedSubject !== subject || editedBody !== body;
  const pending = status === "PENDING";
  const statusLabel = status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const reviewedLabel = reviewedAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(reviewedAt)) : "Decision time unavailable";

  async function decide(status: "APPROVED" | "APPROVED_WITH_CHANGES" | "CHANGES_REQUESTED" | "REJECTED") {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/approvals/${approvalId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        editedSubject,
        editedBody,
        reason: status === "CHANGES_REQUESTED" ? changeRequest.trim() || "Reviewer requested changes." : status === "REJECTED" ? "Reviewer rejected the draft." : changed ? "Reviewer improved clarity." : undefined,
      }),
    });
    setBusy(false);
    if (response.ok) {
      router.push("/app/approvals?updated=1");
      router.refresh();
      return;
    }
    setError("This approval changed while you were reviewing it. Refresh and try again.");
  }

  return <aside className="approval-decision-panel" aria-label="Approval decision">
    <div className="approval-decision-scroll">
      <header className="approval-decision-header">
        <h2>{pending ? "Decision" : "Decision recorded"}</h2>
        <p>{pending ? "Review exactly what will change before approving." : "This human checkpoint is complete and now read-only."}</p>
      </header>

      <section className="approval-decision-section">
        <span className="approval-field-label">Proposed recipient</span>
        <strong>{contactName ?? "Named account contact"}</strong>
        <small>{contactTitle ?? "Role pending confirmation"}</small>
      </section>

      <section className="approval-decision-section">
        <span className="approval-field-label">What approval allows</span>
        <p>Approve this draft for the controlled test delivery step in {missionName ?? "the current mission"}. Suppression and evidence checks still run afterward.</p>
      </section>

      {pending ? <>
        <label className="approval-change-field">
          <span className="approval-field-label">Request changes</span>
          <span className="approval-change-input"><MessageSquare size={14} /><input value={changeRequest} onChange={(event) => setChangeRequest(event.target.value)} placeholder="Add a required change or constraint…" /></span>
        </label>

        <details className="approval-edit-disclosure">
          <summary><span>Edit proposed message{changed ? " · Modified" : ""}</span><ChevronDown size={14} /></summary>
          <div className="approval-edit-fields">
            <label><span>Subject</span><input value={editedSubject} onChange={(event) => setSubject(event.target.value)} /></label>
            <label><span>Body</span><textarea value={editedBody} onChange={(event) => setBody(event.target.value)} /></label>
            <div className="approval-edit-meta"><span>{editedBody.trim().split(/\s+/).length} words · {editedBody.length} characters</span>{changed ? <button type="button" onClick={() => { setSubject(subject); setBody(body); }}><RotateCcw size={12} />Reset</button> : null}</div>
          </div>
        </details>
      </> : <section className="approval-decision-section approval-outcome">
        <span className="approval-field-label">Decision outcome</span>
        <strong>{statusLabel}</strong>
        <small>{reason ?? "The reviewer accepted the proposed action after validating its evidence and recipient."}</small>
      </section>}

      <section className="approval-decision-section approval-log">
        <span className="approval-field-label">Decision log</span>
        <div><small>{pending ? "Now · Navo proposed this action" : reviewedLabel}</small><strong>{pending ? "Awaiting decision from 刘晓岚" : `${statusLabel} by ${reviewerName ?? "workspace reviewer"}`}</strong></div>
      </section>

      {error ? <p className="approval-error" role="alert">{error}</p> : null}
    </div>

    {pending ? <footer className="approval-decision-footer">
      <details className="approval-options">
        <summary aria-label="More approval options"><MoreHorizontal size={16} /></summary>
        <button type="button" disabled={busy} onClick={() => decide("REJECTED")}><X size={13} />Reject action</button>
      </details>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => decide("CHANGES_REQUESTED")}>Request changes</button>
      <button className="button button-primary" type="button" disabled={busy} onClick={() => decide(changed ? "APPROVED_WITH_CHANGES" : "APPROVED")}><Check size={14} />Approve</button>
    </footer> : <footer className="approval-decision-footer approval-decision-footer-complete"><Check size={14} /><span>Human checkpoint complete</span></footer>}
  </aside>;
}
