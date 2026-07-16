import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, auditLogs, nodeRuns, runs } from "@exportplay/db";
import { DEMO_WORKSPACE_ID } from "@exportplay/db/queries";
import { apiError, requireDemoSession } from "@/lib/api";
const schema = z.object({ nodeRunId: z.string().uuid() });
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!(await requireDemoSession()))
    return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { runId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("VALIDATION_ERROR", "nodeRunId is required.", 422);
  const result = await db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(nodeRuns)
      .where(
        and(
          eq(nodeRuns.workspaceId, DEMO_WORKSPACE_ID),
          eq(nodeRuns.runId, runId),
          eq(nodeRuns.id, parsed.data.nodeRunId),
        ),
      )
      .limit(1);
    if (!original) return null;
    const [latest] = await tx
      .select()
      .from(nodeRuns)
      .where(
        and(
          eq(nodeRuns.workspaceId, DEMO_WORKSPACE_ID),
          eq(nodeRuns.runId, runId),
          eq(nodeRuns.logicalNodeId, original.logicalNodeId),
        ),
      )
      .orderBy(desc(nodeRuns.attempt))
      .limit(1);
    const [retry] = await tx
      .insert(nodeRuns)
      .values({
        workspaceId: DEMO_WORKSPACE_ID,
        createdBy: original.createdBy,
        runId,
        logicalNodeId: original.logicalNodeId,
        nodeLabel: original.nodeLabel,
        attempt: (latest?.attempt ?? 0) + 1,
        status: "COMPLETED",
        input: original.input,
        output: { retried: true, previousAttempt: original.attempt },
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 420,
        provider: "mock-ai",
        model: "deterministic-v1",
        promptVersion: original.promptVersion,
        inputTokens: 120,
        outputTokens: 42,
        estimatedCost: "0",
        logs: [
          {
            at: new Date().toISOString(),
            level: "info",
            message:
              "Deterministic retry completed; historical attempt retained.",
          },
        ],
      })
      .returning();
    await tx
      .update(runs)
      .set({
        status: "COMPLETED",
        errorCount: 0,
        currentNode: "Sync CRM",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(runs.workspaceId, DEMO_WORKSPACE_ID), eq(runs.id, runId)));
    await tx
      .insert(auditLogs)
      .values({
        workspaceId: DEMO_WORKSPACE_ID,
        createdBy: original.createdBy,
        actorName: "刘晓岚",
        action: "NODE_RETRIED",
        resourceType: "NODE_RUN",
        resourceId: retry!.id,
        requestId: crypto.randomUUID(),
        summary: `Created attempt ${retry!.attempt}; attempt ${original.attempt} retained.`,
      });
    return retry;
  });
  if (!result) return apiError("NOT_FOUND", "Run or node run not found.", 404);
  return NextResponse.json({ data: result }, { status: 201 });
}
