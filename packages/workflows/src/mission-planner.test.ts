import { describe, expect, it } from "vitest";
import { MockAIProvider, type AIProvider } from "@navo/agents";
import { planMission } from "./mission-planner";

describe("mission planner", () => {
  it("uses the AI provider and returns the executable schema-validated plan", async () => {
    const result = await planMission(new MockAIProvider(), { objective: "Research one German manufacturer and prepare a safe outreach draft." });
    expect(result.provider).toBe("mock-ai");
    expect(result.data.steps.map((step) => step.type)).toEqual([
      "LOAD_SELLER_KNOWLEDGE", "SELECT_TARGET_ACCOUNTS", "FETCH_WEBSITE", "RESEARCH_COMPANY", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "RANK_ACCOUNTS", "DISCOVER_CONTACTS", "GENERATE_OUTREACH", "CREATE_TASK", "UPDATE_MEMORY", "SUMMARIZE_MISSION",
    ]);
  });

  it("falls back to an observable deterministic plan when the generated sequence is unusable", async () => {
    const invalid: AIProvider = {
      async generateStructured(request) {
        return { data: request.outputSchema.parse({ version: 1, name: "Invalid", missionType: "ACCOUNT_RESEARCH", objective: "Research the account", strategy: "Invalid incomplete plan", targetDescription: "One account", targetCriteria: { countries: [], industries: [], companyTypes: [], keywords: [] }, steps: Array.from({ length: 4 }, (_, index) => ({ id: `only-${index}`, type: "LOAD_SELLER_KNOWLEDGE", title: "Load", description: "Load account", status: "PENDING", dependsOn: index ? [`only-${index - 1}`] : [] })), stopConditions: ["Stop"], expectedOutputs: ["Research"], assumptions: [] }), provider: "test", model: "invalid", inputTokens: 0, outputTokens: 0, latencyMs: 0, estimatedCost: 0 };
      },
    };
    const result = await planMission(invalid, { objective: "Research one account thoroughly." });
    expect(result.provider).toBe("deterministic-fallback");
    expect(result.model).toBe("golden-path-v1");
    expect(result.data.steps.map((step) => step.type)).toEqual([
      "LOAD_SELLER_KNOWLEDGE", "SELECT_TARGET_ACCOUNTS", "FETCH_WEBSITE", "RESEARCH_COMPANY", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "RANK_ACCOUNTS", "DISCOVER_CONTACTS", "GENERATE_OUTREACH", "CREATE_TASK", "UPDATE_MEMORY", "SUMMARIZE_MISSION",
    ]);
    expect(result.data.assumptions[0]).toContain("MISSION_PLAN_INVALID_LENGTH");
  });
});
