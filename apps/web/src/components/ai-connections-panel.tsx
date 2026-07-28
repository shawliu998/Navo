"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, PlugZap, TriangleAlert } from "lucide-react";
import { Badge } from "@navo/ui";
import { AI_PROVIDER_PRESETS, integrationErrorMessage } from "@/lib/integration-settings";

type ProviderId = keyof typeof AI_PROVIDER_PRESETS;
type ConnectionSummary = {
  baseUrl: string;
  hasCredential: boolean;
  isDefault: boolean;
  keyHint: string | null;
  lastError: string | null;
  model: string;
  provider: ProviderId;
  status: string;
  testedAt: string | null;
};

type RequestState = "idle" | "saving" | "testing";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "CONNECTED") return "success";
  if (status === "CONFIGURED") return "warning";
  if (status === "ERROR") return "danger";
  return "neutral";
}

export function AIConnectionsPanel({ initialConnections }: { initialConnections: ConnectionSummary[] }) {
  const initialProvider = initialConnections.find((item) => item.isDefault)?.provider ?? "deepseek";
  const [provider, setProvider] = useState<ProviderId>(initialProvider);
  const [connections, setConnections] = useState(initialConnections);
  const initialConnection = initialConnections.find((item) => item.provider === initialProvider);
  const [baseUrl, setBaseUrl] = useState(initialConnection?.baseUrl || AI_PROVIDER_PRESETS[initialProvider].baseUrl);
  const [model, setModel] = useState(initialConnection?.model || AI_PROVIDER_PRESETS[initialProvider].model);
  const [apiKey, setApiKey] = useState("");
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const selected = useMemo(() => connections.find((item) => item.provider === provider), [connections, provider]);
  const busy = requestState !== "idle";

  const chooseProvider = (nextProvider: ProviderId) => {
    const connection = connections.find((item) => item.provider === nextProvider);
    setProvider(nextProvider);
    setBaseUrl(connection?.baseUrl || AI_PROVIDER_PRESETS[nextProvider].baseUrl);
    setModel(connection?.model || AI_PROVIDER_PRESETS[nextProvider].model);
    setApiKey("");
    setNotice(null);
  };

  const replaceConnection = (connection: ConnectionSummary) => {
    setConnections((items) => [...items.filter((item) => item.provider !== connection.provider), connection]);
  };

  const save = async () => {
    setRequestState("saving");
    setNotice(null);
    try {
      const response = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, baseUrl, model, apiKey: apiKey.trim() || undefined }),
      });
      const payload = await response.json().catch(() => null) as { data?: ConnectionSummary } | null;
      if (!response.ok || !payload?.data) throw new Error(integrationErrorMessage(payload, "AI connection could not be saved."));
      replaceConnection(payload.data);
      setApiKey("");
      setNotice({ tone: "success", message: "Configuration saved. Test it before starting a real Mission." });
    } catch (cause) {
      setNotice({ tone: "danger", message: cause instanceof Error ? cause.message : "AI connection could not be saved." });
    } finally {
      setRequestState("idle");
    }
  };

  const test = async () => {
    setRequestState("testing");
    setNotice(null);
    try {
      const response = await fetch("/api/settings/integrations/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = await response.json().catch(() => null) as { data?: ConnectionSummary; meta?: { latencyMs?: number } } | null;
      if (!response.ok || !payload?.data) throw new Error(integrationErrorMessage(payload, "Connection test failed."));
      replaceConnection(payload.data);
      setNotice({ tone: "success", message: `Connection verified${payload.meta?.latencyMs ? ` in ${payload.meta.latencyMs} ms` : ""}. New Missions will use this provider.` });
    } catch (cause) {
      setNotice({ tone: "danger", message: cause instanceof Error ? cause.message : "Connection test failed." });
      const refreshed = await fetch("/api/settings/integrations", { cache: "no-store" }).then((response) => response.json()).catch(() => null) as { data?: ConnectionSummary[] } | null;
      if (refreshed?.data) setConnections(refreshed.data);
    } finally {
      setRequestState("idle");
    }
  };

  return <section className="card settings-runtime-card" aria-labelledby="ai-runtime-heading">
    <header className="settings-section-header">
      <div>
        <span className="eyebrow">MISSION RUNTIME</span>
        <h2 id="ai-runtime-heading">AI connection</h2>
        <p>One tested workspace connection is used by Mission planning and the worker.</p>
      </div>
      <Badge tone={statusTone(selected?.status ?? "NOT_CONNECTED")}>{selected?.status ?? "NOT CONNECTED"}</Badge>
    </header>

    <div className="settings-provider-tabs" role="tablist" aria-label="AI provider">
      {(Object.keys(AI_PROVIDER_PRESETS) as ProviderId[]).map((id) => <button
        type="button"
        role="tab"
        aria-selected={provider === id}
        className={provider === id ? "settings-provider-tab active" : "settings-provider-tab"}
        key={id}
        onClick={() => chooseProvider(id)}
        disabled={busy}
      >
        <strong>{AI_PROVIDER_PRESETS[id].label}</strong>
        <small>{connections.find((item) => item.provider === id)?.status ?? "Not configured"}</small>
      </button>)}
    </div>

    <p className="settings-provider-description">{AI_PROVIDER_PRESETS[provider].description}</p>
    <div className="form-grid settings-connection-form">
      <div className="field">
        <label htmlFor="ai-base-url">Base URL</label>
        <input id="ai-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor="ai-model">Model</label>
        <input id="ai-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model identifier" disabled={busy} />
      </div>
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="ai-api-key">API key</label>
        <input id="ai-api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={selected?.keyHint ? `Saved ${selected.keyHint} · leave blank to keep` : "Paste a server-side API key"} autoComplete="off" disabled={busy} />
        <small className="muted">Stored encrypted for this local workspace and never returned to the browser.</small>
      </div>
    </div>

    {selected?.testedAt && <div className="settings-connection-meta"><CheckCircle2 size={13} /><span>Last tested {new Date(selected.testedAt).toLocaleString("en")}</span><span>{selected.model}</span></div>}
    {selected?.lastError && <div className="alert alert-danger" role="alert"><TriangleAlert size={15} /><span>{selected.lastError}</span></div>}
    {notice && <div className={`alert ${notice.tone === "success" ? "alert-success" : "alert-danger"}`} role="status">
      {notice.tone === "success" ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}<span>{notice.message}</span>
    </div>}

    <footer className="settings-connection-actions">
      <button className="button button-primary" type="button" onClick={() => void save()} disabled={busy || !baseUrl.trim() || !model.trim() || (!apiKey.trim() && !selected?.hasCredential)}>
        {requestState === "saving" ? <Loader2 className="spin" size={14} /> : <PlugZap size={14} />}
        {requestState === "saving" ? "Saving…" : "Save configuration"}
      </button>
      <button className="button button-secondary" type="button" onClick={() => void test()} disabled={busy || !selected?.hasCredential}>
        {requestState === "testing" ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
        {requestState === "testing" ? "Testing…" : "Test connection"}
      </button>
    </footer>
  </section>;
}
