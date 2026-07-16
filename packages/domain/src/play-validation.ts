import type { PlayEdge, PlayNode } from "./types";

export type PlayValidationIssue = { code: string; nodeId?: string; message: string };
const triggerTypes = new Set(["manualTrigger", "csvImportTrigger", "accountMatchesFilter"]);
const terminalTypes = new Set(["stop", "syncCrm"]);

export function validatePlay(nodes: PlayNode[], edges: PlayEdge[]): PlayValidationIssue[] {
  const issues: PlayValidationIssue[] = [];
  if (!nodes.some((node) => triggerTypes.has(node.type))) issues.push({ code: "TRIGGER_REQUIRED", message: "Play must contain a trigger." });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: "INVALID_EDGE", message: `Edge ${edge.id} references a missing node.` });
      continue;
    }
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  for (const node of nodes) {
    if (!triggerTypes.has(node.type) && (incoming.get(node.id) ?? 0) === 0) issues.push({ code: "UNREACHABLE_NODE", nodeId: node.id, message: `${node.label} is not reachable.` });
    if (!terminalTypes.has(node.type) && (outgoing.get(node.id)?.length ?? 0) === 0) issues.push({ code: "DEAD_END", nodeId: node.id, message: `${node.label} has no outgoing path.` });
    if (node.type === "conditionBranch" && edges.filter((edge) => edge.source === node.id).length < 2) issues.push({ code: "BRANCH_REQUIRED", nodeId: node.id, message: "Condition needs at least two branches." });
  }
  const trigger = nodes.find((node) => triggerTypes.has(node.type));
  if (trigger) {
    const seen = new Set<string>();
    const active = new Set<string>();
    const visit = (id: string) => {
      if (active.has(id)) { issues.push({ code: "CYCLE", nodeId: id, message: "Cycles are not allowed; use Loop Contacts." }); return; }
      if (seen.has(id)) return;
      seen.add(id); active.add(id);
      for (const next of outgoing.get(id) ?? []) visit(next);
      active.delete(id);
    };
    visit(trigger.id);
  }
  const sendNodes = nodes.filter((node) => ["enrollSequence", "sendTestEmail"].includes(node.type));
  for (const send of sendNodes) {
    const approval = nodes.some((node) => node.type === "humanApproval" && canReach(node.id, send.id, outgoing));
    const testMode = send.config.testMode === true;
    if (!approval && !testMode) issues.push({ code: "APPROVAL_REQUIRED", nodeId: send.id, message: "Sending requires Human Approval unless test mode is explicit." });
  }
  return issues;
}

function canReach(from: string, to: string, graph: Map<string, string[]>, visited = new Set<string>()): boolean {
  if (from === to) return true;
  if (visited.has(from)) return false;
  visited.add(from);
  return (graph.get(from) ?? []).some((next) => canReach(next, to, graph, visited));
}
