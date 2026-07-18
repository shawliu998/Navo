import { Queue } from "bullmq";
import IORedis from "ioredis";

export const missionQueueName = "navo-runs";
export const missionJobName = "mission.execute";

async function enqueue(jobName: string, payload: Record<string, string>, jobId: string) {
  const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:56379", { maxRetriesPerRequest: null });
  const queue = new Queue(missionQueueName, { connection });
  try {
    return await queue.add(jobName, payload, {
      jobId,
      removeOnComplete: jobName === "mission.continue" ? true : 100,
      removeOnFail: 100,
    });
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

export const enqueueMission = (payload: { workspaceId: string; missionId: string }) => enqueue(missionJobName, payload, `mission-${payload.missionId}`);
export const enqueueMissionContinuation = (payload: { workspaceId: string; missionId: string }) => enqueue("mission.continue", payload, `mission-continuation-${payload.missionId}`);
export const enqueueReplyFollowUp = (payload: { workspaceId: string; inboundMessageId: string }) => enqueue("reply.follow-up", payload, `reply-follow-up-${payload.inboundMessageId}`);
export const enqueueResendInbound = (payload: { emailId: string }) => enqueue("resend.inbound", payload, `resend-inbound-${payload.emailId}`);
export const enqueueAgentTick = (workspaceId: string, options: { trigger?: string; resourceId?: string; jobId?: string } = {}) => enqueue(
  "agent.tick",
  { workspaceId, trigger: options.trigger ?? "MANUAL", ...(options.resourceId ? { resourceId: options.resourceId } : {}) },
  options.jobId ?? `agent-tick-${crypto.randomUUID()}`,
);
