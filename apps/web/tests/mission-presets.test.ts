import { describe, expect, it } from "vitest";
import { findPreset, GOLDEN_MISSION_PRESET } from "../src/lib/mission-presets";

describe("mission quick-start presets", () => {
  it("exposes the golden DACH industrial outreach preset", () => {
    expect(GOLDEN_MISSION_PRESET.id).toBe("dach-industrial-outreach");
    expect(GOLDEN_MISSION_PRESET.objective).toContain("3 best DACH industrial companies");
    expect(GOLDEN_MISSION_PRESET.objective).toContain("draft a personalized English outreach message");
    expect(GOLDEN_MISSION_PRESET.maximumAccounts).toBe(3);
    expect(GOLDEN_MISSION_PRESET.countries).toContain("Germany");
    expect(GOLDEN_MISSION_PRESET.countries).toContain("Switzerland");
    expect(GOLDEN_MISSION_PRESET.type).toBe("TARGET_ACCOUNT_DISCOVERY");
  });

  it("finds the golden preset by id and returns undefined for unknown ids", () => {
    expect(findPreset(GOLDEN_MISSION_PRESET.id)).toBe(GOLDEN_MISSION_PRESET);
    expect(findPreset("unknown")).toBeUndefined();
    expect(findPreset(null)).toBeUndefined();
    expect(findPreset(undefined)).toBeUndefined();
  });

  it("keeps draft-only external action policy in the preset description", () => {
    expect(GOLDEN_MISSION_PRESET.description.toLowerCase()).not.toContain("send");
    expect(GOLDEN_MISSION_PRESET.description.toLowerCase()).not.toContain("email");
  });
});
