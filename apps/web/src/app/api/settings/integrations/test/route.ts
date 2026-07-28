import { z } from "zod";
import { NextResponse } from "next/server";
import { createConfiguredAIProvider } from "@navo/agents";
import {
  DEMO_WORKSPACE_ID,
  getWorkspaceAIConnectionRuntime,
  markWorkspaceAIConnectionTest,
} from "@navo/db";
import { apiError, requireDemoSession } from "@/lib/api";
import { workspaceAIConnectionTestSchema } from "@/lib/integration-settings";

const connectionTestOutput = z.object({ status: z.literal("ok") }).strict();

export async function POST(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = workspaceAIConnectionTestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_AI_CONNECTION_TEST", "Choose a supported AI connection.", 422, parsed.error.flatten());
  const connection = await getWorkspaceAIConnectionRuntime(DEMO_WORKSPACE_ID, parsed.data.provider, true);
  if (!connection) return apiError("AI_CONNECTION_NOT_CONFIGURED", "Save this connection before testing it.", 404);
  try {
    const result = await createConfiguredAIProvider(connection).generateStructured({
      operation: "connection-test",
      systemInstruction: 'Return {"status":"ok"}.',
      input: { purpose: "Verify the configured Navo AI connection." },
      outputSchema: connectionTestOutput,
      promptVersion: "connection-test-v1",
      maxTokens: 40,
      temperature: 0,
      timeoutMs: 15_000,
    });
    const data = await markWorkspaceAIConnectionTest(DEMO_WORKSPACE_ID, parsed.data.provider, { ok: true });
    return NextResponse.json({ data, meta: { provider: result.provider, model: result.model, latencyMs: result.latencyMs } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Connection test failed.";
    const data = await markWorkspaceAIConnectionTest(DEMO_WORKSPACE_ID, parsed.data.provider, { ok: false, error: message });
    return apiError("AI_CONNECTION_TEST_FAILED", message, 502, { connection: data });
  }
}
