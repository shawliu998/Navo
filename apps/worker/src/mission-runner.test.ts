import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  MockAIProvider, type CompanyResearchOutput, type StructuredGenerationRequest, type StructuredGenerationResult,
} from "@navo/agents";
import {
  accounts, agentMissions, approvals, approvedClaims, createMission, db, evidence, icpProfiles, messages,
  products, qualificationResults, signals, workspaces,
} from "@navo/db";
import { planMission } from "@navo/workflows/mission-planner";
import { executeMissionDirect } from "./mission-runner";

async function createTestMission() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  await db.insert(workspaces).values({ id: workspaceId, name: "Nova Automation", slug: `mission-test-${workspaceId}`, plan: "TEST" });
  const [product] = await db.insert(products).values({ workspaceId, createdBy: userId, nameZh: "视觉检测", nameEn: "Vision Inspection", category: "Machine Vision", capabilities: ["Inline quality inspection"], prohibitedClaims: ["guaranteed accuracy"], status: "ACTIVE" }).returning({ id: products.id });
  await db.insert(approvedClaims).values({ workspaceId, createdBy: userId, productId: product!.id, claim: "Compatible with common industrial camera interfaces.", approvedBy: userId, approvedAt: new Date(), allowedRegions: ["GLOBAL"], status: "APPROVED" });
  await db.insert(icpProfiles).values({ workspaceId, createdBy: userId, name: "Industrial ICP", countries: ["Germany"], industries: ["Automotive Components"], hardExclusions: ["Consumer-only", "Services-only"], scoringWeights: {}, minimumScore: 60 });
  await db.insert(accounts).values({ id: accountId, workspaceId, createdBy: userId, name: "Demo Mission Manufacturer GmbH", domain: `mission-${accountId}-demo.example`, website: `https://mission-${accountId}-demo.example`, country: "Germany", industry: "Automotive Components", source: "DEMO", qualification: "NOT_RESEARCHED", playStatus: "NOT_STARTED" });
  const mock = new MockAIProvider();
  const generated = await planMission(mock, { objective: "Research this German manufacturer and prepare a safe English outreach draft." });
  const mission = await createMission(workspaceId, userId, { name: "Mission runner test", objective: generated.data.objective, type: generated.data.missionType, status: "READY", targetAccountId: accountId, plan: generated.data, provider: generated.provider, model: generated.model, targetCount: 1, maximumAccounts: 1, testMode: true });
  return { workspaceId, accountId, missionId: mission.id };
}

async function missionState(workspaceId: string, missionId: string) {
  const [mission] = await db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId))).limit(1);
  return mission!;
}

class ThrowingProvider extends MockAIProvider {
  override async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    if (request.operation === "company-research") throw new Error("TEST_AI_FAILURE");
    return super.generateStructured(request);
  }
}

class InvalidQuoteProvider extends MockAIProvider {
  override async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const result = await super.generateStructured(request);
    if (request.operation !== "company-research") return result;
    const data = result.data as CompanyResearchOutput;
    return { ...result, data: { ...data, evidence: data.evidence.map((item) => ({ ...item, quote: "This quote was never present in the fetched HTML." })) } as T };
  }
}

describe("single-account mission runner integration", () => {
  it("completes a Mock mission and persists every required artifact", async () => {
    const fixture = await createTestMission();
    const result = await executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId });
    const mission = await missionState(fixture.workspaceId, fixture.missionId);
    expect(mission.status).toBe("COMPLETED");
    expect(mission.progress).toBe(100);
    expect(result.messageId).toBeTruthy();
    const [[evidenceCount], [signalCount], [qualificationCount], [draftCount], [approvalCount]] = await Promise.all([
      db.select({ value: count() }).from(evidence).where(and(eq(evidence.workspaceId, fixture.workspaceId), eq(evidence.accountId, fixture.accountId))),
      db.select({ value: count() }).from(signals).where(and(eq(signals.workspaceId, fixture.workspaceId), eq(signals.accountId, fixture.accountId))),
      db.select({ value: count() }).from(qualificationResults).where(and(eq(qualificationResults.workspaceId, fixture.workspaceId), eq(qualificationResults.accountId, fixture.accountId))),
      db.select({ value: count() }).from(messages).where(and(eq(messages.workspaceId, fixture.workspaceId), eq(messages.accountId, fixture.accountId), eq(messages.status, "DRAFT"))),
      db.select({ value: count() }).from(approvals).where(and(eq(approvals.workspaceId, fixture.workspaceId), eq(approvals.accountId, fixture.accountId))),
    ]);
    expect(evidenceCount!.value).toBeGreaterThan(0);
    expect(signalCount!.value).toBeGreaterThan(0);
    expect(qualificationCount!.value).toBe(1);
    expect(draftCount!.value).toBe(1);
    expect(approvalCount!.value).toBe(0);
  }, 20_000);

  it("persists FAILED when website fetching fails", async () => {
    const fixture = await createTestMission();
    await expect(executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, { ai: new MockAIProvider(), websiteResearch: async () => ({ ok: false, error: { code: "FETCH_FAILED", message: "fixture fetch failed" } }) })).rejects.toThrow("WEBSITE_RESEARCH_FAILED");
    const mission = await missionState(fixture.workspaceId, fixture.missionId);
    expect(mission.status).toBe("FAILED");
    expect(mission.error).toContain("FETCH_FAILED");
  }, 20_000);

  it("persists FAILED when AI generation fails", async () => {
    const fixture = await createTestMission();
    await expect(executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, { ai: new ThrowingProvider() })).rejects.toThrow("TEST_AI_FAILURE");
    expect((await missionState(fixture.workspaceId, fixture.missionId)).status).toBe("FAILED");
  }, 20_000);

  it("persists FAILED when an evidence quote is not literal", async () => {
    const fixture = await createTestMission();
    await expect(executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, { ai: new InvalidQuoteProvider() })).rejects.toThrow("RESEARCH_EVIDENCE_QUOTE_INVALID");
    const mission = await missionState(fixture.workspaceId, fixture.missionId);
    expect(mission.status).toBe("FAILED");
    expect(mission.error).toContain("QUOTE_INVALID");
  }, 20_000);
});
