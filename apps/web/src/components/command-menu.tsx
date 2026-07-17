"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bot,
  Building2,
  Command,
  FileText,
  ListChecks,
  Loader2,
  MessageSquareText,
  Search,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import type { AgentCommandProposal } from "./agent-command-composer";

type CommandAction = {
  label: string;
  hint: string;
  href: string;
  icon: typeof Search;
  group: "Ask Navo" | "Navigate";
  keywords: string;
};

const actions: CommandAction[] = [
  {
    label: "Research this account",
    hint: "Build an evidence-backed account brief",
    href: "/app/accounts",
    icon: Building2,
    group: "Ask Navo",
    keywords: "research account evidence investigate",
  },
  {
    label: "Create a mission",
    hint: "Turn an objective into a reviewable plan",
    href: "/app/missions/new",
    icon: Target,
    group: "Ask Navo",
    keywords: "mission objective plan create",
  },
  {
    label: "Summarize recent replies",
    hint: "Find intent, objections and next actions",
    href: "/app/conversations",
    icon: MessageSquareText,
    group: "Ask Navo",
    keywords: "summary reply conversation intent",
  },
  {
    label: "Prepare approval-ready drafts",
    hint: "Use approved evidence and claims",
    href: "/app/approvals",
    icon: FileText,
    group: "Ask Navo",
    keywords: "draft email approval outreach",
  },
  {
    label: "Show actions needing approval",
    hint: "1 action is waiting for your decision",
    href: "/app/approvals",
    icon: ListChecks,
    group: "Navigate",
    keywords: "approval pending review human",
  },
  {
    label: "Show failed Agent Activity",
    hint: "Inspect errors, evidence and retry options",
    href: "/app/runs?status=failed",
    icon: TriangleAlert,
    group: "Navigate",
    keywords: "failed error run activity retry",
  },
];

function getPageContext(pathname: string) {
  if (/\/app\/accounts\//.test(pathname)) {
    return { label: "Account context", detail: "Current account · Evidence · Related mission", icon: Building2 };
  }
  if (pathname.startsWith("/app/signals")) {
    return { label: "Signal context", detail: "Visible signals · Related accounts", icon: Sparkles };
  }
  if (/\/app\/conversations\//.test(pathname)) {
    return { label: "Conversation context", detail: "Conversation · Contact · Account memory", icon: MessageSquareText };
  }
  if (/\/app\/missions\//.test(pathname)) {
    return { label: "Mission context", detail: "Current goal · Plan · Targets · Findings", icon: Target };
  }
  if (/\/app\/runs\//.test(pathname)) {
    return { label: "Activity context", detail: "Execution run · Node evidence · Errors", icon: Activity };
  }
  return { label: "Workspace context", detail: "Nova Automation · Current page", icon: Bot };
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [proposal, setProposal] = useState<AgentCommandProposal | null>(null);
  const [requestState, setRequestState] = useState<"idle" | "previewing" | "creating">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const context = getPageContext(pathname);

  const filteredActions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.hint} ${action.keywords}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  useEffect(() => {
    let sequenceStarted = false;
    let sequenceTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          setOpen(false);
        } else {
          setQuery("");
          setProposal(null);
          setError(null);
          setOpen(true);
        }
      }
      if (event.key === "Escape" && open) setOpen(false);
      if (event.key.toLowerCase() === "g" && !open) {
        sequenceStarted = true;
        sequenceTimer = setTimeout(() => {
          sequenceStarted = false;
        }, 700);
        return;
      }
      if (sequenceStarted) {
        const map: Record<string, string> = {
          a: "/app/accounts",
          m: "/app/missions",
          p: "/app/plays",
          r: "/app/runs",
          v: "/app/approvals",
        };
        const path = map[event.key.toLowerCase()];
        if (path) {
          event.preventDefault();
          router.push(path);
          sequenceStarted = false;
          if (sequenceTimer) clearTimeout(sequenceTimer);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (sequenceTimer) clearTimeout(sequenceTimer);
    };
  }, [open, router]);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const submitCommand = async () => {
    const trimmed = query.trim();
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
      const payload = (await response.json().catch(() => null)) as { data?: AgentCommandProposal; error?: { message?: string } } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error?.message ?? "Navo could not prepare this proposal.");
      setProposal(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Navo could not prepare this proposal.");
    } finally {
      setRequestState("idle");
    }
  };

  const createMission = async () => {
    if (!proposal) return;
    setRequestState("creating");
    setError(null);
    try {
      const response = await fetch("/api/agent/commands/create-mission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: proposal.objective, name: proposal.name, status: "ACTIVE" }),
      });
      const payload = (await response.json().catch(() => null)) as { missionId?: string; error?: { message?: string } } | null;
      if (!response.ok || !payload?.missionId) throw new Error(payload?.error?.message ?? "The mission could not be created.");
      setOpen(false);
      router.push(`/app/missions/${payload.missionId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The mission could not be created.");
      setRequestState("idle");
    }
  };

  const ContextIcon = context.icon;

  return (
    <>
      <button
        className="search-trigger"
        onClick={() => {
          setQuery("");
          setProposal(null);
          setError(null);
          setOpen(true);
        }}
        aria-label="Open Navo command menu"
        type="button"
      >
        <Sparkles size={15} />
        <span>Ask Navo or jump to…</span>
        <span className="keycap">⌘ K</span>
      </button>

      {open && (
        <div className="command-layer" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Navo command menu"
            className="command-dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="command-input-row">
              <Command size={17} />
              <input
                autoFocus
                value={query}
                placeholder="Ask Navo to research, explain, plan or prepare…"
                aria-label="Command"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setProposal(null);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitCommand();
                  if (event.key === "Escape") setOpen(false);
                }}
              />
              {query && (
                <button type="button" className="command-submit" onClick={() => void submitCommand()} aria-label="Preview command" disabled={requestState !== "idle"}>
                  {requestState === "previewing" ? <Loader2 className="spin" size={15} /> : <ArrowRight size={15} />}
                </button>
              )}
            </div>

            <div className="command-context">
              <ContextIcon size={14} />
              <span><strong>{context.label}</strong> · {context.detail}</span>
              <span className="badge badge-accent">Context on</span>
            </div>

            <div className="command-results">
              {proposal ? (
                <article className="command-result-card">
                  <header>
                    <span className="command-result-icon"><Sparkles size={16} /></span>
                    <span>
                      <small>Action proposal</small>
                      <strong>{proposal.name}</strong>
                    </span>
                    <span className="badge badge-warning">Review first</span>
                  </header>
                  <div className="command-result-body">
                    <div><span>Objective</span><strong>{proposal.objective}</strong></div>
                    <div><span>Scope</span><strong>{proposal.targetScope} · {proposal.estimatedAccounts} accounts</strong></div>
                    <div><span>Plan</span><strong>{proposal.planSteps.join(" · ")}</strong></div>
                    <div><span>Controls</span><strong>Approval controlled · Test mode · Est. ${proposal.estimatedCost.toFixed(3)}</strong></div>
                  </div>
                  <footer>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void createMission()}
                      disabled={requestState !== "idle"}
                    >
                      {requestState === "creating" ? <Loader2 className="spin" size={14} /> : <ArrowRight size={14} />}
                      Create and start mission
                    </button>
                    <button className="button button-ghost" type="button" onClick={() => { setProposal(null); setError(null); }} disabled={requestState !== "idle"}>
                      Edit command
                    </button>
                  </footer>
                </article>
              ) : (
                <>
                  {(["Ask Navo", "Navigate"] as const).map((group) => {
                    const groupActions = filteredActions.filter((action) => action.group === group);
                    if (!groupActions.length) return null;
                    return (
                      <div className="command-group" key={group}>
                        <div className="nav-group">{group}</div>
                        {groupActions.map(({ label, hint, href, icon: Icon }) => (
                          <button key={label} type="button" onClick={() => navigate(href)}>
                            <span className="command-action-icon"><Icon size={16} /></span>
                            <span><strong>{label}</strong><small>{hint}</small></span>
                            <ArrowRight size={14} />
                          </button>
                        ))}
                      </div>
                    );
                  })}
                  {filteredActions.length === 0 && query && (
                    <div className="command-empty">
                      <Sparkles size={20} />
                      <strong>Preview this request with Navo</strong>
                      <span>Press Enter to turn it into a structured action proposal.</span>
                    </div>
                  )}
                </>
              )}
              {error && <div className="agent-control-error" role="alert" style={{ margin: 10 }}><TriangleAlert size={14} />{error}</div>}
            </div>

            <footer className="command-footer">
              <span>↵ Preview</span><span>Esc Close</span><span>G A / G M / G P / G R Navigate</span>
              <span className="command-safety"><ListChecks size={12} /> Navo will not execute without review</span>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
