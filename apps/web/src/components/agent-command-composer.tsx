"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, ShieldCheck, Sparkles, Target } from "lucide-react";
import { hasResearchWebsite } from "@/lib/mission-command";

type AccountOption = { id: string; name: string; website: string | null; domain: string | null; country: string | null; industry: string | null };
type MissionPreview = {
  name: string;
  objective: string;
  provider: string;
  model: string;
  plan: { targetDescription: string; steps: Array<{ id: string; type: string; title: string; description: string }>; expectedOutputs: string[]; assumptions: string[] };
};
type RequestState = "idle" | "previewing" | "creating";
const examples = [
  { label: "Research website", command: "Research this account's public website and identify evidence-backed quality inspection opportunities." },
  { label: "Find buying signals", command: "Find production and automation signals, then qualify fit against our industrial inspection ICP." },
  { label: "Prepare draft", command: "Prepare a concise, evidence-backed outreach draft for the selected account." },
];

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
function accountUrl(account: AccountOption) { return hasResearchWebsite(account.website) ? account.website : null; }

export function AgentCommandComposer({ accounts, initialCommand = "", compact = false, onCreated }: { accounts: AccountOption[]; initialCommand?: string; compact?: boolean; onCreated?: (missionId: string) => void }) {
  const [command, setCommand] = useState(initialCommand);
  const [accountId, setAccountId] = useState("");
  const [previewData, setPreviewData] = useState<MissionPreview | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const account = accounts.find((item) => item.id === accountId);

  const preview = async () => {
    const trimmed = command.trim();
    if (!account) return setError("Select exactly one workspace account before previewing a mission.");
    if (!accountUrl(account)) return setError("The selected account needs a valid website URL before it can be researched.");
    if (trimmed.length < 8) return setError("Describe the outcome in at least 8 characters.");
    setRequestState("previewing"); setError(null);
    try {
      const response = await fetch("/api/agent/commands/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: trimmed }) });
      const payload = await response.json().catch(() => null) as { data?: MissionPreview } | null;
      if (!response.ok || !payload?.data?.plan) throw new Error(errorMessage(payload, "Navo could not prepare this MissionPlan."));
      setPreviewData(payload.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Navo could not prepare this MissionPlan."); }
    finally { setRequestState("idle"); }
  };

  const createMission = async (status: "DRAFT" | "ACTIVE") => {
    if (!previewData || !account) return;
    setRequestState("creating"); setError(null);
    try {
      const response = await fetch("/api/agent/commands/create-mission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: previewData.objective, name: previewData.name, status, accountIds: [account.id], preview: { plan: previewData.plan, provider: previewData.provider, model: previewData.model } }) });
      const payload = await response.json().catch(() => null) as { missionId?: string } | null;
      if (!response.ok || !payload?.missionId) throw new Error(errorMessage(payload, "The mission could not be created."));
      onCreated?.(payload.missionId); router.push(`/app/missions/${payload.missionId}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The mission could not be created."); setRequestState("idle"); }
  };

  const busy = requestState !== "idle";
  const resetCommand = (value: string) => { setCommand(value); setPreviewData(null); setError(null); };
  return <section className={compact ? undefined : "card"} aria-label="Give Navo a command" style={compact ? undefined : { padding: 20 }}>
    {!compact && <div className="card-header" style={{ marginBottom: 12 }}><div><h2 style={{ display: "flex", alignItems: "center", gap: 7 }}><Sparkles size={16} /> Give Navo an outcome</h2><span className="card-subtitle">Select one account, inspect the exact AI MissionPlan, then save a DRAFT-only mission.</span></div><span className="badge badge-accent">Command center</span></div>}
    <div className="field" style={{ marginBottom: 10 }}><label htmlFor="command-account">Target account</label><select id="command-account" value={accountId} onChange={(event) => { setAccountId(event.target.value); setPreviewData(null); setError(null); }}><option value="">Select exactly one account</option>{accounts.map((item) => <option key={item.id} value={item.id} disabled={!accountUrl(item)}>{item.name}{item.country ? ` · ${item.country}` : ""}{accountUrl(item) ? "" : " · website required"}</option>)}</select>{account && <small className="muted" style={{ display: "block", marginTop: 5 }}>{accountUrl(account) ?? "Website required"} · {[account.country, account.industry].filter(Boolean).join(" · ")}</small>}</div>
    {!compact && <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>{examples.map((example) => <button className="button button-secondary" type="button" key={example.label} onClick={() => resetCommand(example.command)} disabled={busy}>{example.label}</button>)}</div>}
    <form onSubmit={(event) => { event.preventDefault(); void preview(); }} style={{ display: "flex", gap: 8, alignItems: compact ? "center" : "stretch" }}>
      {compact ? <input className="input" value={command} onChange={(event) => resetCommand(event.target.value)} placeholder="Ask Navo to research one selected account…" aria-label="Command" autoFocus style={{ flex: 1 }} /> : <textarea className="input" value={command} onChange={(event) => resetCommand(event.target.value)} placeholder="Describe one evidence-backed outcome for the selected account." aria-label="Command" rows={3} style={{ flex: 1, resize: "vertical", minHeight: 76, paddingTop: 11, lineHeight: 1.5 }} />}
      <button className="button button-primary" type="submit" disabled={busy || !account || command.trim().length < 8} style={compact ? undefined : { height: 76 }}>{requestState === "previewing" ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}{requestState === "previewing" ? "Planning…" : "Preview plan"}</button>
    </form>
    {error && <div className="alert alert-danger" role="alert" style={{ marginTop: 10 }}><AlertTriangle size={15} /><span>{error}</span></div>}
    {previewData && account && <article className="command-result-card" style={{ margin: "14px 0 0" }}><header><span className="command-result-icon"><Target size={16} /></span><span><small>Schema-validated MissionPlan</small><strong>{previewData.name}</strong></span><span className="badge badge-success">DRAFT ONLY</span></header><div className="command-result-body"><div><span>Account</span><strong>{account.name} · {accountUrl(account)}</strong></div><div><span>Provider</span><strong>{previewData.provider} · {previewData.model}</strong></div><div><span>Objective</span><strong>{previewData.objective}</strong></div><div><span>Target</span><strong>{previewData.plan.targetDescription}</strong></div><div><span>Steps</span><strong>{previewData.plan.steps.map((step, index) => `${index + 1}. ${step.title} — ${step.description}`).join(" · ")}</strong></div><div><span>Outputs</span><strong>{previewData.plan.expectedOutputs.join(" · ")}</strong></div><div><span>Assumptions</span><strong>{previewData.plan.assumptions.join(" · ") || "None"}</strong></div><div><span>Safety</span><strong style={{ display: "flex", flexWrap: "wrap", gap: 6 }}><span className="badge badge-success"><ShieldCheck size={11} /> DRAFT only</span><span className="badge badge-info"><CheckCircle2 size={11} /> No send</span></strong></div></div><footer><button className="button button-primary" type="button" onClick={() => void createMission("ACTIVE")} disabled={busy}>{requestState === "creating" ? <Loader2 className="spin" size={14} /> : <ArrowRight size={14} />}Create & start mission</button><button className="button button-secondary" type="button" onClick={() => void createMission("DRAFT")} disabled={busy}>Save draft</button><button className="button button-ghost" type="button" onClick={() => setPreviewData(null)} disabled={busy}>Edit command</button></footer></article>}
  </section>;
}
