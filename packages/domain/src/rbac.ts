import type { WorkspaceRole } from "./types";

export type Permission = "workspace.manage" | "integration.manage" | "play.publish" | "play.edit" | "run.start" | "approval.review" | "data.view";
const grants: Record<WorkspaceRole, Permission[]> = {
  OWNER: ["workspace.manage", "integration.manage", "play.publish", "play.edit", "run.start", "approval.review", "data.view"],
  ADMIN: ["integration.manage", "play.publish", "play.edit", "run.start", "approval.review", "data.view"],
  OPERATOR: ["play.edit", "run.start", "data.view"],
  REVIEWER: ["approval.review", "data.view"],
  VIEWER: ["data.view"],
};
export const can = (role: WorkspaceRole, permission: Permission) => grants[role].includes(permission);
