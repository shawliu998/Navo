import Link from "next/link";
import { Mail, Plus, Rows3 } from "lucide-react";
import { DEMO_WORKSPACE_ID, getSequences } from "@navo/db/queries";
import { PageHeader, StatusBadge } from "@navo/ui";

export default async function SequencesPage() {
  const items = await getSequences(DEMO_WORKSPACE_ID);
  return <div className="page page-wide">
    <PageHeader eyebrow="ENGAGEMENT" title="Sequences" description="Controlled outreach timelines after approval. Development delivery remains limited to EmailSink and allowlisted test addresses." actions={<button className="button button-primary" disabled title="Sequence creation is not available in this Alpha."><Plus size={15} />Create sequence</button>} />
    <div className="table-shell"><table className="data-table">
      <thead><tr><th>Name</th><th>Status</th><th>Steps</th><th>Enrolled</th><th>Sent</th><th>Reply Rate</th><th>Positive Rate</th><th>Meetings</th><th>Owner</th></tr></thead>
      <tbody>{items.map((sequence) => <tr key={sequence.id}><td><Link href={`/app/sequences/${sequence.id}`} className="company-cell"><span className="company-logo"><Rows3 size={15} /></span><span className="company-meta"><strong>{sequence.name}</strong><small><Mail size={11} /> EmailSink · Test Mode</small></span></Link></td><td><StatusBadge status={sequence.status} /></td><td>{sequence.stepsCount}</td><td>{sequence.enrolled}</td><td>{sequence.sent}</td><td>{sequence.replyRate}%</td><td>{sequence.positiveReplyRate}%</td><td>{sequence.meetings}</td><td>{sequence.ownerName}</td></tr>)}</tbody>
    </table></div>
  </div>;
}
