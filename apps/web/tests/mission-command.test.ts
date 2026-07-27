import { describe, expect, it } from "vitest";
import { guardMissionAccount, shouldRefreshMission } from "../src/lib/mission-command";
import { mockMissionPreviewSchema } from "../src/lib/mission-preview";

const workspaceId = "workspace-a";
const account = { id: "account-a", workspaceId, website: "https://example.test", domain: "example.test" };

describe("mission command account guard", () => {
  it("requires exactly one selected account", () => {
    expect(guardMissionAccount({ accountIds: [], workspaceId, account })).toMatchObject({ ok: false, code: "MISSION_ACCOUNT_REQUIRED" });
    expect(guardMissionAccount({ accountIds: ["account-a", "account-b"], workspaceId, account })).toMatchObject({ ok: false, code: "MISSION_ACCOUNT_REQUIRED" });
  });
  it("rejects an account from a different workspace", () => {
    expect(guardMissionAccount({ accountIds: ["account-a"], workspaceId, account: { ...account, workspaceId: "workspace-b" } })).toMatchObject({ ok: false, code: "MISSION_TARGET_ACCOUNT_NOT_FOUND" });
  });
  it("rejects a domain-only account", () => {
    expect(guardMissionAccount({ accountIds: ["account-a"], workspaceId, account: { ...account, website: null, domain: "example.test" } })).toMatchObject({ ok: false, code: "MISSION_TARGET_WEBSITE_REQUIRED" });
  });
});

describe("mission preview contract", () => {
  it("keeps the exact schema-validated server plan for persistence", () => {
    const plan = {
      version: 1, name: "Research accounts", missionType: "OUTREACH_PREPARATION", objective: "Research selected accounts with evidence.", strategy: "Run a bounded autonomous plan.", targetDescription: "Workspace seed accounts.",
      targetCriteria: { countries: ["Germany"], industries: ["Packaging"], companyTypes: ["Manufacturer"], keywords: ["automation"] },
      steps: ["LOAD_SELLER_KNOWLEDGE", "SELECT_TARGET_ACCOUNTS", "RESEARCH_COMPANY", "SUMMARIZE_MISSION"].map((type, index, all) => ({ id: type.toLowerCase(), type, title: type, description: `Run ${type}.`, status: "PENDING", dependsOn: index ? [all[index - 1]!.toLowerCase()] : [] })),
      stopConditions: ["Required outputs persisted"],
      expectedOutputs: ["Evidence-backed account brief"], assumptions: ["Public website is reachable."],
    };
    const parsed = mockMissionPreviewSchema.parse({ plan, provider: "mock-ai", model: "deterministic-v1" });
    expect(parsed.plan).toEqual(plan);
    expect(mockMissionPreviewSchema.safeParse({ ...parsed, provider: "deepseek", model: "deepseek-v4-flash" }).success).toBe(true);
    expect(mockMissionPreviewSchema.safeParse({ ...parsed, provider: "" }).success).toBe(false);
  });
});

describe("mission live snapshot", () => {
  it("refreshes only when the visible execution state changes", () => {
    const current = { status: "RUNNING", progress: 40, currentStep: "Researching website", eventCount: 2 };
    expect(shouldRefreshMission(current, current)).toBe(false);
    expect(shouldRefreshMission(current, { ...current, progress: 55 })).toBe(true);
    expect(shouldRefreshMission(current, { ...current, eventCount: 3 })).toBe(true);
  });
});
