import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, GripVertical, Mail, Plus, ShieldCheck, SquareCheckBig } from "lucide-react";
import { DEMO_WORKSPACE_ID, getSequence } from "@navo/db/queries";
import { Badge, Button, PageHeader, StatusBadge } from "@navo/ui";

export default async function SequencePage({ params }: { params: Promise<{ sequenceId: string }> }) {
  const { sequenceId } = await params;
  const data = await getSequence(DEMO_WORKSPACE_ID, sequenceId);
  if (!data) notFound();
  return <div className="page">
    <Link href="/app/sequences" className="muted" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 12 }}><ArrowLeft size={14} />Back to sequences</Link>
    <PageHeader eyebrow="SEQUENCE EDITOR" title={data.sequence.name} description="Europe/Berlin · Monday–Friday, 09:00–16:30 · Daily limit 25" actions={<><StatusBadge status={data.sequence.status} /><Badge tone="warning">TEST MODE</Badge><Button disabled title="Sequence publishing is not available in this Alpha.">Publish</Button></>} />
    <div className="alert alert-info" style={{ marginBottom: 16 }}><ShieldCheck size={16} /><span>Live sending is disabled. Test sends are limited to demo@navo.local, and every message retains a TEST marker.</span></div>
    <section className="timeline">{data.steps.map((step, index) => {
      const Icon = step.type === "AUTOMATED_EMAIL" ? Mail : step.type === "WAIT" ? CalendarClock : step.type === "MANUAL_TASK" ? SquareCheckBig : CheckCircle2;
      return <div className="timeline-step" key={step.id}><div className="timeline-rail"><span className="timeline-index">{index + 1}</span>{index < data.steps.length - 1 && <span className="timeline-line" />}</div><div><article className="sequence-card"><div className="card-header"><div className="company-cell"><GripVertical size={15} className="muted" /><span className="attention-icon"><Icon size={15} /></span><span><h3>{step.type.replaceAll("_", " ")}</h3><small className="muted">Step {step.position}</small></span></div><Badge tone="neutral">{step.type}</Badge></div><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", color: "var(--text-secondary)", fontSize: 12 }}>{JSON.stringify(step.config, null, 2)}</pre></article>{index < data.steps.length - 1 && <button className="button button-secondary" disabled title="Step editing is not available in this Alpha." style={{ margin: "0 0 10px 12px", height: 28 }}><Plus size={12} />Insert step</button>}</div></div>;
    })}</section>
  </div>;
}
