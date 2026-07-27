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
      if (response.ok) { setSavedAt(new Date().toLocaleTimeString("en-US")); router.refresh(); return; }
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Could not save. Try again.");
    } catch {
      setError("Network request failed. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="card" aria-label="Knowledge editor">
    <div className="card-header">
      <div><h2>Company and product knowledge</h2><span className="card-subtitle">Saved to PostgreSQL and used by subsequent Missions and message generation</span></div>
      {savedAt ? <Badge tone="success"><Save size={12}/>Saved {savedAt}</Badge> : <Badge tone="neutral">Unsaved changes will be lost</Badge>}
    </div>
    {error && <div className="alert alert-danger" role="alert" style={{marginBottom: 12}}>{error}</div>}
    {!initial.product && <div className="alert alert-info" style={{marginBottom: 12}}>This workspace has no product record yet. The first save will create one.</div>}

    <div className="panel-title"><Building2 size={14} style={{verticalAlign: -2}}/> Company</div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-company-name">Company name</label><input id="kb-company-name" value={form.companyName} onChange={(event) => set({ companyName: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-website">Website</label><input id="kb-website" placeholder="https://" value={form.website} onChange={(event) => set({ website: event.target.value })}/></div>
    </div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-desc-zh">Chinese description</label><textarea id="kb-desc-zh" style={{minHeight: 90}} value={form.companyDescriptionZh} onChange={(event) => set({ companyDescriptionZh: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-desc-en">English description</label><textarea id="kb-desc-en" style={{minHeight: 90}} value={form.companyDescriptionEn} onChange={(event) => set({ companyDescriptionEn: event.target.value })}/></div>
    </div>

    <div className="panel-title">Product</div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-product-zh">Product name (Chinese)</label><input id="kb-product-zh" value={form.productNameZh} onChange={(event) => set({ productNameZh: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-product-en">Product name (EN)</label><input id="kb-product-en" value={form.productNameEn} onChange={(event) => set({ productNameEn: event.target.value })}/></div>
    </div>
    <div className="field"><label htmlFor="kb-category">Category</label><input id="kb-category" value={form.category} onChange={(event) => set({ category: event.target.value })}/></div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-product-desc-zh">Product description (Chinese)</label><textarea id="kb-product-desc-zh" style={{minHeight: 90}} value={form.productDescriptionZh} onChange={(event) => set({ productDescriptionZh: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-product-desc-en">Product description (EN)</label><textarea id="kb-product-desc-en" style={{minHeight: 90}} value={form.productDescriptionEn} onChange={(event) => set({ productDescriptionEn: event.target.value })}/></div>
    </div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-capabilities">Capabilities (one per line)</label><textarea id="kb-capabilities" style={{minHeight: 110}} value={form.capabilitiesText} onChange={(event) => set({ capabilitiesText: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-prohibited">Prohibited claims (one per line)</label><textarea id="kb-prohibited" style={{minHeight: 110}} value={form.prohibitedText} onChange={(event) => set({ prohibitedText: event.target.value })}/></div>
    </div>

    <div className="panel-title"><Target size={14} style={{verticalAlign: -2}}/> Target market (ICP)</div>
    <div className="field"><label htmlFor="kb-icp-name">ICP name</label><input id="kb-icp-name" value={form.icpName} onChange={(event) => set({ icpName: event.target.value })}/></div>
    <div className="form-grid">
      <div className="field"><label htmlFor="kb-industries">Target industries (one per line)</label><textarea id="kb-industries" style={{minHeight: 110}} value={form.industriesText} onChange={(event) => set({ industriesText: event.target.value })}/></div>
      <div className="field"><label htmlFor="kb-countries">Target countries or regions (one per line)</label><textarea id="kb-countries" style={{minHeight: 110}} value={form.countriesText} onChange={(event) => set({ countriesText: event.target.value })}/></div>
    </div>

    <div className="panel-title">Approved claims</div>
    {form.claims.length === 0 && <p className="muted" style={{marginTop: 0}}>No approved claims yet. Add at least one before saving.</p>}
    {form.claims.map((claim, index) => <div className="guardrail-item" key={claim.id ?? `new-${index}`}>
      <div className="form-grid" style={{marginBottom: 0}}>
        <div className="field" style={{marginBottom: 8}}><label>Claim</label><input value={claim.claim} onChange={(event) => setClaim(index, { claim: event.target.value })}/></div>
        <div className="field" style={{marginBottom: 8}}><label>Evidence</label><input value={claim.evidence} onChange={(event) => setClaim(index, { evidence: event.target.value })}/></div>
      </div>
      <div className="toolbar-group" style={{justifyContent: "space-between"}}>
        <div className="field" style={{marginBottom: 0, flex: 1}}><label>Regions (comma-separated)</label><input value={claim.regionsText} onChange={(event) => setClaim(index, { regionsText: event.target.value })}/></div>
        <Button variant="ghost" disabled={busy} onClick={() => set({ claims: form.claims.filter((_, i) => i !== index) })} aria-label="Delete claim"><Trash2 size={14}/></Button>
      </div>
    </div>)}

    <div className="approval-actions">
      <Button disabled={busy} onClick={save}><Save size={15}/>{busy ? "Saving…" : "Save knowledge"}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => set({ claims: [...form.claims, { claim: "", evidence: "", regionsText: "GLOBAL" }] })}><Plus size={15}/>Add claim</Button>
      <Button variant="ghost" disabled={busy} onClick={reset}><RotateCcw size={15}/>Discard changes</Button>
    </div>
  </section>;
}
