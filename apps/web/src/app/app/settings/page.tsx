import { FileClock, KeyRound, ShieldCheck, Users } from "lucide-react";
import { DEMO_WORKSPACE_ID, getWorkspaceAIConnections } from "@navo/db";
import { Badge, Button, PageHeader } from "@navo/ui";
import { AIConnectionsPanel } from "@/components/ai-connections-panel";

export default async function SettingsPage() {
  const connections = await getWorkspaceAIConnections(DEMO_WORKSPACE_ID);
  return <div className="page settings-page">
    <PageHeader eyebrow="WORKSPACE" title="Settings" description="Workspace defaults and the connections used by Mission runtime." />
    <div className="settings-layout">
      <main className="stack">
        <AIConnectionsPanel initialConnections={connections} />
        <section className="card">
          <div className="card-header"><h2>General</h2><Badge tone="accent">Nova Automation</Badge></div>
          <div className="form-grid">
            <div className="field"><label>Workspace name</label><input value="Nova Automation" readOnly /></div>
            <div className="field"><label>Default language</label><select value="en-US" disabled><option value="en-US">English</option><option value="zh-CN">简体中文</option></select></div>
            <div className="field"><label>Target markets</label><input value="Germany, United States, Netherlands" readOnly /></div>
            <div className="field"><label>Runtime</label><input value="Local workspace" readOnly /></div>
          </div>
          <Button disabled title="Workspace profile editing is not part of this release.">Save workspace</Button>
        </section>
      </main>
      <aside className="stack">
        <section className="card">
          <div className="card-header"><h2><Users size={15} /> Members</h2><Badge tone="neutral">Local owner</Badge></div>
          <div className="list-row"><span><strong>Workspace owner</strong><small className="muted" style={{ display: "block" }}>demo@navo.local</small></span><Badge tone="success">Owner</Badge></div>
          <Button variant="secondary" style={{ width: "100%" }} disabled title="Member management is not part of the local release.">Manage members</Button>
        </section>
        <section className="card">
          <div className="list-row"><span className="attention-icon"><KeyRound size={16} /></span><span style={{ flex: 1 }}><strong>Credentials</strong><small className="muted" style={{ display: "block" }}>Encrypted at rest · server only</small></span><ShieldCheck size={16} color="var(--success)" /></div>
          <div className="list-row"><span className="attention-icon"><FileClock size={16} /></span><span style={{ flex: 1 }}><strong>Connection activity</strong><small className="muted" style={{ display: "block" }}>See Tool Status for runtime history</small></span></div>
        </section>
      </aside>
    </div>
  </div>;
}
