import { and, desc, eq, inArray } from "drizzle-orm";
import { agentEvents, agentMissions, approvals, db, DEMO_WORKSPACE_ID, tasks } from "@navo/db";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { deriveAgentNotifications, isActionableNotification } from "@/lib/agent-notifications";

export async function GET() {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);

  const [events, missions, pendingApprovals, openTasks] = await Promise.all([
    db.select({ id: agentEvents.id, type: agentEvents.type, severity: agentEvents.severity, occurredAt: agentEvents.occurredAt, missionId: agentEvents.missionId, approvalId: agentEvents.approvalId, taskId: agentEvents.taskId })
      .from(agentEvents)
      .where(eq(agentEvents.workspaceId, DEMO_WORKSPACE_ID))
      .orderBy(desc(agentEvents.occurredAt))
      .limit(40),
    db.select({ id: agentMissions.id, status: agentMissions.status, updatedAt: agentMissions.updatedAt, completedAt: agentMissions.completedAt })
      .from(agentMissions)
      .where(and(eq(agentMissions.workspaceId, DEMO_WORKSPACE_ID), inArray(agentMissions.status, ["FAILED", "COMPLETED"])))
      .orderBy(desc(agentMissions.updatedAt))
      .limit(20),
    db.select({ id: approvals.id, status: approvals.status, createdAt: approvals.createdAt, updatedAt: approvals.updatedAt })
      .from(approvals)
      .where(and(eq(approvals.workspaceId, DEMO_WORKSPACE_ID), eq(approvals.status, "PENDING")))
      .orderBy(desc(approvals.updatedAt))
      .limit(20),
    db.select({ id: tasks.id, status: tasks.status, createdAt: tasks.createdAt, updatedAt: tasks.updatedAt })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, DEMO_WORKSPACE_ID), eq(tasks.status, "OPEN")))
      .orderBy(desc(tasks.updatedAt))
      .limit(20),
  ]);

  const notifications = deriveAgentNotifications({ events, missions, approvals: pendingApprovals, tasks: openTasks });
  return NextResponse.json({
    data: notifications,
    meta: {
      count: notifications.length,
      actionableCount: notifications.filter(isActionableNotification).length,
      readState: "not_persisted",
    },
  });
}
