import Link from "next/link";
import { CheckCircle2, CircleAlert, ExternalLink, FileCheck2, Mail } from "lucide-react";
import { notFound } from "next/navigation";
import { DEMO_WORKSPACE_ID, getApproval, getApprovals } from "@navo/db/queries";
import { Badge, StatusBadge } from "@navo/ui";
import { ApprovalEditor } from "@/components/approval-editor";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  const [data, approvalQueue] = await Promise.all([
    getApproval(DEMO_WORKSPACE_ID, approvalId),
    getApprovals(DEMO_WORKSPACE_ID),
  ]);
  if (!data) notFound();
  const { approval, account, contact } = data;
  const subject = approval.editedSubject ?? approval.originalSubject;
  const body = approval.editedBody ?? approval.originalBody;
  const pending = approval.status === "PENDING";
  const uniqueQueue = Array.from(new Map(approvalQueue.map((item) => [item.approval.id, item])).values());
  const pendingCount = uniqueQueue.filter((item) => item.approval.status === "PENDING").length;
  const visibleQueue = uniqueQueue
    .filter((item) => item.approval.status === "PENDING" || item.approval.id === approval.id)
    .slice(0, 8);

  return <div className="approval-detail-page">
    <header className="approval-detail-titlebar">
      <div>
        <div className="approval-breadcrumbs"><Link href="/app/approvals">Approvals</Link> / {pending ? "Pending" : "History"} / {approval.id.slice(-6)}</div>
        <h1>Review outreach message</h1>
        <p>{account.name} · {contact?.name ?? "Named account contact"} · {data.missionName ?? "Target account outreach"}</p>
      </div>
      <div className="page-actions">
        <Badge tone={approval.risk === "LOW" ? "success" : "warning"}>{approval.risk === "LOW" ? "Low risk" : "Medium risk"}</Badge>
        <StatusBadge status={approval.status} />
        <Link className="button button-secondary" href={`/app/accounts/${account.id}`}>Open account</Link>
      </div>
    </header>

    <div className="approval-detail-layout approval-workbench">
      <aside className="approval-queue-context" aria-label="Approval queue">
        <header>
          <div><span>Approval queue</span><strong>{pendingCount} pending</strong></div>
          <Link href="/app/approvals">View all</Link>
        </header>
        <nav aria-label="Pending approval items">
          {visibleQueue.map(({ approval: item, accountName, contactName, contactTitle }) => <Link
            href={`/app/approvals/${item.id}`}
            className={item.id === approval.id ? "approval-queue-item approval-queue-item-active" : "approval-queue-item"}
            aria-current={item.id === approval.id ? "page" : undefined}
            key={item.id}
          >
            <span><strong>Review outreach message</strong><small>{accountName}</small></span>
            <span><small>{contactName ?? "Named contact"} · {contactTitle ?? "Role pending"}</small><StatusBadge status={item.status} /></span>
          </Link>)}
        </nav>
        <section className="approval-queue-context-card">
          <span>Mission</span>
          {data.missionId ? <Link href={`/app/missions/${data.missionId}`}>{data.missionName}</Link> : <strong>{data.missionName ?? "Target account outreach"}</strong>}
          <small>Evidence, recipient, and message are reviewed together.</small>
        </section>
      </aside>

      <main className="approval-message-column">
        <section className="approval-message-workspace">
          <header>
            <div>
              <span>Proposed message</span>
              <h2>{subject}</h2>
            </div>
            <StatusBadge status={approval.status} />
          </header>
          <dl className="approval-message-address">
            <div><dt>To</dt><dd><strong>{contact?.name ?? "Named account contact"}</strong>{contact?.title ? <span>{contact.title}</span> : null}</dd></div>
            <div><dt>Account</dt><dd><Link href={`/app/accounts/${account.id}`}>{account.name}</Link></dd></div>
            <div><dt>Subject</dt><dd>{subject}</dd></div>
          </dl>
          <article className="approval-message-body"><Mail size={16} /><div><p>{body}</p></div></article>
          <footer>
            <span>{data.evidence.length} linked evidence sources</span>
            <span>{pending ? "Waiting for your decision" : "Decision recorded"}</span>
          </footer>
        </section>

        <section className="approval-context-section" aria-label="Approval context">
          <div className="approval-section-heading"><div><span>Decision context</span><h2>Evidence supporting this message</h2></div><Badge tone="neutral">{data.evidence.length} verified</Badge></div>
          <div className="approval-evidence-list">
            {data.evidence.slice(0, 3).map((item, index) => {
              const Icon = index === 0 ? CheckCircle2 : index === 1 ? CircleAlert : FileCheck2;
              return <article className="approval-evidence-row" key={item.id}>
                <span className="approval-evidence-icon"><Icon size={15} /></span>
                <div><strong>{item.title}</strong><p>{index === 0 ? "Verified fact" : "Observed evidence"} · {item.type.replaceAll("_", " ").toLowerCase()}</p></div>
                {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open source for ${item.title}`}><ExternalLink size={13} /></a> : null}
              </article>;
            })}
          </div>
          <div className="approval-recommendation">
            <span>AI recommendation</span>
            <strong>{data.agentRecommendation ?? "Approve after validating the cited evidence and recipient."}</strong>
            <p>Advisory only · Based on {data.evidence.length} linked evidence items</p>
          </div>
        </section>

        <dl className="approval-policy-fields" aria-label="Approval boundaries">
          <div><dt>Message</dt><dd>{pending ? "Decision pending" : "Human approval recorded"}</dd></div>
          <div><dt>Sequence</dt><dd>{pending ? "Not enrolled" : "Downstream step unchanged"}</dd></div>
          <div><dt>Account data</dt><dd>Read-only</dd></div>
        </dl>
      </main>

      <ApprovalEditor
        approvalId={approval.id}
        subject={subject}
        body={body}
        status={approval.status}
        contactName={contact?.name}
        contactTitle={contact?.title}
        missionName={data.missionName}
        reviewerName={approval.reviewerName}
        reviewedAt={approval.reviewedAt?.toISOString()}
        reason={approval.reason}
      />
    </div>
  </div>;
}
