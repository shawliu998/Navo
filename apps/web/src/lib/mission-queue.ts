import { Queue } from "bullmq";
import IORedis from "ioredis";

export const missionQueueName = "navo-runs";
export const missionJobName = "mission.execute";

async function enqueue(jobName: string, payload: { workspaceId: string; missionId: string }, jobId: string) {
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
