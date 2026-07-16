import Link from "next/link";
import { FlaskConical, MailCheck, ShieldCheck } from "lucide-react";
import { DEMO_WORKSPACE_ID, getEmailSinkMessages } from "@exportplay/db/queries";
import { Badge, PageHeader, StatusBadge } from "@exportplay/ui";
import { EmailSinkActions } from "@/components/email-sink-actions";

export default async function EmailSinkPage({ searchParams }: { searchParams: Promise<{ messageId?: string }> }) {
  const { messageId } = await searchParams;
  const items = await getEmailSinkMessages(DEMO_WORKSPACE_ID);
  const selected = items.find((item) => item.message.id === messageId) ?? items[0];
  return <div className="page page-wide">
    <PageHeader eyebrow="DEVELOPER SIMULATOR" title="EmailSink" description="Safe test-mode mailbox for simulating replies, bounces, unsubscribes and spam complaints. No external email is sent." actions={<Badge tone="success"><ShieldCheck size={12} />TEST MODE ONLY</Badge>} />
    <div className="detail-grid">
      <section className="card">
        <div className="card-header"><h2>Sent messages</h2><Badge tone="neutral"><MailCheck size={12} />{items.length}</Badge></div>
        {items.map(({ message, accountName, contactName }) => <Link key={message.id} href={`/app/email-sink?messageId=${message.id}`} className="list-row" style={selected?.message.id === message.id ? { background: "#f7f5ff", borderRadius: 8, paddingInline: 10 } : undefined}>
          <span><strong>{message.subject}</strong><small className="muted" style={{ display: "block", marginTop: 4 }}>{accountName} · {contactName ?? "No contact"}</small></span>
          <StatusBadge status={message.replyClassification ?? message.status} />
        </Link>)}
      </section>
      <aside className="stack">
        <section className="card">
          <div className="card-header"><h2>Simulate inbound event</h2><FlaskConical size={17} className="muted" /></div>
          {selected ? <><p className="summary-text"><strong>{selected.message.subject}</strong><br /><span className="muted">To {selected.contactName ?? "demo contact"}</span></p><EmailSinkActions messageId={selected.message.id} /></> : <div className="empty-state">No sent EmailSink messages.</div>}
        </section>
        <section className="alert alert-warning"><ShieldCheck size={16} /><span>Unsubscribe, bounce and complaint events update suppression before any next action is proposed.</span></section>
      </aside>
    </div>
  </div>;
}
