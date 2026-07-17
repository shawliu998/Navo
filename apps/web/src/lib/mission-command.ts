export type MissionAccountCandidate = {
  id: string;
  workspaceId: string;
  website: string | null;
  domain: string | null;
};

/** A mission runner can only research an explicit http(s) website URL. */
export function hasResearchWebsite(website: string | null | undefined) {
  if (!website) return false;
  try {
    const url = new URL(website);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export type MissionAccountGuard =
  | { ok: true; accountId: string }
  | { ok: false; code: "MISSION_ACCOUNT_REQUIRED" | "MISSION_TARGET_ACCOUNT_NOT_FOUND" | "MISSION_TARGET_WEBSITE_REQUIRED"; message: string };

/** Validates the one-account contract before a command can enter the mission queue. */
export function guardMissionAccount(input: {
  accountIds: string[] | undefined;
  workspaceId: string;
  account: MissionAccountCandidate | null;
}): MissionAccountGuard {
  const accountIds = [...new Set(input.accountIds ?? [])];
  if (accountIds.length !== 1) return { ok: false, code: "MISSION_ACCOUNT_REQUIRED", message: "Select exactly one account before creating a mission." };
  if (!input.account || input.account.workspaceId !== input.workspaceId || input.account.id !== accountIds[0]) return { ok: false, code: "MISSION_TARGET_ACCOUNT_NOT_FOUND", message: "The selected account is outside this workspace or does not exist." };
  if (!hasResearchWebsite(input.account.website)) return { ok: false, code: "MISSION_TARGET_WEBSITE_REQUIRED", message: "The selected account needs a valid website URL before it can be researched." };
  return { ok: true, accountId: input.account.id };
}

export const liveMissionStatuses = new Set(["READY", "QUEUED", "ACTIVE", "RUNNING", "PLANNING"]);
export const terminalMissionStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export type MissionLiveSnapshot = { status: string; progress: number; currentStep: string | null; updatedAt?: string; eventCount?: number };
export function shouldRefreshMission(previous: MissionLiveSnapshot, next: MissionLiveSnapshot) {
  return previous.status !== next.status || previous.progress !== next.progress || previous.currentStep !== next.currentStep || previous.updatedAt !== next.updatedAt || previous.eventCount !== next.eventCount;
}
