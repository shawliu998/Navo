import { describe, expect, it } from "vitest";
import { MockAIProvider, type AIProvider, type MissionPlan } from "@navo/agents";
import { planMission } from "./mission-planner";

describe("mission planner", () => {
  it("uses the AI provider and returns the executable schema-validated plan", async () => {
    const result = await planMission(new MockAIProvider(), { objective: "Research one German manufacturer and prepare a safe outreach draft.", missionType: "OUTREACH_PREPARATION" });
    expect(result.provider).toBe("mock-ai");
    expect(result.plannerMode).toBe("AI");
    expect(result.data.steps.map((step) => step.type)).toEqual([
      "LOAD_SELLER_KNOWLEDGE", "SELECT_TARGET_ACCOUNTS", "FETCH_WEBSITE", "RESEARCH_COMPANY", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "RANK_ACCOUNTS", "DISCOVER_CONTACTS", "GENERATE_OUTREACH", "CREATE_TASK", "UPDATE_MEMORY", "SUMMARIZE_MISSION",
    ]);
  });

  it("plans a bounded reply follow-up only for the supplied inbound message", async () => {
    const replyContext = { sourceMessageId: "00000000-0000-4000-8000-000000000151", conversationId: "00000000-0000-4000-8000-000000000152" };
    const result = await planMission(new MockAIProvider(), { objective: "Prepare a safe follow-up for this inbound question.", missionType: "REPLY_FOLLOW_UP", replyContext });
    expect(result.data.replyContext).toEqual(replyContext);
    expect(result.data.steps.map((step) => step.type)).toEqual(["LOAD_REPLY_CONTEXT", "GENERATE_REPLY_DRAFT", "CREATE_TASK", "UPDATE_MEMORY", "SUMMARIZE_MISSION"]);
  });

  it("rejects a reply mission without explicit inbound message context", async () => {
    await expect(planMission(new MockAIProvider(), { objective: "Follow up on a reply.", missionType: "REPLY_FOLLOW_UP" })).rejects.toThrow("MISSION_PLAN_REPLY_CONTEXT_REQUIRED");
  });

  it("falls back to an observable deterministic plan when the generated sequence is unusable", async () => {
    const invalid: AIProvider = {
      async generateStructured(request) {
        return { data: request.outputSchema.parse({ version: 1, name: "Invalid", missionType: "ACCOUNT_RESEARCH", objective: "Research the account", strategy: "Invalid incomplete plan", targetDescription: "One account", targetCriteria: { countries: [], industries: [], companyTypes: [], keywords: [] }, steps: Array.from({ length: 4 }, (_, index) => ({ id: `only-${index}`, type: "LOAD_SELLER_KNOWLEDGE", title: "Load", description: "Load account", status: "PENDING", dependsOn: index ? [`only-${index - 1}`] : [] })), stopConditions: ["Stop"], expectedOutputs: ["Research"], assumptions: [] }), provider: "test", model: "invalid", inputTokens: 0, outputTokens: 0, latencyMs: 0, estimatedCost: 0 };
      },
    };
    const result = await planMission(invalid, { objective: "Research one account thoroughly.", missionType: "OPPORTUNITY_DISCOVERY" });
    expect(result.provider).toBe("deterministic-fallback");
    expect(result.model).toBe("discovery-template-v1");
    expect(result.plannerMode).toBe("DETERMINISTIC_FALLBACK");
    expect(result.data.steps.map((step) => step.type)).toEqual([
      "LOAD_SELLER_KNOWLEDGE", "SELECT_TARGET_ACCOUNTS", "FETCH_WEBSITE", "RESEARCH_COMPANY", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "RANK_ACCOUNTS", "UPDATE_MEMORY", "SUMMARIZE_MISSION",
    ]);
    expect(result.data.assumptions[0]).toContain("step types must not repeat");
  });

  it("repairs one schema-valid but non-executable AI plan before using fallback", async () => {
    const mock = new MockAIProvider();
    let calls = 0;
    const repairable: AIProvider = {
      async generateStructured(request) {
        calls += 1;
        const generated = await mock.generateStructured(request);
        if (calls > 1) return generated;
        const plan = generated.data as MissionPlan;
        const steps = plan.steps.filter((step) => step.type !== "UPDATE_MEMORY").map((step, index, filtered) => step.type === "SUMMARIZE_MISSION" ? { ...step, dependsOn: [filtered[index - 1]!.id] } : step);
        return { ...generated, data: request.outputSchema.parse({ ...plan, steps }) };
      },
    };
    const result = await planMission(repairable, { objective: "Discover and rank industrial opportunities.", missionType: "OPPORTUNITY_DISCOVERY" });
    expect(calls).toBe(2);
    expect(result.plannerMode).toBe("AI");
    expect(result.provider).toBe("mock-ai");
    expect(result.data.steps.some((step) => step.type === "UPDATE_MEMORY")).toBe(true);
  });

  it("repairs CREATE_TARGET_ACCOUNT when no explicit company was supplied", async () => {
    const mock = new MockAIProvider();
    let calls = 0;
    const provider: AIProvider = {
      async generateStructured(request) {
        calls += 1;
        const generated = await mock.generateStructured(request);
        if (calls > 1) return generated;
        const plan = generated.data as MissionPlan;
        return { ...generated, data: request.outputSchema.parse({ ...plan, steps: plan.steps.map((step) => step.type === "SELECT_TARGET_ACCOUNTS" ? { ...step, type: "CREATE_TARGET_ACCOUNT" } : step) }) };
      },
    };
    const result = await planMission(provider, { objective: "Continue research using existing workspace accounts.", missionType: "OPPORTUNITY_DISCOVERY" });
    expect(calls).toBe(2);
    expect(result.plannerMode).toBe("AI");
    expect(result.data.steps.some((step) => step.type === "CREATE_TARGET_ACCOUNT")).toBe(false);
    expect(result.data.steps.some((step) => step.type === "SELECT_TARGET_ACCOUNTS")).toBe(true);
  });
});
