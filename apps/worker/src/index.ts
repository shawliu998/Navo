import { config } from "dotenv";
import { resolve } from "node:path";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { getAIProvider } from "@navo/agents";
import { executeNode } from "@navo/workflows";
import { executeMission } from "./mission-runner";
import { scheduleMissionContinuation } from "./mission-continuation";

config({ path: resolve(process.cwd(), "../../.env.local"), quiet: true });
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:56379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const missionQueue = new Queue("navo-runs", { connection });
const enqueueMission = (payload: { workspaceId: string; missionId: string }) => missionQueue.add("mission.execute", payload, { jobId: `mission-${payload.missionId}`, removeOnComplete: 100, removeOnFail: 100 });
const worker = new Worker("navo-runs", async (job) => {
  if (job.name === "mission.execute") {
    const { workspaceId, missionId } = job.data as { workspaceId?: string; missionId?: string };
    if (!workspaceId || !missionId) throw new Error("mission.execute jobs require workspaceId and missionId.");
    return executeMission({ workspaceId, missionId }, { enqueueMission });
  }
  if (job.name === "mission.continue") {
    const { workspaceId, missionId } = job.data as { workspaceId?: string; missionId?: string };
    if (!workspaceId || !missionId) throw new Error("mission.continue jobs require workspaceId and missionId.");
    return scheduleMissionContinuation({ workspaceId, missionId }, { enqueueMission });
  }
  const { workspaceId, runId, nodeType, input, config: nodeConfig } = job.data as { workspaceId: string; runId: string; nodeType: string; input: Record<string, unknown>; config: Record<string, unknown> };
  if (!workspaceId || !runId) throw new Error("Worker jobs require workspaceId and runId.");
  return executeNode(nodeType, input, nodeConfig, { ai: getAIProvider(), workspaceId, runId, testMode: process.env.EMAIL_TEST_MODE !== "false" });
}, { connection, concurrency: 4 });
worker.on("completed", (job) => console.log(`Run job ${job.id} completed.`));
worker.on("failed", (job, error) => console.error(`Run job ${job?.id ?? "unknown"} failed: ${error.message}`));
console.log("Navo worker is ready on queue navo-runs.");
