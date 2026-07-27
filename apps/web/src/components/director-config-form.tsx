"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type DirectorConfig = {
  enabled: boolean;
  intervalMinutes: number;
  cooldownMinutes: number;
  maxActiveMissions: number;
  dailyMissionLimit: number;
};

export function DirectorConfigForm({ initialConfig }: { initialConfig: DirectorConfig }) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = JSON.stringify(config) !== JSON.stringify(initialConfig);
  const numberField = (key: Exclude<keyof DirectorConfig, "enabled">, label: string, hint: string, min: number, max: number) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <input type="number" min={min} max={max} value={config[key]} onChange={(event) => {
        const value = Number(event.target.value);
        setSaved(false);
        setConfig((current) => ({ ...current, [key]: Number.isFinite(value) ? value : min }));
      }} />
      <small className="muted">{hint}</small>
    </label>
  );
  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/agent/director", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(config) });
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not save Director settings.");
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Director settings.");
    } finally {
      setBusy(false);
    }
  };
  return <form onSubmit={(event) => { event.preventDefault(); void save(); }} style={{ marginTop: 16 }}>
    <div className="card-header"><div><h3>Director settings</h3><span className="card-subtitle">Changes take effect on the next tick. Enabling queues one immediately.</span></div>
      <label className="toolbar-group" style={{ cursor: "pointer" }}><input type="checkbox" checked={config.enabled} onChange={(event) => { setSaved(false); setConfig((current) => ({ ...current, enabled: event.target.checked })); }} /> <strong>Enabled</strong></label>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
      {numberField("intervalMinutes", "Check interval (min)", "1–1,440 minutes", 1, 1_440)}
      {numberField("cooldownMinutes", "New Mission cooldown (min)", "0–10,080 minutes", 0, 10_080)}
      {numberField("maxActiveMissions", "Max active Missions", "1–20 concurrently", 1, 20)}
      {numberField("dailyMissionLimit", "Daily root Mission limit", "1–100 per day", 1, 100)}
    </div>
    {error && <p className="alert alert-danger" style={{ marginTop: 12 }}>{error}</p>}
    <div className="toolbar-group" style={{ marginTop: 14 }}>
      <button className="button button-primary" type="submit" disabled={busy || !changed}>{busy ? <><Loader2 className="spin" size={14} />Saving…</> : <><Save size={14} />Save settings</>}</button>
      {saved && <span className="muted">Saved. The Director will use these limits on its next decision.</span>}
    </div>
  </form>;
}
