import { DEMO_WORKSPACE_ID, transitionMission } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { DEMO_USER_ID } from "../_shared";

export async function missionAction(params: Promise<{ missionId: string }>, action: "start" | "pause" | "resume" | "cancel") {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { missionId } = await params;
  const result = await transitionMission(DEMO_WORKSPACE_ID, DEMO_USER_ID, missionId, action);
  if (result.kind === "NOT_FOUND") return apiError("MISSION_NOT_FOUND", "Mission not found.", 404);
  if (result.kind === "INVALID_TRANSITION") return apiError("INVALID_MISSION_TRANSITION", `Cannot ${action} a mission in ${result.status} status.`, 409, { status: result.status, action });
  if (result.kind === "CONFLICT") return apiError("MISSION_CONFLICT", "Mission changed while the action was being applied.", 409);
  return NextResponse.json({ data: result.mission });
}
