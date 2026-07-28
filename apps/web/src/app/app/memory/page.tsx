import Link from "next/link";
import { BrainCircuit, CheckCircle2, Clock3, Database, Package, ShieldCheck, Target } from "lucide-react";
import { DEMO_WORKSPACE_ID, getAgentMemory } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader } from "@navo/ui";
import { NavoBrand } from "@/components/navo-brand";

export const metadata = { title: "Memory" };

export default async function MemoryPage() {
  const data = await getAgentMemory(DEMO_WORKSPACE_ID);
  const accountCount = new Set(data.facts.map(({ memory }) => memory.accountId)).size;
  const categories = new Map<string, typeof data.facts>();
  for (const fact of data.facts) categories.set(fact.memory.category, [...(categories.get(fact.memory.category) ?? []), fact]);
  const highConfidence = data.facts.filter(({ memory }) => Number(memory.confidence) >= .8).length;

  return <div className="page">
    <PageHeader eyebrow="PERSISTENT CONTEXT" title="Memory" description="由 Mission 或对话产生的来源明确的 Account Facts；执行控制状态与持久事实分开展示。"/>
    <section className="metrics-grid">
      <MetricCard label="Active facts" value={data.facts.length} helper={`Across ${accountCount} accounts`} icon={<BrainCircuit size={14}/>}/>
      <MetricCard label="High confidence" value={highConfidence} helper="Confidence ≥ 80%" icon={<CheckCircle2 size={14}/>}/>
      <MetricCard label="Fact categories" value={categories.size} helper="Structured memory types" icon={<Database size={14}/>}/>
      <MetricCard label="Knowledge sources" value={data.knowledge.products.length + data.knowledge.icpProfiles.length + data.knowledge.approvedClaims.length} helper="Products, ICPs and claims" icon={<Package size={14}/>}/>
    </section>
    <section className="dashboard-grid">
      <div className="stack">
        {[...categories.entries()].map(([category, facts]) => <article className="card" key={category}>
          <div className="card-header"><div><h2>{category.replaceAll("_", " ")}</h2><span className="card-subtitle">{facts.length} active facts</span></div><Badge tone="accent">Memory</Badge></div>
          {facts.map(({memory, accountName}) => <div className="list-row" key={memory.id}>
            <span><Link href={`/app/accounts/${memory.accountId}`}><strong>{accountName}</strong></Link><span style={{display: "block", fontSize: 12, marginTop: 4}}>{memory.fact}</span><small className="muted" style={{display: "flex", alignItems: "center", gap: 4, marginTop: 5}}><Clock3 size={11}/>{memory.validFrom.toLocaleDateString("zh-CN")} · source {memory.sourceType.toLowerCase()} · {(memory.evidenceIds as string[]).length} evidence link(s)</small></span>
            <Badge tone={Number(memory.confidence) >= .8 ? "success" : "warning"}>{Math.round(Number(memory.confidence) * 100)}%</Badge>
          </div>)}
        </article>)}
        {data.facts.length === 0 && <div className="empty-state"><NavoBrand mode="mark" className="empty-state-brand-mark"/><strong>尚无活跃记忆</strong><p>当 Reply Intelligence 验证一个事实后，它会出现在这里。</p></div>}
      </div>
      <aside className="stack">
        <section className="card"><div className="card-header"><div><h2>Loaded knowledge</h2><span className="card-subtitle">Workspace context available to the agent</span></div><Database size={16}/></div>
          <div className="guardrail-item"><small>Active products</small><strong>{data.knowledge.products.length}</strong><div className="toolbar-group" style={{marginTop: 7, flexWrap: "wrap"}}>{data.knowledge.products.map((product) => <Badge tone="neutral" key={product.id}><Package size={11}/>{product.nameEn}</Badge>)}</div></div>
          <div className="guardrail-item"><small>ICP profiles</small><strong>{data.knowledge.icpProfiles.length}</strong><div className="toolbar-group" style={{marginTop: 7, flexWrap: "wrap"}}>{data.knowledge.icpProfiles.map((profile) => <Badge tone="neutral" key={profile.id}><Target size={11}/>{profile.name}</Badge>)}</div></div>
          <div className="guardrail-item"><small>Approved claims</small><strong>{data.knowledge.approvedClaims.length}</strong><p className="muted">Only approved claims are loaded for controlled generation.</p></div>
        </section>
        <div className="alert alert-info"><ShieldCheck size={16}/><span>Memory Fact 必须保留 sourceType、sourceId、evidenceIds 和 Confidence。Mission facts 不再伪装成 Message 来源。</span></div>
      </aside>
    </section>
  </div>;
}
