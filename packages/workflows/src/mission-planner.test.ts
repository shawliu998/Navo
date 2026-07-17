import { describe, expect, it } from "vitest";
import { MockAIProvider, type AIProvider } from "@navo/agents";
import { planMission } from "./mission-planner";

describe("mission planner", () => {
  it("uses the AI provider and returns the executable schema-validated plan", async () => {
    const result = await planMission(new MockAIProvider(), { objective: "Research one German manufacturer and prepare a safe outreach draft." });
    expect(result.provider).toBe("mock-ai");
    expect(result.data.steps.map((step) => step.type)).toEqual([
      "LOAD_KNOWLEDGE", "LOAD_ACCOUNT", "RESEARCH_WEBSITE", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "GENERATE_OUTREACH",
    ]);
  });

  it("returns a clear planner error when the generated sequence is unusable", async () => {
    const invalid: AIProvider = {
      async generateStructured(request) {
        return { data: request.outputSchema.parse({ name: "Invalid", missionType: "ACCOUNT_RESEARCH", objective: "Research the account", targetDescription: "One account", steps: [{ id: "only", type: "LOAD_ACCOUNT", title: "Load", description: "Load account" }], expectedOutputs: ["Research"], assumptions: [] }), provider: "test", model: "invalid", inputTokens: 0, outputTokens: 0, latencyMs: 0, estimatedCost: 0 };
      },
    };
    await expect(planMission(invalid, { objective: "Research one account thoroughly." })).rejects.toThrow("MISSION_PLAN_GENERATION_FAILED");
  });
});
