import { DEMO_WORKSPACE_ID, failMissionQueue, prepareMissionStart, transitionMission } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { DEMO_USER_ID } from "../_shared";
import { enqueueMission } from "@/lib/mission-queue";

export async function missionAction(params: Promise<{ missionId: string }>, action: "start" | "pause" | "resume" | "cancel") {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { missionId } = await params;
  if (action === "start") {
    const result = await prepareMissionStart(DEMO_WORKSPACE_ID, DEMO_USER_ID, missionId);
    if (result.kind === "NOT_FOUND") return apiError("MISSION_NOT_FOUND", "Mission not found.", 404);
    if (result.kind === "INVALID_TRANSITION") return apiError("INVALID_MISSION_TRANSITION", `Cannot start a mission in ${result.status} status.`, 409);
    if (result.kind === "PLAN_REQUIRED") return apiError("MISSION_PLAN_REQUIRED", "Generate and save a mission plan before starting.", 422);
    if (result.kind === "CONFLICT") return apiError("MISSION_CONFLICT", "Mission changed while it was starting.", 409);
    try { await enqueueMission({ workspaceId: DEMO_WORKSPACE_ID, missionId }); }
    catch {
      const message = "MISSION_QUEUE_FAILED: Redis queue submission failed.";
      await failMissionQueue(DEMO_WORKSPACE_ID, DEMO_USER_ID, missionId, message);
      return apiError("MISSION_QUEUE_FAILED", message, 503);
    }
    return NextResponse.json({ data: result.mission });
  }
  const result = await transitionMission(DEMO_WORKSPACE_ID, DEMO_USER_ID, missionId, action);
  if (result.kind === "NOT_FOUND") return apiError("MISSION_NOT_FOUND", "Mission not found.", 404);
  if (result.kind === "INVALID_TRANSITION") return apiError("INVALID_MISSION_TRANSITION", `Cannot ${action} a mission in ${result.status} status.`, 409, { status: result.status, action });
  if (result.kind === "CONFLICT") return apiError("MISSION_CONFLICT", "Mission changed while the action was being applied.", 409);
  return NextResponse.json({ data: result.mission });
}
