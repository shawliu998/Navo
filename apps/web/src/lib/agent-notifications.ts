export type AgentNotificationSeverity = "ERROR" | "WARNING" | "SUCCESS" | "INFO";
export type AgentNotificationType =
  | "MISSION_FAILED"
  | "APPROVAL_REQUIRED"
  | "TASK_OPEN"
  | "MISSION_COMPLETED"
  | "AGENT_EVENT";

export type AgentNotification = {
  id: string;
  type: AgentNotificationType;
  severity: AgentNotificationSeverity;
  title: string;
  detail: string;
  occurredAt: string | null;
  href: string;
};

export type AgentNotificationInputs = {
  events?: Array<{
    id?: string | null;
    type?: string | null;
    severity?: string | null;
    occurredAt?: Date | string | null;
    missionId?: string | null;
    approvalId?: string | null;
    taskId?: string | null;
  }>;
  missions?: Array<{
    id?: string | null;
    status?: string | null;
    updatedAt?: Date | string | null;
    completedAt?: Date | string | null;
  }>;
  approvals?: Array<{
    id?: string | null;
    status?: string | null;
    createdAt?: Date | string | null;
    updatedAt?: Date | string | null;
  }>;
  tasks?: Array<{
    id?: string | null;
    status?: string | null;
    createdAt?: Date | string | null;
    updatedAt?: Date | string | null;
  }>;
};
type AgentEventInput = NonNullable<AgentNotificationInputs["events"]>[number];

const severityRank: Record<AgentNotificationSeverity, number> = {
  ERROR: 0,
  WARNING: 1,
  SUCCESS: 2,
  INFO: 3,
};

function severity(value: string | null | undefined, fallback: AgentNotificationSeverity): AgentNotificationSeverity {
  const normalized = value?.toUpperCase();
  if (normalized === "CRITICAL" || normalized === "ERROR") return "ERROR";
  if (normalized === "WARN" || normalized === "WARNING") return "WARNING";
  if (normalized === "SUCCESS") return "SUCCESS";
  if (normalized === "INFO") return "INFO";
  return fallback;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function eventHref(event: AgentEventInput) {
  if (event.approvalId) return `/app/approvals/${event.approvalId}`;
  if (event.taskId) return "/app/tasks";
  if (event.missionId) return `/app/missions/${event.missionId}?tab=activity`;
  return "/app/runs";
}

function eventDetail(type: string | null | undefined) {
  const normalized = type?.toUpperCase();
  if (normalized?.includes("FAIL")) return "Review the mission activity and saved result.";
  if (normalized?.includes("APPROVAL")) return "An outbound action needs operator review.";
  if (normalized?.includes("TASK")) return "A follow-up action is waiting in Tasks.";
  return "A safe-to-share agent activity was recorded.";
}

function eventTitle(type: string | null | undefined) {
  const normalized = type?.toUpperCase() ?? "";
  if (normalized.includes("FAIL")) return "Agent step needs attention";
  if (normalized.includes("APPROVAL")) return "Approval activity";
  if (normalized.includes("TASK")) return "Task activity";
  if (normalized.includes("RETRY")) return "Mission retry activity";
  if (normalized.includes("EVIDENCE")) return "Evidence activity";
  if (normalized.includes("SIGNAL")) return "Signal activity";
  if (normalized.includes("QUALIF")) return "Qualification activity";
  if (normalized.includes("DRAFT") || normalized.includes("MESSAGE")) return "Draft activity";
  return "Agent activity";
}

export function deriveAgentNotifications(input: AgentNotificationInputs, limit = 20): AgentNotification[] {
  const notifications: AgentNotification[] = [];

  for (const event of input.events ?? []) {
    if (!event.id) continue;
    const eventType = event.type?.toUpperCase() ?? "AGENT_EVENT";
    if (eventType === "MISSION_FAILED" || eventType === "MISSION_COMPLETED") continue;
    notifications.push({
      id: `event:${event.id}`,
      type: "AGENT_EVENT",
      severity: severity(event.severity, "INFO"),
      title: eventTitle(event.type),
      detail: eventDetail(event.type),
      occurredAt: iso(event.occurredAt),
      href: eventHref(event),
    });
  }

  for (const mission of input.missions ?? []) {
    if (!mission.id) continue;
    const status = mission.status?.toUpperCase();
    if (status !== "FAILED" && status !== "COMPLETED") continue;
    const completed = status === "COMPLETED";
    notifications.push({
      id: `mission:${mission.id}:${status}`,
      type: completed ? "MISSION_COMPLETED" : "MISSION_FAILED",
      severity: completed ? "SUCCESS" : "ERROR",
      title: completed ? "Mission completed" : "Mission failed",
      detail: completed ? "A mission result is ready to review." : "Review the mission activity and retry if needed.",
      occurredAt: iso(mission.completedAt ?? mission.updatedAt),
      href: `/app/missions/${mission.id}`,
    });
  }

  for (const approval of input.approvals ?? []) {
    if (!approval.id || approval.status?.toUpperCase() !== "PENDING") continue;
    notifications.push({
      id: `approval:${approval.id}:pending`,
      type: "APPROVAL_REQUIRED",
      severity: "WARNING",
      title: "Approval needed",
      detail: "Review the proposed outbound action before any operator sends it.",
      occurredAt: iso(approval.updatedAt ?? approval.createdAt),
      href: `/app/approvals/${approval.id}`,
    });
  }

  for (const task of input.tasks ?? []) {
    if (!task.id || task.status?.toUpperCase() !== "OPEN") continue;
    notifications.push({
      id: `task:${task.id}:open`,
      type: "TASK_OPEN",
      severity: "WARNING",
      title: "Open task",
      detail: "A follow-up action is waiting in Tasks.",
      occurredAt: iso(task.updatedAt ?? task.createdAt),
      href: "/app/tasks",
    });
  }

  return notifications
    .sort((left, right) => {
      const priority = severityRank[left.severity] - severityRank[right.severity];
      if (priority !== 0) return priority;
      return (right.occurredAt ?? "").localeCompare(left.occurredAt ?? "");
    })
    .slice(0, limit);
}

export function isActionableNotification(notification: AgentNotification) {
  return notification.type === "MISSION_FAILED" || notification.type === "APPROVAL_REQUIRED" || notification.type === "TASK_OPEN";
}
