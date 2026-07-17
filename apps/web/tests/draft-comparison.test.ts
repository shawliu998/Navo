import { describe, expect, it } from "vitest";
import { getDraftComparison } from "../src/lib/draft-comparison";

describe("getDraftComparison", () => {
  it("shows original and current only when an original was captured", () => {
    expect(getDraftComparison({ originalSubject: "Original", originalBody: "Original body", currentSubject: "Current", currentBody: "Current body" })).toMatchObject({
      showOriginal: true,
      originalSubject: "Original",
      currentSubject: "Current",
    });
    expect(getDraftComparison({ currentSubject: "Current", currentBody: "Current body" }).showOriginal).toBe(false);
  });

  it("keeps a partially captured original explicit without inventing a revision", () => {
    expect(getDraftComparison({ originalBody: "Original body", currentSubject: "Current", currentBody: "Current body" })).toMatchObject({
      showOriginal: true,
      originalSubject: "Not captured",
    });
  });
});
