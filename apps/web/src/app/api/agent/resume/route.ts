import { DEMO_WORKSPACE_ID, getAgentStatus, getPendingMissionContinuationParents, setAgentPaused } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { DEMO_USER_ID } from "../../missions/_shared";
import { enqueueMissionContinuation } from "@/lib/mission-queue";

export async function POST() {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const data = await setAgentPaused(DEMO_WORKSPACE_ID, DEMO_USER_ID, false);
  if (!data) return apiError("AGENT_PROFILE_NOT_FOUND", "Agent profile not found.", 404);
  const deferred = await getPendingMissionContinuationParents(DEMO_WORKSPACE_ID);
  await Promise.all(deferred.map((mission) => enqueueMissionContinuation({ workspaceId: DEMO_WORKSPACE_ID, missionId: mission.id })));
  const snapshot = await getAgentStatus(DEMO_WORKSPACE_ID);
  return NextResponse.json({ agent: { status: "RUNNING", headline: "Navo is active", detail: data.currentActivity, activeMissions: snapshot.activeMissionCount, pendingApprovals: snapshot.pendingApprovalCount, operatingMode: data.operatingMode }, data, resumedContinuations: deferred.length });
}
