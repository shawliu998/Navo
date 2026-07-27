import { Bot, CheckCircle2, Clock3, Mail, Search, ShieldCheck, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DEMO_WORKSPACE_ID, getIntegrations } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader, StatusBadge } from "@navo/ui";

export const metadata = { title: "Tool Status" };

const icons: Record<string, LucideIcon> = { AI: Bot, EMAIL: Mail, RESEARCH: Search };

export default async function IntegrationsPage() {
  const tools = await getIntegrations(DEMO_WORKSPACE_ID);
  const available = tools.filter((tool) => tool.status === "CONNECTED" || tool.status === "CONFIGURED");
  const synced = tools.filter((tool) => tool.lastSyncAt);

  return <div className="page">
    <PageHeader eyebrow="RUNTIME TOOLS" title="Tool Status" description="Configured adapters available to a Mission. Status, access, and recent activity come from workspace connection records."/>
    <section className="metrics-grid">
      <MetricCard label="Registered tools" value={tools.length} helper="Workspace scoped" icon={<Wrench size={14}/>}/>
      <MetricCard label="Available" value={available.length} helper="Connected or configured" icon={<CheckCircle2 size={14}/>}/>
      <MetricCard label="Activity recorded" value={synced.length} helper="Has a last activity time" icon={<Clock3 size={14}/>}/>
    </section>
    <div className="integration-grid">{tools.map((tool) => {
      const Icon = icons[tool.category] ?? Wrench;
      const permissions = tool.permissions as string[];
      const config = tool.config as Record<string, unknown>;
      return <article className="integration-card" key={tool.id}>
        <div className="integration-icon"><Icon size={18}/></div>
        <div className="card-header"><div><h3>{tool.provider}</h3><Badge tone="neutral">{tool.category}</Badge></div><StatusBadge status={tool.status}/></div>
        <p>{tool.category === "EMAIL" ? "Controlled development delivery channel" : tool.category === "AI" ? "Server-side structured generation provider" : "Deterministic research and extraction adapter"}</p>
        <div className="guardrail-item"><small>Granted capabilities</small><strong>{permissions.length ? permissions.join(", ") : "None"}</strong></div>
        <div className="guardrail-item"><small>Last activity</small><strong>{tool.lastSyncAt ? tool.lastSyncAt.toLocaleString("en-US") : "No activity recorded"}</strong></div>
        <div className="toolbar-group" style={{marginTop: 12, flexWrap: "wrap"}}>
          {config.serverOnly === true && <Badge tone="success"><ShieldCheck size={11}/>Server only</Badge>}
          {config.deterministic === true && <Badge tone="info">Deterministic</Badge>}
          {config.testMode === true && <Badge tone="warning">Test mode</Badge>}
        </div>
      </article>;
    })}</div>
    <div className="alert alert-info" style={{marginTop: 14}}><ShieldCheck size={16}/><span>This page shows registered tools only. It makes no availability claim for services that are not connected.</span></div>
  </div>;
}
