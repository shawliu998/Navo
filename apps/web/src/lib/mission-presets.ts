export type MissionPreset = {
  id: string;
  name: string;
  description: string;
  objective: string;
  desiredOutcome: string;
  type: string;
  countries: string;
  industries: string;
  inputSource: string;
  maximumAccounts: number;
  stopConditions: string;
};

export const GOLDEN_MISSION_PRESET: MissionPreset = {
  id: "dach-industrial-outreach",
  name: "DACH industrial outreach",
  description:
    "Find the 3 best DACH industrial companies, research evidence and needs, qualify and rank them, draft a personalized English outreach message, and create the next-step task.",
  objective:
    "Find the 3 best DACH industrial companies, research evidence and needs, qualify and rank them, draft a personalized English outreach message, and create the next-step task.",
  desiredOutcome:
    "Three ranked, evidence-backed DACH accounts with a personalized English outreach draft and a follow-up task.",
  type: "TARGET_ACCOUNT_DISCOVERY",
  countries: "Germany, Austria, Switzerland",
  industries: "Industrial manufacturing, Packaging, Automotive Components",
  inputSource: "DEMO_ACCOUNTS",
  maximumAccounts: 3,
  stopConditions:
    "Three accounts researched, ranked and best account selected\nOutreach draft saved as DRAFT\nNext-step task created\nMaximum 20 iterations\nTwo consecutive steps fail",
};

export function findPreset(id: string | null | undefined): MissionPreset | undefined {
  return id === GOLDEN_MISSION_PRESET.id ? GOLDEN_MISSION_PRESET : undefined;
}
