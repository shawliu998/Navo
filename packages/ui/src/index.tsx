import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Clock3, MinusCircle, XCircle } from "lucide-react";

export function cn(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(" "); }

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={cn("button", `button-${variant}`, className)} {...props} />;
}
export function Badge({ children, tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info" }) { return <span className={cn("badge", `badge-${tone}`, className)} {...props}>{children}</span>; }

const labels: Record<string, string> = { STRONG_FIT: "Strong Fit", POTENTIAL_FIT: "Potential", REVIEW: "Review", LOW_FIT: "Low Fit", NOT_RESEARCHED: "Not researched", DISQUALIFIED: "Disqualified", COMPLETED: "Completed", ACTIVE: "Active", PUBLISHED: "Published", APPROVED: "Approved", APPROVED_WITH_CHANGES: "Approved + edits", RUNNING: "Running", WAITING: "Waiting", PENDING: "Pending", FAILED: "Failed", REJECTED: "Rejected", CHANGES_REQUESTED: "Changes requested", DRAFT: "Draft", SENT: "Sent", NEW: "New", ACTIONED: "Actioned", NOT_CONNECTED: "Not connected", CONNECTED: "Connected", CONFIGURED: "Configured", HIGH: "High", MEDIUM: "Medium", LOW: "Low", UNASSIGNED: "Unassigned", SUPPRESSED: "Suppressed" };
function statusTone(status: string) {
  return /FAILED|REJECTED|DISQUALIFIED|SUPPRESSED/.test(status) ? "danger" : /WAITING|PENDING|REVIEW|CHANGES|HIGH/.test(status) ? "warning" : /COMPLETED|ACTIVE|APPROVED|CONNECTED|STRONG/.test(status) ? "success" : /RUNNING|CONFIGURED|POTENTIAL/.test(status) ? "info" : "neutral";
}
export function StatusBadge({ status, showIcon = false }: { status: string; showIcon?: boolean }) {
  const tone = statusTone(status);
  const Icon = tone === "danger" ? XCircle : tone === "warning" ? Clock3 : tone === "success" ? CheckCircle2 : tone === "info" ? AlertCircle : MinusCircle;
  return <Badge tone={tone}>{showIcon ? <Icon size={13} aria-hidden /> : null}{labels[status] ?? status.replaceAll("_", " ")}</Badge>;
}
export function FitScoreBadge({ score, status }: { score: number | null; status: string }) { return <Badge tone={statusTone(status)} className="fit-score-badge">{score ?? "—"} · {labels[status] ?? status.replaceAll("_", " ")}</Badge>; }
export function MetricCard({ label, value, helper, icon }: { label: string; value: string | number; helper?: string; icon?: ReactNode }) { return <article className="metric-card"><div className="metric-label">{icon}{label}</div><div className="metric-value">{value}</div>{helper && <div className="metric-helper">{helper}</div>}</article>; }
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><MinusCircle size={24} /><strong>{title}</strong><p>{description}</p>{action}</div>; }
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) { return <header className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>; }
