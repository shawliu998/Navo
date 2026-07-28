import { Bot, CheckCircle2, Clock3, Mail, Search, ShieldCheck, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DEMO_WORKSPACE_ID, getIntegrations } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader, StatusBadge } from "@navo/ui";

export const metadata = { title: "Tool Status" };

const icons: Record<string, LucideIcon> = { AI: Bot, EMAIL: Mail, RESEARCH: Search };

function toolDescription(category: string) {
  if (category === "EMAIL") return "Controlled development delivery channel";
  if (category === "AI") return "Server-side structured generation provider";
  return "Deterministic research and extraction adapter";
}

export default async function IntegrationsPage() {
  const tools = await getIntegrations(DEMO_WORKSPACE_ID);
  const available = tools.filter((tool) => tool.status === "CONNECTED" || tool.status === "CONFIGURED");
  const active = tools.filter((tool) => tool.lastSyncAt);

  return (
    <div className="page tool-status-page">
      <PageHeader
        eyebrow="RUNTIME TOOLS"
        title="Tool Status"
        description="Configured adapters available to Missions. Status, permissions, and recent activity come directly from workspace connection records."
      />

      <section className="metrics-grid tool-status-metrics" aria-label="Tool status summary">
        <MetricCard label="Registered tools" value={tools.length} helper="Workspace scoped" icon={<Wrench size={14} />} />
        <MetricCard label="Available" value={available.length} helper="Connected or configured" icon={<CheckCircle2 size={14} />} />
        <MetricCard label="Activity recorded" value={active.length} helper="Has a last activity time" icon={<Clock3 size={14} />} />
      </section>

      <section className="tool-inventory" aria-labelledby="registered-adapters-heading">
        <header className="tool-inventory-header">
          <div>
            <h2 id="registered-adapters-heading">Registered adapters</h2>
            <p>Runtime availability, granted capabilities, and latest recorded activity.</p>
          </div>
          <Badge tone={available.length === tools.length ? "success" : "warning"}>
            {available.length}/{tools.length} available
          </Badge>
        </header>

        <div className="tool-list">
          {tools.map((tool) => {
            const Icon = icons[tool.category] ?? Wrench;
            const permissions = tool.permissions as string[];
            const config = tool.config as Record<string, unknown>;

            return (
              <article className="tool-row" key={tool.id}>
                <div className="tool-identity">
                  <span className="tool-icon" aria-hidden="true"><Icon size={16} /></span>
                  <div>
                    <div className="tool-title-line">
                      <h3>{tool.provider}</h3>
                      <Badge tone="neutral">{tool.category}</Badge>
                    </div>
                    <p>{toolDescription(tool.category)}</p>
                  </div>
                </div>

                <div className="tool-field">
                  <span>Granted capabilities</span>
                  <strong className="mono">{permissions.length ? permissions.join(", ") : "None"}</strong>
                </div>

                <div className="tool-field">
                  <span>Last activity</span>
                  {tool.lastSyncAt ? (
                    <time dateTime={tool.lastSyncAt.toISOString()}>{tool.lastSyncAt.toLocaleString("en-US")}</time>
                  ) : (
                    <strong>No activity recorded</strong>
                  )}
                </div>

                <div className="tool-state">
                  <StatusBadge status={tool.status} />
                  <div className="tool-flags">
                    {config.serverOnly === true ? <Badge tone="success"><ShieldCheck size={11} />Server only</Badge> : null}
                    {config.deterministic === true ? <Badge tone="info">Deterministic</Badge> : null}
                    {config.testMode === true ? <Badge tone="warning">Test mode</Badge> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="alert alert-info tool-status-note">
        <ShieldCheck size={16} />
        <span>This inventory reports registered workspace tools only; it does not claim availability for services that are not connected.</span>
      </div>
    </div>
  );
}
