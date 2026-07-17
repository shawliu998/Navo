import { AlertTriangle, CheckCircle2, Database, Package, ShieldCheck, Target, UserRound } from "lucide-react";
import { DEMO_WORKSPACE_ID, getAgentMemory, getKnowledge, getKnowledgeBase } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader, StatusBadge } from "@navo/ui";
import { KnowledgeEditor } from "@/components/knowledge-editor";

export const metadata = { title: "Knowledge" };
const renderedAt = Date.now();

export default async function KnowledgePage() {
  const [data, memoryContext, knowledgeBase] = await Promise.all([getKnowledge(DEMO_WORKSPACE_ID), getAgentMemory(DEMO_WORKSPACE_ID), getKnowledgeBase(DEMO_WORKSPACE_ID)]);
  const activeProducts = data.products.filter((product) => product.status === "ACTIVE");
  const approvedClaims = data.claims.filter((claim) => claim.status === "APPROVED");
  const expiredClaims = approvedClaims.filter((claim) => claim.expiresAt && claim.expiresAt.getTime() < renderedAt);
  const evidencedClaims = approvedClaims.filter((claim) => Boolean(claim.evidence));
  const completeProducts = activeProducts.filter((product) => Boolean(product.descriptionZh || product.descriptionEn) && (product.capabilities as unknown[]).length > 0);
  const completePersonas = data.personas.filter((persona) => (persona.titles as unknown[]).length > 0 && (persona.painPoints as unknown[]).length > 0 && Boolean(persona.recommendedCta));
  const completeIcp = memoryContext.knowledge.icpProfiles.filter((profile) => (profile.countries as unknown[]).length > 0 && (profile.industries as unknown[]).length > 0 && Object.keys(profile.scoringWeights as object).length > 0);
  const checks = [
    { label: "Active products", detail: `${completeProducts.length}/${activeProducts.length} have description and capabilities`, healthy: activeProducts.length > 0 && completeProducts.length === activeProducts.length, Icon: Package },
    { label: "ICP profiles", detail: `${completeIcp.length}/${memoryContext.knowledge.icpProfiles.length} have markets, industries and scoring weights`, healthy: memoryContext.knowledge.icpProfiles.length > 0 && completeIcp.length === memoryContext.knowledge.icpProfiles.length, Icon: Target },
    { label: "Approved claims", detail: `${evidencedClaims.length}/${approvedClaims.length} include supporting evidence`, healthy: approvedClaims.length > 0 && evidencedClaims.length === approvedClaims.length && expiredClaims.length === 0, Icon: ShieldCheck },
    { label: "Personas", detail: `${completePersonas.length}/${data.personas.length} include titles, pain points and CTA`, healthy: data.personas.length > 0 && completePersonas.length === data.personas.length, Icon: UserRound },
  ];
  const health = Math.round(checks.filter((check) => check.healthy).length / checks.length * 100);

  return <div className="page">
    <PageHeader eyebrow="AGENT CONTEXT" title="Knowledge Health" description="检查 Navo 在规划和执行 Mission 前可用的产品、ICP、Persona 和受批准表述。"/>
    <section className="metrics-grid">
      <MetricCard label="Context health" value={`${health}%`} helper={`${checks.filter((check) => check.healthy).length}/${checks.length} checks healthy`} icon={<Database size={14}/>}/>
      <MetricCard label="Active products" value={activeProducts.length} helper={`${completeProducts.length} complete`} icon={<Package size={14}/>}/>
      <MetricCard label="ICP profiles" value={memoryContext.knowledge.icpProfiles.length} helper={`${completeIcp.length} ready`} icon={<Target size={14}/>}/>
      <MetricCard label="Approved claims" value={approvedClaims.length} helper={expiredClaims.length ? `${expiredClaims.length} expired` : "No expired claims"} icon={<ShieldCheck size={14}/>}/>
    </section>
    <section className="dashboard-grid">
      <div className="stack">
        <article className="card">
          <div className="card-header"><div><h2>Readiness checks</h2><span className="card-subtitle">Calculated from the current workspace records</span></div><Badge tone={health === 100 ? "success" : "warning"}>{health}% ready</Badge></div>
          {checks.map(({label, detail, healthy, Icon}) => <div className="list-row" key={label}><span className="company-cell"><span className="integration-icon" style={{margin: 0}}><Icon size={16}/></span><span><strong>{label}</strong><small className="muted" style={{display: "block"}}>{detail}</small></span></span>{healthy ? <Badge tone="success"><CheckCircle2 size={12}/>Healthy</Badge> : <Badge tone="warning"><AlertTriangle size={12}/>Needs attention</Badge>}</div>)}
        </article>
        {activeProducts.map((product) => <article className="card" key={product.id}>
          <div className="card-header"><div className="company-cell"><span className="integration-icon" style={{margin: 0}}><Package size={18}/></span><span><h2>{product.nameZh}</h2><small className="muted">{product.nameEn} · {product.category}</small></span></div><StatusBadge status={product.status}/></div>
          <p className="summary-text">{product.descriptionZh ?? product.descriptionEn ?? "No product description"}</p>
          <div className="toolbar-group" style={{flexWrap: "wrap"}}>{(product.capabilities as string[]).map((item) => <Badge tone="neutral" key={item}>{item}</Badge>)}</div>
        </article>)}
      </div>
      <aside className="stack">
        <section className="card"><div className="card-header"><h2>Approved Claims</h2><Badge tone="success"><ShieldCheck size={12}/>外发可用</Badge></div>{approvedClaims.map((claim) => <div className="guardrail-item" key={claim.id}><strong>{claim.claim}</strong><small>{claim.evidence ?? "Missing supporting evidence"}</small><div className="toolbar-group" style={{marginTop: 7}}><StatusBadge status={claim.status}/>{claim.expiresAt && <Badge tone={claim.expiresAt.getTime() < renderedAt ? "danger" : "neutral"}>Expires {claim.expiresAt.toLocaleDateString("zh-CN")}</Badge>}</div></div>)}</section>
        <section className="card"><div className="card-header"><h2>Personas</h2><UserRound size={16} className="muted"/></div>{data.personas.map((persona) => <div className="guardrail-item" key={persona.id}><strong>{persona.name}</strong><small>{persona.department} · {persona.decisionRole}</small><p className="muted">CTA: {persona.recommendedCta ?? "Not defined"}</p></div>)}</section>
      </aside>
    </section>
    <KnowledgeEditor initial={knowledgeBase}/>
  </div>;
}
