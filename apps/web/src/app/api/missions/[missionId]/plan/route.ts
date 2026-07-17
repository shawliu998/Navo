import { DEMO_WORKSPACE_ID, getMissionPlan } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";

export async function GET(_: Request, { params }: { params: Promise<{ missionId: string }> }) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { missionId } = await params;
  const data = await getMissionPlan(DEMO_WORKSPACE_ID, missionId);
  if (!data) return apiError("MISSION_PLAN_NOT_FOUND", "Mission plan not found.", 404);
  return NextResponse.json({ data });
}
