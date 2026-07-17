type PersistedMissionResult = {
  research?: { summary?: unknown; manufacturingSignals?: unknown };
};

type BriefInput = {
  status: string;
  error: string | null;
  result: unknown;
  account: { id: string; name: string } | null;
  evidence: Array<{ sourceUrl: string | null }>;
  signals: Array<{ summary: string }>;
  qualification: { score: number; status: string; risks: unknown } | null;
  message: { id: string; subject: string; status: string } | null;
};

export type CompletionBrief = {
  state: "completed" | "failed" | "pending" | "empty";
  conclusion: string;
  qualified: boolean | null;
  qualificationStatus: string | null;
  score: number | null;
  findings: string[];
  evidenceCount: number;
  sourceUrls: string[];
  risks: string[];
  recommendedNextStep: string;
  draftSubject: string | null;
  accountId: string | null;
};

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

/** Derives a concise operator brief solely from persisted Mission outputs. */
export function deriveCompletionBrief(input: BriefInput): CompletionBrief {
  const accountId = input.account?.id ?? null;
  if (input.status === "FAILED") return {
    state: "failed", conclusion: "Mission stopped before a complete brief could be delivered.", qualified: null, qualificationStatus: null, score: null,
    findings: [], evidenceCount: input.evidence.length, sourceUrls: [], risks: input.error ? [input.error] : [], recommendedNextStep: "Retry as a new mission after reviewing the failure.", draftSubject: null, accountId,
  };
  if (input.status !== "COMPLETED") return {
    state: "pending", conclusion: "Navo will publish a completion brief after persisted research and qualification are available.", qualified: null, qualificationStatus: null, score: null,
    findings: [], evidenceCount: input.evidence.length, sourceUrls: [], risks: [], recommendedNextStep: "Wait for the mission to finish; no external action is taken.", draftSubject: null, accountId,
  };
  const result = input.result && typeof input.result === "object" ? input.result as PersistedMissionResult : {};
  const qualification = input.qualification;
  const qualified = qualification ? ["STRONG_FIT", "POTENTIAL_FIT"].includes(qualification.status) : null;
  const findings = [
    ...input.signals.map((signal) => signal.summary),
    ...strings(result.research?.manufacturingSignals),
    ...(typeof result.research?.summary === "string" ? [result.research.summary] : []),
  ].slice(0, 3);
  const sourceUrls = [...new Set(input.evidence.map((item) => item.sourceUrl).filter((url): url is string => Boolean(url)))].slice(0, 3);
  if (!qualification && !findings.length && !input.message) return {
    state: "empty", conclusion: "This completed mission has no persisted qualification, findings, or draft to summarize.", qualified: null, qualificationStatus: null, score: null,
    findings: [], evidenceCount: input.evidence.length, sourceUrls, risks: [], recommendedNextStep: "Research again with a verified website.", draftSubject: null, accountId,
  };
  return {
    state: "completed",
    conclusion: qualified === true ? `${input.account?.name ?? "The account"} is qualified for a safe follow-up.` : qualification?.status === "REVIEW" ? `${input.account?.name ?? "The account"} needs review before outreach.` : qualified === false ? `${input.account?.name ?? "The account"} is not currently qualified for outreach.` : "Research was saved; qualification is unavailable.",
    qualified,
    qualificationStatus: qualification?.status ?? null,
    score: qualification?.score ?? null,
    findings,
    evidenceCount: input.evidence.length,
    sourceUrls,
    risks: strings(qualification?.risks).slice(0, 3),
    recommendedNextStep: qualification?.status === "REVIEW" ? "Review the evidence and qualification before pursuing this account." : qualified === false ? "Review the evidence before pursuing this account." : "Review the DRAFT, then create a follow-up task if appropriate.",
    draftSubject: input.message?.status === "DRAFT" ? input.message.subject : null,
    accountId,
  };
}
