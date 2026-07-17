import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { DEMO_WORKSPACE_ID, getConversations } from "@navo/db/queries";
import { Badge, PageHeader, StatusBadge } from "@navo/ui";

export default async function ConversationsPage() {
  const items = await getConversations(DEMO_WORKSPACE_ID);
  return <div className="page page-wide"><PageHeader eyebrow="REPLY INTELLIGENCE" title="Conversations" description="Inbound email threads with deterministic classification, source-linked summaries and account memory." />
    <div className="conversation-pipeline"><span className="active">Reply received</span><i/><span>Classified</span><i/><span>Memory updated</span><i/><span>Next action proposed</span><i/><span>Task created</span></div><div className="table-shell"><table className="data-table"><thead><tr><th>Conversation</th><th>Account</th><th>Contact</th><th>Intent</th><th>Navo summary</th><th>Pipeline</th><th>Last message</th></tr></thead><tbody>{items.map(({ conversation, accountName, contactName, summary, intent }) => <tr key={conversation.id}><td><Link href={`/app/conversations/${conversation.id}`}><strong>{conversation.subject}</strong></Link>{conversation.unreadCount > 0 && <Badge tone="accent">{conversation.unreadCount} new</Badge>}</td><td>{accountName}</td><td>{contactName ?? "—"}</td><td><StatusBadge status={intent ?? conversation.status} /></td><td style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>{summary ?? "Awaiting summary"}</td><td><Badge tone="success">Next action ready</Badge></td><td>{conversation.lastMessageAt.toLocaleDateString("en")}</td></tr>)}</tbody></table>{items.length === 0 && <div className="empty-state"><MessageSquareText /><strong>No conversations yet</strong><p>Use EmailSink to simulate the first reply.</p></div>}</div>
  </div>;
}
