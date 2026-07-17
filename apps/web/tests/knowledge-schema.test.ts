import { describe, expect, it } from "vitest";
import { knowledgeInputSchema } from "../src/app/api/knowledge/_shared";

const validPayload = {
  company: { name: "Nova Automation", website: "https://nova-automation.example", descriptionZh: "诺瓦自动化", descriptionEn: "Nova Automation" },
  product: { nameZh: "AI 视觉检测系统", nameEn: "AI Vision Inspection System", category: "Machine Vision", capabilities: ["视觉缺陷检测"], prohibitedClaims: ["未经验证的 ROI 数字"] },
  icp: { name: "欧美工业制造 ICP", industries: ["Packaging"], countries: ["Germany", "United States"] },
  claims: [{ claim: "Compatible with common industrial camera interfaces.", evidence: "Product interface specification", allowedRegions: ["GLOBAL"] }],
};

describe("knowledgeInputSchema", () => {
  it("accepts a valid payload and applies list defaults", () => {
    const parsed = knowledgeInputSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.claims[0]?.allowedRegions).toEqual(["GLOBAL"]);
      expect(parsed.data.product.descriptionZh).toBeUndefined();
    }
  });

  it("defaults claims and optional lists to empty arrays", () => {
    const parsed = knowledgeInputSchema.safeParse({ company: { name: "Nova Automation" }, product: { nameZh: "产品", nameEn: "Product" }, icp: { name: "ICP" } });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.claims).toEqual([]);
      expect(parsed.data.product.capabilities).toEqual([]);
      expect(parsed.data.icp.countries).toEqual([]);
    }
  });

  it("rejects a missing company name", () => {
    const parsed = knowledgeInputSchema.safeParse({ ...validPayload, company: { ...validPayload.company, name: " " } });
    expect(parsed.success).toBe(false);
  });

  it("rejects a website without http(s) scheme", () => {
    const parsed = knowledgeInputSchema.safeParse({ ...validPayload, company: { ...validPayload.company, website: "nova-automation.example" } });
    expect(parsed.success).toBe(false);
  });

  it("rejects a claim id that is not a uuid", () => {
    const parsed = knowledgeInputSchema.safeParse({ ...validPayload, claims: [{ ...validPayload.claims[0], id: "not-a-uuid" }] });
    expect(parsed.success).toBe(false);
  });

  it("rejects claims shorter than three characters", () => {
    const parsed = knowledgeInputSchema.safeParse({ ...validPayload, claims: [{ claim: "ab", allowedRegions: [] }] });
    expect(parsed.success).toBe(false);
  });
});
