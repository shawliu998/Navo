import Link from "next/link";
import { Activity, AlertTriangle, Bot, Braces, CheckCircle2, Clock3, Cpu, DollarSign } from "lucide-react";
import { DEMO_WORKSPACE_ID, getRun, getRuns } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader, StatusBadge } from "@navo/ui";

export const metadata = { title: "Capabilities" };

type Capability = {
  id: string;
  label: string;
  attempts: number;
  completed: number;
  failed: number;
  durationMs: number;
  durationSamples: number;
  cost: number;
  providers: Set<string>;
  models: Set<string>;
  promptVersions: Set<string>;
  latestAt: Date | null;
};

export default async function CapabilitiesPage() {
  const runs = await getRuns(DEMO_WORKSPACE_ID);
  const details = await Promise.all(runs.map(({ run }) => getRun(DEMO_WORKSPACE_ID, run.id)));
  const capabilities = new Map<string, Capability>();

  for (const detail of details) {
    if (!detail) continue;
    for (const node of detail.nodes) {
      const current = capabilities.get(node.logicalNodeId) ?? {
        id: node.logicalNodeId,
        label: node.nodeLabel,
        attempts: 0,
        completed: 0,
        failed: 0,
        durationMs: 0,
        durationSamples: 0,
        cost: 0,
        providers: new Set<string>(),
        models: new Set<string>(),
        promptVersions: new Set<string>(),
        latestAt: null,
      };
      current.attempts += 1;
      current.completed += node.status === "COMPLETED" ? 1 : 0;
      current.failed += node.status === "FAILED" ? 1 : 0;
      if (node.durationMs != null) {
        current.durationMs += node.durationMs;
        current.durationSamples += 1;
      }
      current.cost += Number(node.estimatedCost ?? 0);
      if (node.provider) current.providers.add(node.provider);
      if (node.model) current.models.add(node.model);
      if (node.promptVersion) current.promptVersions.add(node.promptVersion);
      if (node.startedAt && (!current.latestAt || node.startedAt > current.latestAt)) current.latestAt = node.startedAt;
      capabilities.set(node.logicalNodeId, current);
    }
  }

  const items = [...capabilities.values()].sort((a, b) => b.attempts - a.attempts || a.label.localeCompare(b.label));
  const totalAttempts = items.reduce((sum, item) => sum + item.attempts, 0);
  const completedAttempts = items.reduce((sum, item) => sum + item.completed, 0);
  const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
  const providerCount = new Set(items.flatMap((item) => [...item.providers])).size;

  return <div className="page">
    <PageHeader eyebrow="RUNTIME INTELLIGENCE" title="Capabilities" description="Navo 实际执行过的结构化能力。成功率、耗时、成本和 Provider 均由可审计的 Node Run 计算。" actions={<Link className="button button-secondary" href="/app/runs"><Activity size={15}/>查看全部运行</Link>}/>
    <section className="metrics-grid">
      <MetricCard label="Observed capabilities" value={items.length} helper={`${runs.length} runs sampled`} icon={<Bot size={14}/>}/>
      <MetricCard label="Node attempts" value={totalAttempts} helper="Includes retry attempts" icon={<Activity size={14}/>}/>
      <MetricCard label="Completion rate" value={`${Math.round(completedAttempts / Math.max(totalAttempts, 1) * 100)}%`} helper={`${completedAttempts} completed`} icon={<CheckCircle2 size={14}/>}/>
      <MetricCard label="Observed cost" value={`$${totalCost.toFixed(3)}`} helper={`${providerCount} providers`} icon={<DollarSign size={14}/>}/>
    </section>
    {items.length === 0 ? <div className="empty-state"><Bot/><strong>尚无能力运行数据</strong><p>执行 Playbook 后，Node Run 将在此形成可审计的能力记录。</p></div> : <div className="integration-grid">{items.map((item) => {
      const successRate = Math.round(item.completed / Math.max(item.attempts, 1) * 100);
      const averageDuration = item.durationSamples ? item.durationMs / item.durationSamples : null;
      const status = item.failed > 0 ? "REVIEW" : item.completed > 0 ? "ACTIVE" : "WAITING";
      return <article className="integration-card" key={item.id}>
        <div className="integration-icon"><Cpu size={18}/></div>
        <div className="card-header"><div><h3>{item.label}</h3><small className="muted mono">{item.id}</small></div><StatusBadge status={status}/></div>
        <div className="guardrail-item"><small>Completion / attempts</small><strong>{successRate}% · {item.completed}/{item.attempts}</strong></div>
        <div className="guardrail-item"><small>Average duration / observed cost</small><strong>{averageDuration == null ? "No duration" : averageDuration >= 1000 ? `${(averageDuration / 1000).toFixed(1)}s` : `${Math.round(averageDuration)}ms`} · ${item.cost.toFixed(3)}</strong></div>
        <div className="guardrail-item"><small>Provider / model</small><strong>{[...item.providers].join(", ") || "Deterministic"}</strong><span className="muted">{[...item.models].join(", ") || "No model recorded"}</span></div>
        <div className="toolbar-group" style={{marginTop: 12, flexWrap: "wrap"}}>
          {item.promptVersions.size > 0 && <Badge tone="neutral"><Braces size={11}/>{[...item.promptVersions].join(", ")}</Badge>}
          {item.failed > 0 ? <Badge tone="warning"><AlertTriangle size={11}/>{item.failed} failed</Badge> : <Badge tone="success"><CheckCircle2 size={11}/>No failures</Badge>}
          {item.latestAt && <Badge tone="neutral"><Clock3 size={11}/>{item.latestAt.toLocaleDateString("zh-CN")}</Badge>}
        </div>
      </article>;
    })}</div>}
    <div className="alert alert-info" style={{marginTop: 14}}><Braces size={16}/><span>同一节点的 Retry 作为新 attempt 计入指标，不会覆盖原始输入、输出或错误。</span></div>
  </div>;
}
