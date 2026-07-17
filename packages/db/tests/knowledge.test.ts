import { describe, expect, it } from "vitest";
import { buildKnowledgeWrites, mapKnowledgeBase, normalizeList, type KnowledgeBaseInput } from "../src/queries";

const input: KnowledgeBaseInput = {
  company: { name: "  Nova Automation  ", website: " https://nova-automation.example ", descriptionZh: "诺瓦自动化", descriptionEn: "" },
  product: { nameZh: " AI 视觉检测系统 ", nameEn: "AI Vision Inspection System", category: " Machine Vision ", descriptionZh: "", descriptionEn: "Vision inspection.", capabilities: [" 视觉缺陷检测 ", "尺寸检测", "视觉缺陷检测", " "], prohibitedClaims: ["未经验证的 ROI 数字"] },
  icp: { name: " 欧美工业制造 ICP ", industries: ["Automotive Components", "", "Packaging"], countries: ["Germany", "Germany", "United States"] },
  claims: [
    { id: "00000000-0000-4000-8000-000000000011", claim: " Compatible with common industrial camera interfaces. ", evidence: "", allowedRegions: [" GLOBAL ", "GLOBAL"] },
    { claim: "Supports validated line rates.", evidence: "Internal protocol NV-VIS-2026", allowedRegions: ["EU", "US"] },
  ],
};

describe("normalizeList", () => {
  it("trims, drops empty entries and dedupes", () => {
    expect(normalizeList([" a ", "", "b", "a", "  "])).toEqual(["a", "b"]);
  });
});

describe("buildKnowledgeWrites", () => {
  it("maps API input to normalized row values", () => {
    const writes = buildKnowledgeWrites(input);
    expect(writes.workspace).toEqual({ name: "Nova Automation", website: "https://nova-automation.example", descriptionZh: "诺瓦自动化", descriptionEn: null });
    expect(writes.product.nameZh).toBe("AI 视觉检测系统");
    expect(writes.product.capabilities).toEqual(["视觉缺陷检测", "尺寸检测"]);
    expect(writes.icp.countries).toEqual(["Germany", "United States"]);
    expect(writes.claims[0]).toEqual({ id: "00000000-0000-4000-8000-000000000011", claim: "Compatible with common industrial camera interfaces.", evidence: null, allowedRegions: ["GLOBAL"] });
    expect(writes.claims[1]?.id).toBeUndefined();
    expect(writes.claims[1]?.evidence).toBe("Internal protocol NV-VIS-2026");
  });
});

describe("mapKnowledgeBase", () => {
  const workspaceRow = { id: "w1", name: "Nova Automation", slug: "nova-automation", plan: "DEMO", website: null, descriptionZh: "中文简介", descriptionEn: null, createdAt: new Date(), updatedAt: new Date(), revision: 1 };
  const productRow = { id: "p1", workspaceId: "w1", createdAt: new Date(), updatedAt: new Date(), createdBy: null, revision: 1, nameZh: "AI 视觉检测系统", nameEn: "AI Vision Inspection System", category: "Machine Vision", descriptionZh: null, descriptionEn: "Vision inspection.", capabilities: ["尺寸检测"], prohibitedClaims: ["未经验证的 ROI 数字"], status: "ACTIVE" };
  const icpRow = { id: "i1", workspaceId: "w1", createdAt: new Date(), updatedAt: new Date(), createdBy: null, revision: 1, name: "ICP", countries: ["Germany"], industries: ["Packaging"], employeeMin: 100, employeeMax: 5000, minimumScore: 60, hardExclusions: [], scoringWeights: {} };
  const claimRow = { id: "c1", workspaceId: "w1", createdAt: new Date(), updatedAt: new Date(), createdBy: null, revision: 1, productId: "p1", claim: "Claim text", evidence: null, approvedBy: null, approvedAt: null, expiresAt: null, allowedRegions: ["EU"], status: "APPROVED" };

  it("maps rows to the editor payload with empty-string fallbacks", () => {
    const payload = mapKnowledgeBase({ workspace: workspaceRow as never, product: productRow as never, icpProfile: icpRow as never, claims: [claimRow] as never });
    expect(payload.company).toEqual({ name: "Nova Automation", website: "", descriptionZh: "中文简介", descriptionEn: "" });
    expect(payload.product?.capabilities).toEqual(["尺寸检测"]);
    expect(payload.product?.descriptionZh).toBe("");
    expect(payload.icp?.countries).toEqual(["Germany"]);
    expect(payload.claims[0]).toEqual({ id: "c1", claim: "Claim text", evidence: "", allowedRegions: ["EU"] });
  });

  it("handles an empty workspace (no product or ICP yet)", () => {
    const payload = mapKnowledgeBase({ workspace: null, product: null, icpProfile: null, claims: [] });
    expect(payload).toEqual({ company: null, product: null, icp: null, claims: [] });
  });
});
