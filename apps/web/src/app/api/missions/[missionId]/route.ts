import { DEMO_WORKSPACE_ID, getMission, updateMission } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { missionPatchSchema } from "../_shared";

type Context = { params: Promise<{ missionId: string }> };

export async function GET(_: Request, { params }: Context) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { missionId } = await params;
  const data = await getMission(DEMO_WORKSPACE_ID, missionId);
  if (!data) return apiError("MISSION_NOT_FOUND", "Mission not found.", 404);
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, { params }: Context) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { missionId } = await params;
  const parsed = missionPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_MISSION_PATCH", "Mission update is invalid.", 422, parsed.error.flatten());
  const mission = await updateMission(DEMO_WORKSPACE_ID, missionId, { ...parsed.data, dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined });
  if (!mission) return apiError("MISSION_NOT_FOUND_OR_LOCKED", "Mission was not found or can no longer be edited.", 404);
  return NextResponse.json({ data: mission });
}
