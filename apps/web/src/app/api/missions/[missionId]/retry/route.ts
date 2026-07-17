import { missionPlanSchema } from "@navo/agents";
import { agentEvents, auditLogs, createMission, db, DEMO_WORKSPACE_ID, failMissionQueue, getMission, getMissions, prepareMissionStart } from "@navo/db";
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
  const retryName = `${original.mission.name} (Retry)`.slice(0, 160);
  const existingRetry = (await getMissions(DEMO_WORKSPACE_ID)).find((mission) => mission.name === retryName && ["READY", "RUNNING", "ACTIVE", "PLANNING"].includes(mission.status));
  if (existingRetry) return NextResponse.json({ data: existingRetry, missionId: existingRetry.id, meta: { retryOfMissionId: missionId, existing: true, noSend: true } });
  const retry = await createMission(DEMO_WORKSPACE_ID, DEMO_USER_ID, {
    name: retryName, type: original.mission.type, objective: original.mission.objective,
    desiredOutcome: original.mission.desiredOutcome ?? undefined, operatingMode: original.mission.operatingMode as "OBSERVE" | "RECOMMEND" | "APPROVAL_CONTROLLED",
    playId: original.mission.playId ?? undefined, inputSource: original.mission.inputSource, approvalPolicy: original.mission.approvalPolicy,
    targetAccountId: original.mission.targetAccountId, targetCount: 1, maximumAccounts: 1, estimatedCostLimit: Number(original.mission.estimatedCostLimit ?? 0),
    testMode: original.mission.testMode, dueAt: original.mission.dueAt ?? undefined, targetCriteria: original.mission.targetCriteria as Record<string, unknown>, stopConditions: original.mission.stopConditions as unknown[],
    status: "READY", plan: plan.data, provider: "mock-ai", model: "deterministic-v1",
  });
  const started = await prepareMissionStart(DEMO_WORKSPACE_ID, DEMO_USER_ID, retry.id);
  if (started.kind !== "OK") return apiError("MISSION_RETRY_START_FAILED", "The retry could not enter the execution queue.", 409, started);
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.insert(agentEvents).values([
      { workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, missionId: retry.id, accountId: retry.targetAccountId, type: "MISSION_RETRIED", title: "Retry mission created from failed history.", severity: "INFO", occurredAt: now, metadata: { retryOfMissionId: missionId, noSend: true } },
      { workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, missionId, accountId: original.mission.targetAccountId, type: "MISSION_RETRY_CREATED", title: "A new retry mission was created; this failed history was preserved.", severity: "INFO", occurredAt: now, metadata: { retryMissionId: retry.id, noSend: true } },
    ]);
    await tx.insert(auditLogs).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, actorId: DEMO_USER_ID, action: "MISSION_RETRY_CREATED", resourceType: "MISSION", resourceId: retry.id, summary: "Created a new Mock retry Mission; the original failed Mission was preserved.", metadata: { retryOfMissionId: missionId, noSend: true } });
  });
  try { await enqueueMission({ workspaceId: DEMO_WORKSPACE_ID, missionId: retry.id }); }
  catch {
    const message = "MISSION_QUEUE_FAILED: Redis queue submission failed.";
    await failMissionQueue(DEMO_WORKSPACE_ID, DEMO_USER_ID, retry.id, message);
    return apiError("MISSION_QUEUE_FAILED", message, 503, { missionId: retry.id, retryOfMissionId: missionId });
  }
  return NextResponse.json({ data: started.mission, missionId: retry.id, meta: { retryOfMissionId: missionId, noSend: true } }, { status: 201 });
}
