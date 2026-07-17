import { config } from "dotenv";
import { resolve } from "node:path";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { getAIProvider } from "@navo/agents";
import { executeNode } from "@navo/workflows";
import { executeMission } from "./mission-runner";

config({ path: resolve(process.cwd(), "../../.env.local"), quiet: true });
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:56379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const worker = new Worker("navo-runs", async (job) => {
  if (job.name === "mission.execute") {
    const { workspaceId, missionId } = job.data as { workspaceId?: string; missionId?: string };
    if (!workspaceId || !missionId) throw new Error("mission.execute jobs require workspaceId and missionId.");
    return executeMission({ workspaceId, missionId });
  }
  const { workspaceId, runId, nodeType, input, config: nodeConfig } = job.data as { workspaceId: string; runId: string; nodeType: string; input: Record<string, unknown>; config: Record<string, unknown> };
  if (!workspaceId || !runId) throw new Error("Worker jobs require workspaceId and runId.");
  return executeNode(nodeType, input, nodeConfig, { ai: getAIProvider(), workspaceId, runId, testMode: process.env.EMAIL_TEST_MODE !== "false" });
}, { connection, concurrency: 4 });
worker.on("completed", (job) => console.log(`Run job ${job.id} completed.`));
worker.on("failed", (job, error) => console.error(`Run job ${job?.id ?? "unknown"} failed: ${error.message}`));
console.log("Navo worker is ready on queue navo-runs.");
