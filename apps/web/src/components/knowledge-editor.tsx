"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, RotateCcw, Save, Target, Trash2 } from "lucide-react";
import { Badge, Button } from "@navo/ui";

export type KnowledgeEditorData = {
  company: { name: string; website: string; descriptionZh: string; descriptionEn: string } | null;
  product: { id: string; nameZh: string; nameEn: string; category: string; descriptionZh: string; descriptionEn: string; capabilities: string[]; prohibitedClaims: string[] } | null;
  icp: { id: string; name: string; industries: string[]; countries: string[] } | null;
  claims: { id: string; claim: string; evidence: string; allowedRegions: string[] }[];
};

type ClaimDraft = { id?: string; claim: string; evidence: string; regionsText: string };

type FormState = {
  companyName: string; website: string; companyDescriptionZh: string; companyDescriptionEn: string;
  productNameZh: string; productNameEn: string; category: string; productDescriptionZh: string; productDescriptionEn: string;
  capabilitiesText: string; prohibitedText: string;
  icpName: string; industriesText: string; countriesText: string;
  claims: ClaimDraft[];
};

const fromLines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
const toLines = (items: string[]) => items.join("\n");

const toFormState = (initial: KnowledgeEditorData): FormState => ({
  companyName: initial.company?.name ?? "",
  website: initial.company?.website ?? "",
  companyDescriptionZh: initial.company?.descriptionZh ?? "",
  companyDescriptionEn: initial.company?.descriptionEn ?? "",
  productNameZh: initial.product?.nameZh ?? "",
  productNameEn: initial.product?.nameEn ?? "",
  category: initial.product?.category ?? "",
  productDescriptionZh: initial.product?.descriptionZh ?? "",
  productDescriptionEn: initial.product?.descriptionEn ?? "",
  capabilitiesText: toLines(initial.product?.capabilities ?? []),
  prohibitedText: toLines(initial.product?.prohibitedClaims ?? []),
  icpName: initial.icp?.name ?? "",
  industriesText: toLines(initial.icp?.industries ?? []),
  countriesText: toLines(initial.icp?.countries ?? []),
  claims: initial.claims.map((claim) => ({ id: claim.id, claim: claim.claim, evidence: claim.evidence, regionsText: claim.allowedRegions.join(", ") })),
});

export function KnowledgeEditor({ initial }: { initial: KnowledgeEditorData }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => { setForm((current) => ({ ...current, ...patch })); setSavedAt(null); };
  const setClaim = (index: number, patch: Partial<ClaimDraft>) => set({ claims: form.claims.map((claim, i) => (i === index ? { ...claim, ...patch } : claim)) });

  const reset = () => { setForm(toFormState(initial)); setError(null); setSavedAt(null); };
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: { name: form.companyName, website: form.website, descriptionZh: form.companyDescriptionZh, descriptionEn: form.companyDescriptionEn },
          product: { nameZh: form.productNameZh, nameEn: form.productNameEn, category: form.category, descriptionZh: form.productDescriptionZh, descriptionEn: form.productDescriptionEn, capabilities: fromLines(form.capabilitiesText), prohibitedClaims: fromLines(form.prohibitedText) },
          icp: { name: form.icpName, industries: fromLines(form.industriesText), countries: fromLines(form.countriesText) },
          claims: form.claims.map((claim) => ({ id: claim.id, claim: claim.claim, evidence: claim.evidence, allowedRegions: claim.regionsText.split(",").map((region) => region.trim()).filter(Boolean) })),
        }),
      });
      if (response.ok) { setSavedAt(new Date().toLocaleTimeString("zh-CN")); router.refresh(); return; }
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "保存失败，请稍后重试。");
    } catch {
      setError("网络连接失败，请检查连接后重试。");
    } finally {
      setBusy(false);
    }
  };

  return <section className="card" aria-label="Knowledge editor">
    <div className="card-header">
      <div><h2>公司与产品知识</h2><span className="card-subtitle">保存后写入 PostgreSQL，Mission 与消息生成将使用最新内容</span></div>
      {savedAt ? <Badge tone="success"><Save size={12}/>已保存 {savedAt}</Badge> : <Badge tone="neutral">未保存的更改将丢失</Badge>}
    </div>
    {error && <div className="alert alert-danger" role="alert" style={{marginBottom: 12}}>{error}</div>}
    {!initial.product && <div className="alert alert-info" style={{marginBottom: 12}}>当前工作区还没有产品记录，首次保存会自动创建。</div>}

    <div className="panel-title"><Building2 size={14} style={{verticalAlign: -2}}/> 公司信息</div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-company-name">公司名称</label><input id="kb-company-name" value={form.companyName} onChange={(event) => set({ companyName: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-website">官网</label><input id="kb-website" placeholder="https://" value={form.website} onChange={(event) => set({ website: event.target.value })}/></div>
    </div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-desc-zh">中文简介</label><textarea id="kb-desc-zh" style={{minHeight: 90}} value={form.companyDescriptionZh} onChange={(event) => set({ companyDescriptionZh: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-desc-en">English description</label><textarea id="kb-desc-en" style={{minHeight: 90}} value={form.companyDescriptionEn} onChange={(event) => set({ companyDescriptionEn: event.target.value })}/></div>
    </div>

    <div className="panel-title">产品</div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-product-zh">产品名称（中文）</label><input id="kb-product-zh" value={form.productNameZh} onChange={(event) => set({ productNameZh: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-product-en">Product name (EN)</label><input id="kb-product-en" value={form.productNameEn} onChange={(event) => set({ productNameEn: event.target.value })}/></div>
    </div>
    <div className="field"><label htmlFor="kb-category">品类</label><input id="kb-category" value={form.category} onChange={(event) => set({ category: event.target.value })}/></div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-product-desc-zh">产品描述（中文）</label><textarea id="kb-product-desc-zh" style={{minHeight: 90}} value={form.productDescriptionZh} onChange={(event) => set({ productDescriptionZh: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-product-desc-en">Product description (EN)</label><textarea id="kb-product-desc-en" style={{minHeight: 90}} value={form.productDescriptionEn} onChange={(event) => set({ productDescriptionEn: event.target.value })}/></div>
    </div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-capabilities">能力（每行一条）</label><textarea id="kb-capabilities" style={{minHeight: 110}} value={form.capabilitiesText} onChange={(event) => set({ capabilitiesText: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-prohibited">禁止表述（每行一条）</label><textarea id="kb-prohibited" style={{minHeight: 110}} value={form.prohibitedText} onChange={(event) => set({ prohibitedText: event.target.value })}/></div>
    </div>

    <div className="panel-title"><Target size={14} style={{verticalAlign: -2}}/> 目标市场（ICP）</div>
    <div className="field"><label htmlFor="kb-icp-name">ICP 名称</label><input id="kb-icp-name" value={form.icpName} onChange={(event) => set({ icpName: event.target.value })}/></div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-industries">目标行业（每行一条）</label><textarea id="kb-industries" style={{minHeight: 110}} value={form.industriesText} onChange={(event) => set({ industriesText: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-countries">目标国家/地区（每行一条）</label><textarea id="kb-countries" style={{minHeight: 110}} value={form.countriesText} onChange={(event) => set({ countriesText: event.target.value })}/></div>
    </div>

    <div className="panel-title">允许的表述（Approved Claims）</div>
    {form.claims.length === 0 && <p className="muted" style={{marginTop: 0}}>暂无获批表述，保存前请至少添加一条。</p>}
    {form.claims.map((claim, index) => <div className="guardrail-item" key={claim.id ?? `new-${index}`}>
      <div className="form-grid" style={{marginBottom: 0}}>
        <div className="field" style={{marginBottom: 8}}><label>表述</label><input value={claim.claim} onChange={(event) => setClaim(index, { claim: event.target.value })}/></div>
        <div className="field" style={{marginBottom: 8}}><label>证据</label><input value={claim.evidence} onChange={(event) => setClaim(index, { evidence: event.target.value })}/></div>
      </div>
      <div className="toolbar-group" style={{justifyContent: "space-between"}}>
        <div className="field" style={{marginBottom: 0, flex: 1}}><label>适用区域（逗号分隔）</label><input value={claim.regionsText} onChange={(event) => setClaim(index, { regionsText: event.target.value })}/></div>
        <Button variant="ghost" disabled={busy} onClick={() => set({ claims: form.claims.filter((_, i) => i !== index) })} aria-label="删除该表述"><Trash2 size={14}/></Button>
      </div>
    </div>)}

    <div className="approval-actions">
      <Button disabled={busy} onClick={save}><Save size={15}/>{busy ? "保存中…" : "保存知识"}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => set({ claims: [...form.claims, { claim: "", evidence: "", regionsText: "GLOBAL" }] })}><Plus size={15}/>添加表述</Button>
      <Button variant="ghost" disabled={busy} onClick={reset}><RotateCcw size={15}/>放弃更改</Button>
    </div>
  </section>;
}
