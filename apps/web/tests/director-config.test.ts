import { describe, expect, it } from "vitest";
import { directorConfigPatchSchema, directorConfigResponse } from "../src/lib/director-config";

describe("director configuration patch contract", () => {
  it("accepts bounded Director controls and preserves an explicitly disabled value", () => {
    const parsed = directorConfigPatchSchema.parse({ enabled: false, intervalMinutes: 5, cooldownMinutes: 0, maxActiveMissions: 2, dailyMissionLimit: 8 });
    expect(parsed).toMatchObject({ enabled: false, intervalMinutes: 5, cooldownMinutes: 0, maxActiveMissions: 2, dailyMissionLimit: 8 });
  });

  it("rejects empty, unknown, fractional, and unsafe limit values", () => {
    expect(directorConfigPatchSchema.safeParse({}).success).toBe(false);
    expect(directorConfigPatchSchema.safeParse({ intervalMinutes: 0 }).success).toBe(false);
    expect(directorConfigPatchSchema.safeParse({ cooldownMinutes: -1 }).success).toBe(false);
    expect(directorConfigPatchSchema.safeParse({ maxActiveMissions: 1.5 }).success).toBe(false);
    expect(directorConfigPatchSchema.safeParse({ dailyMissionLimit: 101 }).success).toBe(false);
    expect(directorConfigPatchSchema.safeParse({ enabled: true, status: "RUNNING" }).success).toBe(false);
  });

  it("returns only the Director settings required by clients", () => {
    const data = directorConfigResponse({ directorEnabled: true, directorIntervalMinutes: 15, directorCooldownMinutes: 60, directorMaxActiveMissions: 1, directorDailyMissionLimit: 3, nextDirectorTickAt: new Date("2026-07-18T00:00:00.000Z") });
    expect(data).toEqual({ enabled: true, intervalMinutes: 15, cooldownMinutes: 60, maxActiveMissions: 1, dailyMissionLimit: 3, nextTickAt: "2026-07-18T00:00:00.000Z" });
  });
});
