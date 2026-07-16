import Link from "next/link";
import { ArrowLeft, Brain, CheckSquare, Lightbulb, MessageSquareText } from "lucide-react";
import { notFound } from "next/navigation";
import { DEMO_WORKSPACE_ID, getConversation } from "@exportplay/db/queries";
import { Badge, StatusBadge } from "@exportplay/ui";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const data = await getConversation(DEMO_WORKSPACE_ID, conversationId);
  if (!data) notFound();
  return <div className="page page-wide"><Link href="/app/conversations" className="muted" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 12 }}><ArrowLeft size={14} />Back to Conversations</Link>
    <header className="detail-header"><div className="detail-title"><div><span className="eyebrow">REPLY INTELLIGENCE</span><h1 style={{ margin: "5px 0" }}>{data.conversation.subject}</h1><div className="detail-meta"><span>{data.account.name}</span><span>·</span><span>{data.contact?.name ?? "Unknown contact"}</span></div></div><StatusBadge status={data.summary?.intent ?? data.conversation.status} /></div></header>
    <div className="detail-grid"><div className="stack">
      <section className="card"><div className="card-header"><h2><MessageSquareText size={15} /> Thread</h2><Badge tone="neutral">{data.messages.length} messages</Badge></div>{data.messages.map((message) => <article key={message.id} className="evidence-card" style={{ marginBottom: 10, marginLeft: message.direction === "OUTBOUND" ? 40 : 0, marginRight: message.direction === "INBOUND" ? 40 : 0, background: message.direction === "INBOUND" ? "#faf8ff" : "#fff" }}><div className="evidence-card-header"><strong>{message.direction === "INBOUND" ? data.contact?.name ?? "Contact" : "Nova Automation"}</strong><StatusBadge status={message.replyClassification ?? message.direction} /></div><p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p><small className="muted">{(message.receivedAt ?? message.sentAt ?? message.createdAt).toLocaleString("zh-CN")}</small></article>)}</section>
    </div><aside className="stack">
      <section className="card"><div className="card-header"><h2>Conversation summary</h2><Badge tone="accent">Source linked</Badge></div><p className="summary-text">{data.summary?.summary ?? "No summary yet."}</p></section>
      <section className="card"><div className="card-header"><h2><Brain size={15} /> Account Memory</h2><Badge tone="neutral">{data.memory.length}</Badge></div>{data.memory.map((fact) => <div className="list-row" key={fact.id}><span><strong>{fact.category}</strong><small className="muted" style={{ display: "block" }}>{fact.fact}</small></span><Badge tone="success">{Math.round(Number(fact.confidence) * 100)}%</Badge></div>)}</section>
      <section className="card"><div className="card-header"><h2><Lightbulb size={15} /> Next Best Action</h2></div>{data.actions.map((action) => <div key={action.id}><StatusBadge status={action.priority} /><h3>{action.title}</h3><p className="muted">{action.rationale}</p></div>)}</section>
      <section className="card"><div className="card-header"><h2><CheckSquare size={15} /> Tasks</h2></div>{data.tasks.map((task) => <div className="list-row" key={task.id}><span>{task.title}</span><StatusBadge status={task.status} /></div>)}</section>
    </aside></div>
  </div>;
}
