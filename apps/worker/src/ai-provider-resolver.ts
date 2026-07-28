import {
  createConfiguredAIProvider,
  getAIProvider,
  MockAIProvider,
  type AIProvider,
} from "@navo/agents";
import { getWorkspaceAIConnectionRuntime } from "@navo/db";

export async function resolveWorkspaceAIProvider(
  workspaceId: string,
  requestedProvider?: string | null,
  requestedModel?: string | null,
): Promise<AIProvider> {
  if (requestedProvider === "mock-ai") return new MockAIProvider();
  const connection = await getWorkspaceAIConnectionRuntime(workspaceId, requestedProvider);
  if (connection) {
    return createConfiguredAIProvider({
      ...connection,
      model: requestedModel ?? connection.model,
    });
  }
  return getAIProvider();
}

export async function getWorkspaceAIExecutionDescriptor(workspaceId: string) {
  const connection = await getWorkspaceAIConnectionRuntime(workspaceId);
  return connection
    ? { provider: connection.provider, model: connection.model }
    : process.env.AI_PROVIDER === "deepseek"
      ? { provider: "deepseek", model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash" }
      : { provider: "mock-ai", model: "deterministic-v1" };
}
