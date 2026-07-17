import { createMission, DEMO_WORKSPACE_ID, getMissions } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { DEMO_USER_ID, missionInputSchema } from "./_shared";

export async function GET() {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const data = await getMissions(DEMO_WORKSPACE_ID);
  return NextResponse.json({ data, meta: { count: data.length, workspaceId: DEMO_WORKSPACE_ID } });
}

export async function POST(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = missionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_MISSION", "Mission input is invalid.", 422, parsed.error.flatten());
  const mission = await createMission(DEMO_WORKSPACE_ID, DEMO_USER_ID, { ...parsed.data, dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined });
  return NextResponse.json({ data: mission, missionId: mission.id }, { status: 201 });
}
