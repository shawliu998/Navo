"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button, StatusBadge } from "@navo/ui";

const sample = `Company Name,Website,Country,Industry\nDemo Atlas Motion,https://atlas-motion.example,Germany,Industrial Equipment\nDemo Pacific Vision,pacific-vision.example,United States,Electronics Manufacturing`;
const parseCsvLine = (line: string) => { const cells: string[] = []; let cell = ""; let quoted = false; for (let index = 0; index < line.length; index += 1) { const character = line[index]!; if (character === '"' && line[index + 1] === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = !quoted; else if (character === "," && !quoted) { cells.push(cell.trim()); cell = ""; } else cell += character; } cells.push(cell.trim()); return cells; };

export function CsvImporter() {
  const router = useRouter();
  const [csv, setCsv] = useState(sample);
  const [mapping, setMapping] = useState({ companyName: "Company Name", website: "Website", country: "Country", industry: "Industry" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const parsed = useMemo(() => { const lines = csv.split(/\r?\n/).filter(Boolean); const headers = parseCsvLine(lines[0] ?? ""); const rawRows = lines.slice(1).map(parseCsvLine); return { headers, rawRows }; }, [csv]);
  const rows = parsed.rawRows.map((values) => Object.fromEntries(parsed.headers.map((header, index) => [header, values[index] ?? ""])));
  const importRows = rows.map((row) => ({ companyName: row[mapping.companyName] ?? "", website: row[mapping.website] ?? "", country: row[mapping.country] ?? "", industry: row[mapping.industry] ?? "" })).filter((row) => row.companyName);
  const submit = async () => { setBusy(true); setResult(null); const response = await fetch("/api/accounts/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: "accounts.csv", mapping, rows: importRows }) }); const payload = await response.json(); if (response.ok) { setResult(payload.data); router.refresh(); } setBusy(false); };
  return <div className="stack">
    <section className="card"><div className="card-header"><div><h2>1. Paste CSV</h2><span className="card-subtitle">Quoted cells and headers are supported.</span></div><FileSpreadsheet size={18} className="muted" /></div><textarea className="input" style={{ width: "100%", minHeight: 160, padding: 12, fontFamily: "monospace" }} value={csv} onChange={(event) => setCsv(event.target.value)} /></section>
    <section className="card"><div className="card-header"><div><h2>2. Map columns</h2><span className="card-subtitle">Company Name is required; website/domain is the preferred dedupe key.</span></div><StatusBadge status={`${importRows.length} READY`} /></div><div className="form-grid">{Object.entries(mapping).map(([field, value]) => <div className="field" key={field}><label>{field}</label><select value={value} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}>{parsed.headers.map((header) => <option key={header}>{header}</option>)}</select></div>)}</div></section>
    <section className="card"><div className="card-header"><h2>3. Preview & import</h2><Button onClick={submit} disabled={busy || importRows.length === 0}>{busy ? <Loader2 size={14} /> : <ArrowRight size={14} />}Import {importRows.length} rows</Button></div><div className="table-shell"><table className="data-table"><thead><tr><th>Company</th><th>Website</th><th>Country</th><th>Industry</th><th>Dedupe</th></tr></thead><tbody>{importRows.slice(0, 8).map((row, index) => <tr key={`${row.companyName}-${index}`}><td><strong>{row.companyName}</strong></td><td>{row.website}</td><td>{row.country}</td><td>{row.industry}</td><td><StatusBadge status={row.website ? "DOMAIN" : "NAME + COUNTRY"} /></td></tr>)}</tbody></table></div>{result && <div className="alert alert-info" style={{ marginTop: 14 }}><CheckCircle2 size={16} />Import completed: {result.created} created, {result.updated} updated, {result.skipped} skipped.</div>}</section>
  </div>;
}
