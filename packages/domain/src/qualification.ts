import type { AccountQualification, Decision } from "./types";

export type QualificationInput = {
  hardRules: number;
  businessSignals: number;
  productMatch: number;
  similarCaseMatch: number;
  semanticJudgment: number;
  hardExcluded?: boolean;
  evidenceIds: string[];
  inferenceIds?: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function qualifyAccount(input: QualificationInput): Decision & { score: number; status: AccountQualification } {
  if (input.hardExcluded) {
    return {
      decisionType: "ICP_QUALIFICATION",
      result: "DISQUALIFIED",
      status: "DISQUALIFIED",
      score: 0,
      rulesApplied: ["HARD_EXCLUSION"],
      scoreBreakdown: { hardRules: 0, businessSignals: 0, productMatch: 0, similarCaseMatch: 0, semanticJudgment: 0 },
      evidenceIds: input.evidenceIds,
      inferenceIds: input.inferenceIds ?? [],
      explanation: "A deterministic hard exclusion rule matched; semantic judgment cannot override it.",
    };
  }

  const breakdown = {
    hardRules: clamp(input.hardRules) * 0.4,
    businessSignals: clamp(input.businessSignals) * 0.25,
    productMatch: clamp(input.productMatch) * 0.2,
    similarCaseMatch: clamp(input.similarCaseMatch) * 0.1,
    semanticJudgment: clamp(input.semanticJudgment) * 0.05,
  };
  const score = Math.round(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
  const status: AccountQualification = score >= 80 ? "STRONG_FIT" : score >= 60 ? "POTENTIAL_FIT" : score >= 40 ? "REVIEW" : "LOW_FIT";
  return {
    decisionType: "ICP_QUALIFICATION",
    result: status,
    status,
    score,
    rulesApplied: ["WEIGHTED_ICP_V1"],
    scoreBreakdown: breakdown,
    evidenceIds: input.evidenceIds,
    inferenceIds: input.inferenceIds ?? [],
    explanation: `Weighted deterministic score is ${score}; the account is ${status}.`,
  };
}
