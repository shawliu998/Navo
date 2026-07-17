import { missionPlanSchema } from "@navo/agents";
import { createMissionRetry, DEMO_WORKSPACE_ID, failMissionQueue, getMission, prepareMissionStart } from "@navo/db";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { enqueueMission } from "@/lib/mission-queue";
import { DEMO_USER_ID } from "../../_shared";

export async function POST(_: Request, { params }: { params: Promise<{ missionId: string }> }) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { missionId } = await params;
  const original = await getMission(DEMO_WORKSPACE_ID, missionId);
  if (!original) return apiError("MISSION_NOT_FOUND", "Mission was not found in this workspace.", 404);
  if (original.mission.status !== "FAILED") return apiError("MISSION_NOT_RETRYABLE", "Only FAILED missions can be retried as a new mission.", 409);
  if (original.mission.provider !== "mock-ai" || original.mission.model !== "deterministic-v1") return apiError("MISSION_RETRY_PROVIDER_UNSUPPORTED", "Only Mock demo missions can be retried from this flow.", 422);
  const plan = missionPlanSchema.safeParse(original.mission.plan);
  if (!plan.success || !original.mission.targetAccountId) return apiError("MISSION_RETRY_PLAN_UNAVAILABLE", "This failed mission has no reusable single-account Mock plan.", 422);
  const retryResult = await createMissionRetry(DEMO_WORKSPACE_ID, DEMO_USER_ID, missionId);
  if (retryResult.kind === "NOT_FOUND") return apiError("MISSION_NOT_FOUND", "Mission was not found in this workspace.", 404);
  if (retryResult.kind === "NOT_RETRYABLE") return apiError("MISSION_NOT_RETRYABLE", "Only FAILED missions can be retried as a new mission.", 409);
  if (retryResult.kind === "PROVIDER_UNSUPPORTED") return apiError("MISSION_RETRY_PROVIDER_UNSUPPORTED", "Only Mock demo missions can be retried from this flow.", 422);
  if (retryResult.kind === "PLAN_UNAVAILABLE") return apiError("MISSION_RETRY_PLAN_UNAVAILABLE", "This failed mission has no reusable single-account Mock plan.", 422);
  if (retryResult.kind === "EXISTS") return NextResponse.json({ data: retryResult.mission, missionId: retryResult.mission.id, meta: { retryOfMissionId: missionId, existing: true, noSend: true } });
  const retry = retryResult.mission;
  const started = await prepareMissionStart(DEMO_WORKSPACE_ID, DEMO_USER_ID, retry.id);
  if (started.kind !== "OK") return apiError("MISSION_RETRY_START_FAILED", "The retry could not enter the execution queue.", 409, started);
  try { await enqueueMission({ workspaceId: DEMO_WORKSPACE_ID, missionId: retry.id }); }
  catch {
    const message = "MISSION_QUEUE_FAILED: Redis queue submission failed.";
    await failMissionQueue(DEMO_WORKSPACE_ID, DEMO_USER_ID, retry.id, message);
    return apiError("MISSION_QUEUE_FAILED", message, 503, { missionId: retry.id, retryOfMissionId: missionId });
  }
  return NextResponse.json({ data: started.mission, missionId: retry.id, meta: { retryOfMissionId: missionId, noSend: true } }, { status: 201 });
}
