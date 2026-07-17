import Link from "next/link";
import { CheckSquare2 } from "lucide-react";
import { DEMO_WORKSPACE_ID, getTasks } from "@navo/db/queries";
import { Badge, PageHeader, StatusBadge } from "@navo/ui";

export default async function TasksPage() {
  const items = await getTasks(DEMO_WORKSPACE_ID);
  const open = items.filter(({ task }) => task.status === "OPEN").length;
  return <div className="page page-wide"><PageHeader eyebrow="NEXT BEST ACTION" title="Tasks" description="Manual follow-ups created from account intelligence, reply classification and policy outcomes." actions={<Badge tone="accent"><CheckSquare2 size={12} />{open} open</Badge>} />
    <div className="table-shell"><table className="data-table"><thead><tr><th>Task</th><th>Created by</th><th>Account</th><th>Contact</th><th>Type</th><th>Priority</th><th>Due</th><th>Assignee</th><th>Status</th></tr></thead><tbody>{items.map(({ task, accountName, contactName }) => <tr key={task.id}><td><strong>{task.title}</strong>{task.conversationId && <small style={{ display: "block" }}><Link className="muted" href={`/app/conversations/${task.conversationId}`}>Open source conversation</Link></small>}</td><td><Badge tone={task.nextActionProposalId?"accent":"neutral"}>{task.nextActionProposalId?"Navo proposal":task.conversationId?"Reply intelligence":"Operator"}</Badge></td><td>{accountName ?? "—"}</td><td>{contactName ?? "—"}</td><td>{task.type.replaceAll("_", " ")}</td><td><StatusBadge status={task.priority} /></td><td>{task.dueAt?.toLocaleDateString("en") ?? "—"}</td><td>{task.assigneeName ?? "Unassigned"}</td><td><StatusBadge status={task.status} /></td></tr>)}</tbody></table></div>
  </div>;
}
