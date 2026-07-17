import { describe, expect, it } from "vitest";
import { MockAIProvider, emptyMissionWorkingMemory, missionPlanSchema } from "@navo/agents";
import { AgentToolRegistry, toolRecordSchema } from "./tools/index";
import { checkMissionStopConditions, decideNextMissionStep, executablePlanSteps } from "./mission-executor";

const plan = missionPlanSchema.parse({
  version: 1, name: "Autonomous test", missionType: "OUTREACH_PREPARATION", objective: "Research DACH manufacturers.",
  strategy: "Run the bounded golden path.", targetDescription: "Seed accounts",
  targetCriteria: { countries: ["Germany"], industries: ["Packaging"], companyTypes: ["Manufacturer"], keywords: ["automation"] },
  steps: [
    { id: "a", type: "LOAD_SELLER_KNOWLEDGE", title: "Load", description: "Load seller context.", status: "COMPLETED", dependsOn: [] },
    { id: "b", type: "SELECT_TARGET_ACCOUNTS", title: "Select", description: "Select accounts.", status: "PENDING", dependsOn: ["a"] },
    { id: "c", type: "FETCH_WEBSITE", title: "Fetch", description: "Fetch websites.", status: "PENDING", dependsOn: ["b"] },
    { id: "d", type: "RESEARCH_COMPANY", title: "Research", description: "Research accounts.", status: "PENDING", dependsOn: ["c"] },
    { id: "e", type: "SUMMARIZE_MISSION", title: "Summary", description: "Summarize mission.", status: "PENDING", dependsOn: ["d"] },
  ],
  stopConditions: ["Stop at the bound"], expectedOutputs: ["Research"], assumptions: [],
});

describe("autonomous mission decision helpers", () => {
  it("selects the first dependency-ready step without a model call", () => {
    expect(executablePlanSteps(plan).map((step) => step.id)).toEqual(["b"]);
    const decision = decideNextMissionStep({ plan, iteration: 1, maximumIterations: 20 });
    expect(decision).toMatchObject({ action: "EXECUTE_STEP", stepId: "b" });
  });

  it("stops at iteration and failure bounds", () => {
    expect(checkMissionStopConditions({ plan, workingMemory: emptyMissionWorkingMemory(), iteration: 20, maximumIterations: 20, cancelled: false }).reason).toContain("Maximum");
    expect(checkMissionStopConditions({ plan, workingMemory: emptyMissionWorkingMemory(), iteration: 1, maximumIterations: 20, cancelled: true }).reason).toContain("cancelled");
  });

  it("validates tool inputs and outputs through the registry", async () => {
    const registry = new AgentToolRegistry().register({ type: "LOAD_SELLER_KNOWLEDGE", label: "Load", description: "Load", inputSchema: toolRecordSchema, outputSchema: toolRecordSchema, execute: async () => ({ loaded: true }) });
    const output = await registry.execute("LOAD_SELLER_KNOWLEDGE", {}, { workspaceId: crypto.randomUUID(), missionId: crypto.randomUUID(), userId: crypto.randomUUID(), ai: new MockAIProvider(), workingMemory: emptyMissionWorkingMemory() });
    expect(output).toEqual({ loaded: true });
    await expect(registry.execute("FETCH_WEBSITE", {}, { workspaceId: "w", missionId: "m", userId: "u", ai: new MockAIProvider(), workingMemory: emptyMissionWorkingMemory() })).rejects.toThrow("NOT_REGISTERED");
  });
});
