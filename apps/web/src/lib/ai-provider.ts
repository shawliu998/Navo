import { createConfiguredAIProvider, getAIProvider } from "@navo/agents";
import { getWorkspaceAIConnectionRuntime } from "@navo/db";

export async function resolveWorkspaceAIProvider(workspaceId: string) {
  const connection = await getWorkspaceAIConnectionRuntime(workspaceId);
  return connection ? createConfiguredAIProvider(connection) : getAIProvider();
}
