export type DraftComparisonInput = {
  originalSubject?: string | null;
  originalBody?: string | null;
  currentSubject: string;
  currentBody: string;
};

export function getDraftComparison(input: DraftComparisonInput) {
  const showOriginal = input.originalSubject !== null && input.originalSubject !== undefined
    || input.originalBody !== null && input.originalBody !== undefined;
  return {
    showOriginal,
    originalSubject: input.originalSubject ?? "Not captured",
    originalBody: input.originalBody ?? "Not captured",
    currentSubject: input.currentSubject,
    currentBody: input.currentBody,
  };
}
