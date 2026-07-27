import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { agentEvents, agentProfiles } from "./schema";

export type AgentDirectorWakeInput = {
  workspaceId: string;
  trigger: string;
  resourceId?: string;
  userId?: string;
};

export async function requestAgentDirectorWake(input: AgentDirectorWakeInput) {
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(agentProfiles)
      .where(eq(agentProfiles.workspaceId, input.workspaceId))
      .for("update")
      .limit(1);
    if (!profile) return { kind: "NO_PROFILE" as const };
    if (!profile.directorEnabled) return { kind: "DISABLED" as const };
    if (profile.status === "PAUSED") return { kind: "PAUSED" as const };

    const now = new Date();
    const [updated] = await tx.update(agentProfiles).set({
      nextDirectorTickAt: now,
      currentActivity: `Director wake requested: ${input.trigger.toLowerCase().replaceAll("_", " ")}`,
      updatedAt: now,
    }).where(and(
      eq(agentProfiles.workspaceId, input.workspaceId),
      eq(agentProfiles.id, profile.id),
    )).returning();
    if (!updated) return { kind: "CONFLICT" as const };

    const userId = input.userId ?? profile.createdBy;
    await tx.insert(agentEvents).values({
      workspaceId: input.workspaceId,
      createdBy: userId,
      type: "AGENT_DIRECTOR_WAKE_REQUESTED",
      title: "An event requested an immediate Director decision.",
      description: input.trigger.replaceAll("_", " ").toLowerCase(),
      severity: "INFO",
      occurredAt: now,
      metadata: { trigger: input.trigger, resourceId: input.resourceId ?? null },
    });
    return { kind: "WOKEN" as const, profile: updated, trigger: input.trigger };
  });
}
