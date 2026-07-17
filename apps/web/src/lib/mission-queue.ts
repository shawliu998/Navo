import { Queue } from "bullmq";
import IORedis from "ioredis";

export const missionQueueName = "navo-runs";
export const missionJobName = "mission.execute";

export async function enqueueMission(payload: { workspaceId: string; missionId: string }) {
  const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:56379", { maxRetriesPerRequest: null });
  const queue = new Queue(missionQueueName, { connection });
  try {
    return await queue.add(missionJobName, payload, {
      jobId: `mission-${payload.missionId}`,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  } finally {
    await queue.close();
    connection.disconnect();
  }
}
