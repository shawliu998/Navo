import Link from "next/link";
import { CheckCircle2, Filter } from "lucide-react";
import { DEMO_WORKSPACE_ID, getApprovals } from "@navo/db/queries";
import { Badge, PageHeader, StatusBadge } from "@navo/ui";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const items = await getApprovals(DEMO_WORKSPACE_ID);
  const pending = items.filter((item) => item.approval.status === "PENDING").length;
  const visibleItems = items.filter((item) => item.approval.status === "PENDING");

  return <div className="page page-wide approval-queue-page">
    <PageHeader
      title="Actions needing your decision"
      description="Outbound actions remain blocked until a human reviews the goal, evidence, recommendation, and guardrails."
    />

    <div className="approval-queue-controls">
      <nav className="approval-tabs" aria-label="Approval status">
        <button className="approval-tab approval-tab-active" type="button">Pending {pending}</button>
        {['Approved', 'Changes requested', 'Rejected', 'Expired'].map((label) => (
          <button className="approval-tab" type="button" key={label} disabled title="Status filtering is coming after the Alpha.">{label}</button>
        ))}
      </nav>
      <div className="approval-queue-actions">
        <Badge tone="success" className="approval-policy"><CheckCircle2 size={12} />Every outbound action requires approval</Badge>
        <button className="button button-secondary" disabled title="Advanced approval filters are not available in this Alpha."><Filter size={14} />Filters</button>
      </div>
    </div>

    <div className="table-shell approval-table-shell">
      <table className="data-table approval-table">
        <thead><tr><th>Proposed action</th><th>Account</th><th>Mission</th><th>Risk</th><th>Status</th></tr></thead>
        <tbody>{visibleItems.map(({ approval, accountName, contactName, contactTitle, missionId, missionName }, index) => (
          <tr key={`${approval.id}-${index}`} className={index === 0 ? "approval-row-active" : undefined}>
            <td><Link href={`/app/approvals/${approval.id}`} className="approval-action-cell"><strong>Review outreach message</strong><small>{contactName} · {contactTitle}</small></Link></td>
            <td>{accountName}</td>
            <td>{missionId ? <Link href={`/app/missions/${missionId}`}>{missionName}</Link> : <span className="muted">Standalone playbook</span>}</td>
            <td><Badge tone={approval.risk === "LOW" ? "success" : "warning"}>{approval.risk === "LOW" ? "Low" : "Medium"}</Badge></td>
            <td><StatusBadge status={approval.status} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}
