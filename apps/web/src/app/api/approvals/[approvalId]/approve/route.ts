import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  approvals,
  auditLogs,
  messages,
  nodeRuns,
  runs,
} from "@exportplay/db";
import { DEMO_WORKSPACE_ID } from "@exportplay/db/queries";
import { apiError, requireDemoSession } from "@/lib/api";
const schema = z.object({
  status: z.enum([
    "APPROVED",
    "APPROVED_WITH_CHANGES",
    "CHANGES_REQUESTED",
    "REJECTED",
  ]),
  editedSubject: z.string().min(1),
  editedBody: z.string().min(1),
  reason: z.string().optional(),
});
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  if (!(await requireDemoSession()))
    return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { approvalId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError(
      "VALIDATION_ERROR",
      "Invalid approval decision.",
      422,
      parsed.error.flatten(),
    );
  const result = await db.transaction(async (tx) => {
    const [approval] = await tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, DEMO_WORKSPACE_ID),
          eq(approvals.id, approvalId),
        ),
      )
      .limit(1);
    if (!approval || approval.status !== "PENDING") return null;
    const diff = {
      subjectChanged: parsed.data.editedSubject !== approval.originalSubject,
      bodyChanged: parsed.data.editedBody !== approval.originalBody,
    };
    await tx
      .update(approvals)
      .set({
        ...parsed.data,
        diff,
        reviewerName: "王静",
        reviewedAt: new Date(),
        updatedAt: new Date(),
        revision: sql`${approvals.revision}+1`,
      })
      .where(
        and(
          eq(approvals.workspaceId, DEMO_WORKSPACE_ID),
          eq(approvals.id, approvalId),
          eq(approvals.revision, approval.revision),
        ),
      );
    if (approval.messageId)
      await tx
        .update(messages)
        .set({
          subject: parsed.data.editedSubject,
          body: parsed.data.editedBody,
          status: parsed.data.status.startsWith("APPROVED")
            ? "APPROVED"
            : "DRAFT",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(messages.workspaceId, DEMO_WORKSPACE_ID),
            eq(messages.id, approval.messageId),
          ),
        );
    if (parsed.data.status.startsWith("APPROVED")) {
      await tx
        .update(nodeRuns)
        .set({
          status: "COMPLETED",
          completedAt: new Date(),
          output: { decision: parsed.data.status, reviewer: "王静" },
        })
        .where(
          and(
            eq(nodeRuns.workspaceId, DEMO_WORKSPACE_ID),
            eq(nodeRuns.id, approval.nodeRunId!),
          ),
        );
      await tx
        .update(runs)
        .set({
          status: "COMPLETED",
          currentNode: "Sync CRM",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(runs.workspaceId, DEMO_WORKSPACE_ID),
            eq(runs.id, approval.runId),
          ),
        );
    }
    await tx
      .insert(auditLogs)
      .values({
        workspaceId: DEMO_WORKSPACE_ID,
        createdBy: approval.createdBy,
        actorName: "王静",
        action: "APPROVAL_REVIEWED",
        resourceType: "APPROVAL",
        resourceId: approvalId,
        requestId: crypto.randomUUID(),
        summary: `Decision: ${parsed.data.status}`,
        metadata: diff,
      });
    return approval;
  });
  if (!result)
    return apiError(
      "APPROVAL_CONFLICT",
      "Approval was already processed or not found.",
      409,
    );
  return NextResponse.json({
    data: { id: approvalId, status: parsed.data.status },
  });
}
