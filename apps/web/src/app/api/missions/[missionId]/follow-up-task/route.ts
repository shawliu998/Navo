import { createMissionFollowUpTask, DEMO_WORKSPACE_ID } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { DEMO_USER_ID } from "../../_shared";

export async function POST(_: Request, { params }: { params: Promise<{ missionId: string }> }) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { missionId } = await params;
  const result = await createMissionFollowUpTask(DEMO_WORKSPACE_ID, DEMO_USER_ID, missionId);
  if (result.kind === "NOT_FOUND") return apiError("MISSION_NOT_FOUND", "Mission or selected account was not found in this workspace.", 404);
  if (result.kind === "NOT_COMPLETED") return apiError("MISSION_NOT_COMPLETED", "Follow-up tasks can only be created for completed missions.", 409);
  if (result.kind === "TASK_LINK_INVALID") return apiError("MISSION_TASK_LINK_INVALID", "Mission task link is invalid; no duplicate task was created.", 409);
  return NextResponse.json({ data: result.task, meta: { created: result.kind === "CREATED", noSend: true } }, { status: result.kind === "CREATED" ? 201 : 200 });
}
