"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

export type AgentCommandProposal = {
  name: string;
  objective: string;
  missionType: string;
  targetScope: string;
  recommendedPlaybook: string;
  planSteps: string[];
  expectedOutputs: string[];
  estimatedAccounts: number;
  estimatedCost: number;
  riskLevel: string;
  approvalRequirements: string[];
  operatingMode: "APPROVAL_CONTROLLED";
  testMode: boolean;
};

type RequestState = "idle" | "previewing" | "creating";

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}

export function AgentCommandComposer({
  initialCommand = "",
  compact = false,
  onCreated,
}: {
  initialCommand?: string;
  compact?: boolean;
  onCreated?: (missionId: string) => void;
}) {
  const [command, setCommand] = useState(initialCommand);
  const [proposal, setProposal] = useState<AgentCommandProposal | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const preview = async () => {
    const trimmed = command.trim();
    if (trimmed.length < 8) {
      setError("Describe the outcome in at least 8 characters.");
      return;
    }
    setRequestState("previewing");
    setError(null);
    try {
      const response = await fetch("/api/agent/commands/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: trimmed }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: AgentCommandProposal } | null;
      if (!response.ok || !payload?.data) throw new Error(errorMessage(payload, "Navo could not prepare this proposal."));
      setProposal(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Navo could not prepare this proposal.");
    } finally {
      setRequestState("idle");
    }
  };

  const createMission = async (status: "DRAFT" | "ACTIVE") => {
    if (!proposal) return;
    setRequestState("creating");
    setError(null);
    try {
      const response = await fetch("/api/agent/commands/create-mission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: proposal.objective, name: proposal.name, status }),
      });
      const payload = (await response.json().catch(() => null)) as { missionId?: string } | null;
      if (!response.ok || !payload?.missionId) throw new Error(errorMessage(payload, "The mission could not be created."));
      onCreated?.(payload.missionId);
      router.push(`/app/missions/${payload.missionId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The mission could not be created.");
      setRequestState("idle");
    }
  };

  const busy = requestState !== "idle";

  return (
    <section className={compact ? undefined : "card"} aria-label="Give Navo a command" style={compact ? undefined : { padding: 20 }}>
      {!compact && (
        <div className="card-header" style={{ marginBottom: 12 }}>
          <div>
            <h2 style={{ display: "flex", alignItems: "center", gap: 7 }}><Sparkles size={16} /> Give Navo an outcome</h2>
            <span className="card-subtitle">Preview the scope, plan, cost and approval gates before a mission is created.</span>
          </div>
          <span className="badge badge-accent">Command center</span>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void preview();
        }}
        style={{ display: "flex", gap: 8, alignItems: compact ? "center" : "stretch" }}
      >
        {compact ? (
          <input
            className="input"
            value={command}
            onChange={(event) => { setCommand(event.target.value); setProposal(null); setError(null); }}
            placeholder="Ask Navo to research, qualify or follow up…"
            aria-label="Command"
            autoFocus
            style={{ flex: 1 }}
          />
        ) : (
          <textarea
            className="input"
            value={command}
            onChange={(event) => { setCommand(event.target.value); setProposal(null); setError(null); }}
            placeholder="For example: Research 20 DACH packaging equipment companies, qualify the strongest expansion signals, and prepare approval-ready drafts."
            aria-label="Command"
            rows={3}
            style={{ flex: 1, resize: "vertical", minHeight: 76, paddingTop: 11, lineHeight: 1.5 }}
          />
        )}
        <button className="button button-primary" type="submit" disabled={busy || command.trim().length < 8} style={compact ? undefined : { height: 76 }}>
          {requestState === "previewing" ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
          {requestState === "previewing" ? "Planning…" : "Preview plan"}
        </button>
      </form>

      {error && <div className="alert alert-danger" role="alert" style={{ marginTop: 10 }}><AlertTriangle size={15} /><span>{error}</span></div>}

      {proposal && (
        <article className="command-result-card" style={{ margin: "14px 0 0" }}>
          <header>
            <span className="command-result-icon"><Target size={16} /></span>
            <span><small>Mission proposal</small><strong>{proposal.name}</strong></span>
            <span className="badge badge-warning">Review first</span>
          </header>
          <div className="command-result-body">
            <div><span>Objective</span><strong>{proposal.objective}</strong></div>
            <div><span>Scope</span><strong>{proposal.targetScope} · {proposal.estimatedAccounts} accounts</strong></div>
            <div><span>Playbook</span><strong>{proposal.recommendedPlaybook}</strong></div>
            <div>
              <span>Plan</span>
              <strong>{proposal.planSteps.map((step, index) => `${index + 1}. ${step}`).join("  ·  ")}</strong>
            </div>
            <div><span>Outputs</span><strong>{proposal.expectedOutputs.join(" · ")}</strong></div>
            <div>
              <span>Controls</span>
              <strong style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span className="badge badge-success"><ShieldCheck size={11} /> Approval controlled</span>
                <span className="badge badge-info"><CheckCircle2 size={11} /> Test mode</span>
                <span className="badge badge-neutral"><DollarSign size={11} /> Est. ${proposal.estimatedCost.toFixed(3)}</span>
              </strong>
            </div>
          </div>
          <footer>
            <button className="button button-primary" type="button" onClick={() => void createMission("ACTIVE")} disabled={busy}>
              {requestState === "creating" ? <Loader2 className="spin" size={14} /> : <ArrowRight size={14} />}
              Create and start mission
            </button>
            <button className="button button-secondary" type="button" onClick={() => void createMission("DRAFT")} disabled={busy}>
              Save as draft
            </button>
            <button className="button button-ghost" type="button" onClick={() => setProposal(null)} disabled={busy}>Edit command</button>
          </footer>
        </article>
      )}
    </section>
  );
}
