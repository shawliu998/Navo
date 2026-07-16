import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { DEMO_WORKSPACE_ID, getConversations } from "@exportplay/db/queries";
import { Badge, PageHeader, StatusBadge } from "@exportplay/ui";

export default async function ConversationsPage() {
  const items = await getConversations(DEMO_WORKSPACE_ID);
  return <div className="page page-wide"><PageHeader eyebrow="REPLY INTELLIGENCE" title="Conversations" description="Inbound email threads with deterministic classification, source-linked summaries and account memory." />
    <div className="table-shell"><table className="data-table"><thead><tr><th>Conversation</th><th>Account</th><th>Contact</th><th>Intent</th><th>Summary</th><th>Last message</th></tr></thead><tbody>{items.map(({ conversation, accountName, contactName, summary, intent }) => <tr key={conversation.id}><td><Link href={`/app/conversations/${conversation.id}`}><strong>{conversation.subject}</strong></Link>{conversation.unreadCount > 0 && <Badge tone="accent">{conversation.unreadCount} new</Badge>}</td><td>{accountName}</td><td>{contactName ?? "—"}</td><td><StatusBadge status={intent ?? conversation.status} /></td><td style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis" }}>{summary ?? "Awaiting summary"}</td><td>{conversation.lastMessageAt.toLocaleDateString("zh-CN")}</td></tr>)}</tbody></table>{items.length === 0 && <div className="empty-state"><MessageSquareText /><strong>No conversations yet</strong><p>Use EmailSink to simulate the first reply.</p></div>}</div>
  </div>;
}
