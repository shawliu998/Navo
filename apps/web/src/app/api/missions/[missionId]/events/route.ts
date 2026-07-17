import { DEMO_WORKSPACE_ID, getMission, getMissionEvents } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";

export async function GET(_: Request, { params }: { params: Promise<{ missionId: string }> }) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { missionId } = await params;
  if (!await getMission(DEMO_WORKSPACE_ID, missionId)) return apiError("MISSION_NOT_FOUND", "Mission not found.", 404);
  const data = await getMissionEvents(DEMO_WORKSPACE_ID, missionId);
  return NextResponse.json({ data, meta: { count: data.length } });
}
