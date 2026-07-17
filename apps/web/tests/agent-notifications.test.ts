import { describe, expect, it } from "vitest";
import { deriveAgentNotifications } from "../src/lib/agent-notifications";

describe("deriveAgentNotifications", () => {
  it("sorts failures and operator actions ahead of informational activity", () => {
    const notifications = deriveAgentNotifications({
      events: [{ id: "event-info", title: "Research saved", severity: "INFO", occurredAt: "2026-01-03T00:00:00.000Z", missionId: "mission-1" }],
      missions: [{ id: "mission-1", status: "FAILED", updatedAt: "2026-01-02T00:00:00.000Z" }],
      approvals: [{ id: "approval-1", status: "PENDING", createdAt: "2026-01-01T00:00:00.000Z" }],
      tasks: [{ id: "task-1", status: "OPEN", createdAt: "2025-12-31T00:00:00.000Z" }],
    });
    expect(notifications.map(({ type }) => type)).toEqual(["MISSION_FAILED", "APPROVAL_REQUIRED", "TASK_OPEN", "AGENT_EVENT"]);
  });

  it("uses stable links and excludes missing records", () => {
    const notifications = deriveAgentNotifications({
      events: [
        { id: "e-1", type: "APPROVAL_REQUESTED", title: "Approval requested", approvalId: "a-1" },
        { id: "e-2", type: "TASK_CREATED", title: "Task created", taskId: "t-1" },
        { title: "No stable id" },
      ],
      missions: [{ id: "m-1", status: "COMPLETED", completedAt: "2026-01-01T00:00:00.000Z" }, { status: "FAILED" }],
    });
    expect(notifications.find(({ id }) => id === "event:e-1")?.href).toBe("/app/approvals/a-1");
    expect(notifications.find(({ id }) => id === "event:e-2")?.href).toBe("/app/tasks");
    expect(notifications.find(({ id }) => id === "mission:m-1:COMPLETED")?.href).toBe("/app/missions/m-1");
    expect(notifications).toHaveLength(3);
  });

  it("does not expose event descriptions or metadata", () => {
    const notifications = deriveAgentNotifications({
      events: [{ id: "e-sensitive", title: "Research saved", description: "prompt: secret reasoning", metadata: { apiKey: "secret" } } as never],
      missions: [{ id: "m-1", status: "FAILED", error: "provider key secret" } as never],
    });
    const serialized = JSON.stringify(notifications);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("reasoning");
  });
});
