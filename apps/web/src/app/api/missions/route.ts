import { getAIProvider } from "@navo/agents";
import { createMission, DEMO_WORKSPACE_ID, failMissionQueue, getMissions, prepareMissionStart } from "@navo/db/queries";
import { planMission } from "@navo/workflows/mission-planner";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { enqueueMission } from "@/lib/mission-queue";
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
  try {
    const ai = getAIProvider();
    const generated = await planMission(ai, { name: parsed.data.name, objective: parsed.data.objective, targetDescription: "The single selected account in the demo workspace." });
    const shouldStart = parsed.data.status === "ACTIVE" || parsed.data.status === "RUNNING";
    const mission = await createMission(DEMO_WORKSPACE_ID, DEMO_USER_ID, { ...parsed.data, status: shouldStart ? "READY" : parsed.data.status, targetCount: 1, maximumAccounts: 1, plan: generated.data, provider: generated.provider, model: generated.model, dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined });
    let responseMission = mission;
    if (shouldStart) {
      const started = await prepareMissionStart(DEMO_WORKSPACE_ID, DEMO_USER_ID, mission.id);
      if (started.kind !== "OK") return apiError("MISSION_START_FAILED", "Mission could not enter the execution queue.", 409, started);
      responseMission = started.mission;
      try { await enqueueMission({ workspaceId: DEMO_WORKSPACE_ID, missionId: mission.id }); }
      catch {
        const message = "MISSION_QUEUE_FAILED: Redis queue submission failed.";
        await failMissionQueue(DEMO_WORKSPACE_ID, DEMO_USER_ID, mission.id, message);
        return apiError("MISSION_QUEUE_FAILED", message, 503, { missionId: mission.id });
      }
    }
    return NextResponse.json({ data: responseMission, missionId: mission.id, plan: generated.data }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Mission could not be created.";
    return apiError(message.startsWith("MISSION_TARGET") ? "MISSION_TARGET_REQUIRED" : "MISSION_PLANNER_FAILED", message, message.startsWith("MISSION_TARGET") ? 422 : 502);
  }
}
