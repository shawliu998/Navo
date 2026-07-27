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
  type: "OUTREACH_PREPARATION",
  countries: "Germany, Austria, Switzerland",
  industries: "Industrial manufacturing, Packaging, Automotive Components",
  inputSource: "DEMO_ACCOUNTS",
  maximumAccounts: 3,
  stopConditions:
    "Three accounts researched, ranked and best account selected\nOutreach draft saved as DRAFT\nNext-step task created\nMaximum 20 iterations",
};

export const OPPORTUNITY_DISCOVERY_PRESET: MissionPreset = {
  id: "discover-industrial-opportunities",
  name: "Discover industrial opportunities",
  description: "Research, qualify and rank matching industrial accounts without creating outreach.",
  objective: "Discover the strongest evidence-backed industrial sales opportunity in DACH, qualify the available accounts, rank viable matches, and explain the recommended next action without preparing outreach.",
  desiredOutcome: "A ranked opportunity or an explicit no-suitable-match outcome with sourced evidence.",
  type: "OPPORTUNITY_DISCOVERY",
  countries: "Germany, Austria, Switzerland",
  industries: "Industrial manufacturing, Packaging, Automotive Components",
  inputSource: "DEMO_ACCOUNTS",
  maximumAccounts: 3,
  stopConditions: "Best viable account selected or no suitable match recorded\nEvidence and qualification persisted\nMaximum 20 iterations",
};

export const SINGLE_ACCOUNT_PRESET: MissionPreset = {
  id: "prepare-single-account-outreach",
  name: "Prepare single-account outreach",
  description: "Research one chosen account and save an evidence-backed English DRAFT plus review task.",
  objective: "Research one selected industrial account, qualify its fit, identify a supported public contact when available, and prepare an evidence-backed English outreach DRAFT with an internal review task.",
  desiredOutcome: "One reviewed account with sourced qualification, a DRAFT, memory facts, and a next-step task.",
  type: "OUTREACH_PREPARATION",
  countries: "Germany, Austria, Switzerland",
  industries: "Industrial manufacturing, Packaging, Automotive Components",
  inputSource: "DEMO_ACCOUNTS",
  maximumAccounts: 1,
  stopConditions: "Selected account researched and qualified\nOutreach saved as DRAFT or no-match recorded\nMaximum 20 iterations",
};

export const MISSION_PRESETS = [OPPORTUNITY_DISCOVERY_PRESET, GOLDEN_MISSION_PRESET, SINGLE_ACCOUNT_PRESET] as const;

export function findPreset(id: string | null | undefined): MissionPreset | undefined {
  return MISSION_PRESETS.find((preset) => preset.id === id);
}
