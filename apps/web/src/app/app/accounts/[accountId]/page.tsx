import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Clock3,
  Contact,
  ExternalLink,
  FileCheck2,
  Link2,
  ListTodo,
  Mail,
  MessageSquareText,
  Plus,
  Radar,
  Sparkles,
  UserRoundCheck,
  Workflow,
} from "lucide-react";
import { notFound } from "next/navigation";
import { DEMO_WORKSPACE_ID, getAccountDetail } from "@navo/db/queries";
import { Badge, Button, StatusBadge } from "@navo/ui";
import { AccountEvidenceDirectory, type EvidenceDirectoryItem } from "@/components/account-evidence-directory";
import { CompanyMark } from "@/components/company-mark";

type AccountDetail = NonNullable<Awaited<ReturnType<typeof getAccountDetail>>>;
type AccountTab = (typeof tabs)[number]["id"];
type ResearchState = "empty" | "partial" | "stale" | "blocked" | "complete";
type IntelligenceKind = "fact" | "signal" | "inference" | "decision" | "confirm";

const tabs = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "intelligence", label: "Intelligence", icon: Radar },
  { id: "contacts", label: "Contacts", icon: Contact },
  { id: "outreach", label: "Outreach", icon: MessageSquareText },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

const legacyTabMap: Record<string, AccountTab> = {
  research: "intelligence",
  evidence: "intelligence",
  messages: "outreach",
  memory: "activity",
  tasks: "activity",
  runs: "activity",
  crm: "activity",
};

const intelligenceKinds: Record<IntelligenceKind, { label: string; icon: typeof FileCheck2 }> = {
  fact: { label: "Verified fact", icon: FileCheck2 },
  signal: { label: "Sales signal", icon: Radar },
  inference: { label: "AI inference", icon: Bot },
  decision: { label: "Human decision", icon: UserRoundCheck },
  confirm: { label: "Needs confirmation", icon: CircleHelp },
};

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ tab?: string; view?: string }>;
}) {
  const { accountId } = await params;
  const { tab: requestedTab = "overview", view: requestedView } = await searchParams;
  const data = await getAccountDetail(DEMO_WORKSPACE_ID, accountId);
  if (!data) notFound();

  const activeTab = tabs.some(({ id }) => id === requestedTab)
    ? (requestedTab as AccountTab)
    : legacyTabMap[requestedTab] ?? "overview";
  const intelligenceView = requestedTab === "evidence" || requestedView === "evidence" ? "evidence" : "research";
  const activityView = ["memory", "tasks", "runs", "crm"].includes(requestedTab)
    ? requestedTab
    : ["memory", "tasks", "runs", "crm"].includes(requestedView ?? "")
      ? requestedView!
      : "memory";
  const researchState = getResearchState(data);

  return (
    <div className="page page-wide account-workspace">
      <div className="account-detail-main">
          <div className="account-back-row">
            <Link href="/app/accounts" className="account-back-link">Accounts</Link>
            <span aria-hidden="true">/</span><span>{data.account.name}</span>
          </div>

          <header className="account-workspace-header">
            <div className="account-header-primary-row">
              <div className="account-identity-header">
                <CompanyMark large />
                <div className="account-identity-copy">
                  <div className="account-heading-line">
                    <h1 title={data.account.name}>{data.account.name}</h1>
                  </div>
                  <p title={[data.account.industry, data.account.country].filter(Boolean).join(" · ")}>
                    {[data.account.industry, data.account.country].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>

              <div className="page-actions account-header-actions">
                {data.account.website ? <a href={data.account.website} target="_blank" rel="noreferrer" className="button button-secondary">Website</a> : null}
                <Link href={`/app/missions/new?accountId=${encodeURIComponent(accountId)}`} className="button button-primary">Create mission</Link>
              </div>
            </div>
          </header>

          <nav className="tabs account-tabs" aria-label="Account workspace sections">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            href={`?tab=${id}`}
            className={`tab ${activeTab === id ? "tab-active" : ""}`}
            aria-current={activeTab === id ? "page" : undefined}
          >
            <Icon size={13} />
            {label}
          </Link>
        ))}
          </nav>

          <main className="account-tab-content">
        {activeTab === "intelligence" ? (
          <>
            <AccountWorkspaceSubnav
              label="Intelligence views"
              active={intelligenceView}
              items={[
                { id: "research", label: "Research", href: "?tab=intelligence&view=research" },
                { id: "evidence", label: "Evidence directory", href: "?tab=intelligence&view=evidence" },
              ]}
            />
            {intelligenceView === "evidence"
              ? <EvidenceView data={data} />
              : <ResearchView data={data} researchState={researchState} />}
          </>
        ) : activeTab === "contacts" ? (
          <ContactsView data={data} />
        ) : activeTab === "outreach" ? (
          <MessagesView data={data} />
        ) : activeTab === "activity" ? (
          <>
            <AccountWorkspaceSubnav
              label="Activity views"
              active={activityView}
              items={[
                { id: "memory", label: "Memory", href: "?tab=activity&view=memory" },
                { id: "tasks", label: "Tasks", href: "?tab=activity&view=tasks" },
                { id: "runs", label: "Runs", href: "?tab=activity&view=runs" },
                { id: "crm", label: "CRM mirror", href: "?tab=activity&view=crm" },
              ]}
            />
            {activityView === "tasks" ? <TasksView data={data} />
              : activityView === "runs" ? <RunsView data={data} />
                : activityView === "crm" ? <CrmView data={data} />
                  : <MemoryView data={data} />}
          </>
        ) : (
          <OverviewView data={data} researchState={researchState} />
        )}
          </main>
      </div>
    </div>
  );
}

function ProfileSection({ title, items }: { title: string; items: Array<[string, string]> }) {
  return <section className="account-profile-section"><h2>{title}</h2><dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={value}>{value}</dd></div>)}</dl></section>;
}

function AccountWorkspaceSubnav({
  label,
  active,
  items,
}: {
  label: string;
  active: string;
  items: Array<{ id: string; label: string; href: string }>;
}) {
  return (
    <nav className="account-workspace-subnav" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={active === item.id ? "account-subtab-active" : undefined}
          aria-current={active === item.id ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function OverviewView({ data, researchState }: { data: AccountDetail; researchState: ResearchState }) {
  const qualification = data.qualification;
  const primaryAction = data.nextActions[0];
  const missionContext = data.missionTargets[0];

  return (
    <div className="account-overview-layout">
      <aside className="account-overview-profile" aria-label="Account profile">
        <div className="account-overview-profile-identity">
          <CompanyMark large />
          <strong>{data.account.name}</strong>
          {data.account.website || data.account.domain ? (
            <a href={data.account.website ?? `https://${data.account.domain}`} target="_blank" rel="noreferrer">{data.account.domain ?? "Open website"}</a>
          ) : null}
        </div>
        <div className="account-overview-status">
          <StatusBadge status={data.account.qualification} />
          <Badge tone={researchState === "complete" ? "success" : "warning"}>{researchStateLabel(researchState)}</Badge>
        </div>
        <ProfileSection
          title="Account details"
          items={[
            ["Owner", data.account.ownerName ?? "Unassigned"],
            ["Industry", data.account.industry ?? "Unknown"],
            ["Employees", data.account.employeeRange ?? "Unknown"],
            ["Region", data.account.country ?? "Unknown"],
            ["Domain", data.account.domain ?? "Unknown"],
            ["Source", humanize(data.account.source)],
            ["Updated", formatDate(data.account.lastResearchedAt) ?? "Never"],
          ]}
        />
        {qualification ? (
          <ProfileSection
            title="Qualification"
            items={[
              ["Fit score", String(qualification.score)],
              ["Confidence", `${Math.round(Number(qualification.confidence) * 100)}%`],
            ]}
          />
        ) : null}
        {missionContext ? (
          <section className="account-profile-section account-overview-related">
            <h2>Related mission</h2>
            <Link href={`/app/missions/${missionContext.mission.id}`}>
              <strong>{missionContext.mission.name}</strong>
              <span>{humanize(missionContext.mission.status)}</span>
            </Link>
          </section>
        ) : null}
      </aside>

      <div className="account-overview-objects">
        {data.account.riskSummary ? (
          <div className="account-overview-notice" role="status">
            <AlertTriangle size={14} />
            <span>{data.account.riskSummary}</span>
            <Link href="?tab=intelligence&view=research">Review</Link>
          </div>
        ) : null}

        <section className="account-object-panel">
          <SectionHeader title={`Contacts ${data.contacts.length}`} action={<Link href="?tab=contacts" className="section-link">View all</Link>} />
          {data.contacts.length ? (
            <div className="account-object-list">
              {data.contacts.slice(0, 3).map((contact) => (
                <article className="account-contact-row" key={contact.id}>
                  <span className="account-contact-avatar">{initials(contact.name)}</span>
                  <div><strong>{contact.name}</strong><small>{contact.title ?? "Role not specified"}</small></div>
                  <span>{contact.email ?? "No email"}</span>
                  <StatusBadge status={contact.status} />
                </article>
              ))}
            </div>
          ) : <EmptyPanel icon={Contact} title="No contacts yet" description="Research this account to identify relevant decision-makers." />}
        </section>

        <section className="account-object-panel">
          <SectionHeader title={`Signals ${data.signals.length}`} action={<Link href="?tab=intelligence&view=research" className="section-link">View sources</Link>} />
          {data.signals.length ? (
            <div className="account-object-list">
              {data.signals.slice(0, 4).map((signal) => (
                <article className="account-signal-overview-row" key={signal.id}>
                  <span aria-hidden="true" />
                  <div><strong>{signal.summary}</strong><small>{humanize(signal.type)}</small></div>
                  <time>{formatDate(signal.detectedAt) ?? "Unknown"}</time>
                  {asStrings(signal.evidenceUrls)[0] ? <a href={asStrings(signal.evidenceUrls)[0]} target="_blank" rel="noreferrer" aria-label={`Open source for ${signal.summary}`}><ExternalLink size={12} /></a> : null}
                </article>
              ))}
            </div>
          ) : <EmptyPanel icon={Radar} title="No signals yet" description="Source-linked account signals will appear here after research." />}
        </section>

        <section className="account-next-step-row">
          <div>
            <span>Next step</span>
            <strong>{primaryAction?.title ?? missionContext?.target.suggestedAction ?? "Review account intelligence"}</strong>
            <small>{primaryAction?.rationale ?? missionContext?.target.whySelected ?? "Confirm account evidence before starting outbound work."}</small>
          </div>
          <Link href={`/app/missions/new?accountId=${encodeURIComponent(data.account.id)}`}>Create mission <ArrowRight size={12} /></Link>
        </section>
      </div>
    </div>
  );
}

function ResearchView({ data, researchState }: { data: AccountDetail; researchState: ResearchState }) {
  const failed = data.missionTargets.find(({ mission }) => mission.status === "FAILED")?.mission;
  const qualification = data.qualification;

  return (
    <div className="research-workspace-grid">
      <div className="account-main-column">
        <section className="account-section research-summary-section">
          <SectionHeader
            title="Research summary"
            subtitle="Persisted, workspace-scoped account research."
            action={<ResearchStatePill state={researchState} />}
          />
          {data.account.summary ? (
            <p className="summary-text account-summary">{data.account.summary}</p>
          ) : (
            <EmptyPanel icon={CircleDashed} title="Research has not started" description="Start a mission to create an evidence-backed company summary." />
          )}
          {failed ? (
            <div className="account-state-banner state-banner-blocked" role="alert">
              <AlertTriangle size={15} />
              <div>
                <strong>Latest research mission needs attention</strong>
                <span>The run could not finish. Existing evidence remains available; open the mission to review the failure or retry.</span>
              </div>
              <Link href={`/app/missions/${failed.id}`}>Open mission <ArrowRight size={12} /></Link>
            </div>
          ) : null}
        </section>

        <section className="account-section">
          <SectionHeader title="Opportunity signals" subtitle="Evidence-linked indicators that may change account priority." action={<Badge tone="neutral">{data.signals.length}</Badge>} />
          {data.signals.length ? (
            <div className="signal-list">
              {data.signals.map((signal) => (
                <article className="signal-row" key={signal.id}>
                  <IntelligenceType kind="signal" compact />
                  <div className="signal-row-copy">
                    <strong>{signal.summary}</strong>
                    <p>{signal.rationale ?? "No rationale was saved."}</p>
                    <div className="signal-source-list">
                      {asStrings(signal.evidenceUrls).map((url) => (
                        <a href={url} target="_blank" rel="noreferrer" key={url} title={url}>
                          <ExternalLink size={11} />
                          <span>{sourceLabel(url)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                  <div className="signal-confidence"><strong>{Math.round(Number(signal.confidence ?? 0) * 100)}%</strong><span>confidence</span></div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyPanel icon={Radar} title="No sales signals found" description="Navo will place source-linked expansion, hiring, technology, and timing signals here." />
          )}
        </section>
      </div>

      <aside className="research-decision-column">
        <section className="rail-section qualification-panel">
          <SectionHeader title="Qualification decision" action={qualification ? <StatusBadge status={qualification.status} /> : null} />
          {qualification ? (
            <>
              <div className="qualification-decision-score">
                <strong>{qualification.score}</strong>
                <span><b>{humanize(qualification.status)}</b><small>{Math.round(Number(qualification.confidence) * 100)}% confidence</small></span>
              </div>
              <div className="mini-breakdown">
                {Object.entries(qualification.scoreBreakdown as Record<string, unknown>).map(([key, value]) => (
                  <div key={key}><span>{humanize(key)}</span><strong>{String(value)}</strong></div>
                ))}
              </div>
              <FindingList kind="decision" heading="Reasons" values={asStrings(qualification.reasons)} />
              <FindingList kind="confirm" heading="Risks" values={asStrings(qualification.risks)} />
            </>
          ) : (
            <EmptyPanel icon={CircleDashed} title="Decision pending" description="Qualification will appear once research provides enough evidence." />
          )}
        </section>

        <section className="rail-section">
          <SectionHeader title="Research completeness" />
          <ResearchChecklist label="Company summary" complete={Boolean(data.account.summary)} />
          <ResearchChecklist label="Source-linked evidence" complete={data.evidence.length > 0} />
          <ResearchChecklist label="Opportunity signals" complete={data.signals.length > 0} />
          <ResearchChecklist label="Qualification decision" complete={Boolean(data.qualification)} />
          <ResearchChecklist label="Decision-maker contact" complete={data.contacts.length > 0} />
        </section>
      </aside>
    </div>
  );
}

function EvidenceView({ data }: { data: AccountDetail }) {
  const linkedContact = data.contacts[0]
    ? {
        name: data.contacts[0].name,
        title: data.contacts[0].title ?? "Role not specified",
        initials: data.contacts[0].name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      }
    : undefined;
  const factItems: EvidenceDirectoryItem[] = data.evidence.map((item) => ({
      id: `fact-${item.id}`,
      kind: "fact" as const,
      title: item.title,
      summary: item.summary,
      source: item.sourceUrl ? sourceLabel(item.sourceUrl) : "Public source",
      sourceUrl: item.sourceUrl ?? undefined,
      confidence: Math.round(Number(item.confidence) * 100),
      updatedAt: formatDate(item.observedAt) ?? "Unknown date",
      excerpt: item.quote ?? item.summary,
      accessible: item.accessible,
      linkedContact,
    }));
  const signalItems: EvidenceDirectoryItem[] = data.signals.map((signal) => {
      const sourceUrl = asStrings(signal.evidenceUrls)[0];
      return {
        id: `signal-${signal.id}`,
        kind: "signal" as const,
        title: signal.summary,
        summary: signal.rationale ?? "Source-linked buying signal.",
        source: sourceUrl ? sourceLabel(sourceUrl) : "Signal research",
        sourceUrl,
        confidence: Math.round(Number(signal.confidence ?? 0) * 100),
        updatedAt: formatDate(signal.detectedAt) ?? "Unknown date",
        accessible: Boolean(sourceUrl),
        linkedContact,
      };
    });
  const inferenceItems: EvidenceDirectoryItem[] = data.inferences.map((item) => ({
      id: `inference-${item.id}`,
      kind: "inference" as const,
      title: item.statement,
      summary: `Derived from ${asStrings(item.evidenceIds).length} linked evidence items.`,
      source: "Navo AI",
      confidence: Math.round(Number(item.confidence) * 100),
      updatedAt: formatDate(item.createdAt) ?? "Unknown date",
      accessible: true,
      linkedContact,
    }));
  const decisionItems: EvidenceDirectoryItem[] = asStrings(data.qualification?.reasons).slice(0, 1).map((reason, index) => ({
      id: `decision-${index}`,
      kind: "decision" as const,
      title: reason,
      summary: "Human-reviewed qualification rationale for this account.",
      source: "Sales team",
      confidence: Math.round(Number(data.qualification?.confidence ?? 0) * 100),
      updatedAt: formatDate(data.qualification?.createdAt) ?? "Unknown date",
      accessible: true,
      linkedContact,
    }));
  const confirmationItems: EvidenceDirectoryItem[] = asStrings(data.qualification?.risks).slice(0, 2).map((risk, index) => ({
      id: `confirm-${index}`,
      kind: "confirm" as const,
      title: risk,
      summary: "This uncertainty should be confirmed before outbound execution.",
      source: "Sales team",
      confidence: 65,
      updatedAt: formatDate(data.qualification?.createdAt) ?? "Unknown date",
      accessible: true,
      linkedContact,
    }));
  const allItems = [...factItems, ...signalItems, ...inferenceItems, ...decisionItems, ...confirmationItems];
  const leadingItems = [factItems[0], signalItems[0], inferenceItems[0], decisionItems[0], confirmationItems[0], factItems[1], signalItems[1], inferenceItems[1]].filter((item): item is EvidenceDirectoryItem => Boolean(item));
  const leadingIds = new Set(leadingItems.map((item) => item.id));
  const items = [...leadingItems, ...allItems.filter((item) => !leadingIds.has(item.id))];
  const primaryAction = data.nextActions[0];

  return (
    <AccountEvidenceDirectory
      accountId={data.account.id}
      items={items}
      nextAction={{
        title: primaryAction?.title ?? "Prepare a discovery meeting",
        proposedDate: "Tue, Jul 21, 2026",
      }}
    />
  );
}

function ContactsView({ data }: { data: AccountDetail }) {
  return (
    <section className="account-section">
      <SectionHeader
        title="Contacts"
        subtitle="Decision-makers and buying committee members linked to this account."
        action={<Button disabled title="Contact creation is driven by research and import in this Alpha."><Plus size={14} />Add contact</Button>}
      />
      {data.contacts.length ? (
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Title</th><th>Persona</th><th>Email</th><th>Verification</th><th>Status</th></tr></thead>
            <tbody>{data.contacts.map((contact) => (
              <tr key={contact.id}>
                <td><strong>{contact.name}</strong></td><td>{contact.title}</td><td>{contact.persona}</td><td>{contact.email}</td>
                <td><StatusBadge status={contact.emailVerification} /></td><td><StatusBadge status={contact.suppressed ? "SUPPRESSED" : contact.status} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <EmptyPanel icon={Contact} title="No contacts yet" description="Import contacts or run account research to identify evidence-backed decision-makers." />}
    </section>
  );
}

function MessagesView({ data }: { data: AccountDetail }) {
  return (
    <section className="account-section">
      <SectionHeader title="Messages" subtitle="Generated drafts, approvals, and send states for this account." action={<Badge tone="accent"><Mail size={12} />{data.messages.length}</Badge>} />
      {data.messages.length ? data.messages.map((message) => (
        <div className="list-row account-list-row" key={message.id}>
          <span><strong>{message.subject}</strong><small>{message.body.slice(0, 140)}{message.body.length > 140 ? "…" : ""}</small></span>
          <StatusBadge status={message.status} />
        </div>
      )) : <EmptyPanel icon={Mail} title="No messages yet" description="Drafts will appear here after research and qualification are complete." />}
    </section>
  );
}

function RunsView({ data }: { data: AccountDetail }) {
  return (
    <section className="account-section">
      <SectionHeader title="Runs" subtitle="Automation activity executed for this account." action={<Badge tone="neutral"><Activity size={12} />{data.runs.length}</Badge>} />
      {data.runs.length ? data.runs.map((run) => (
        <Link href={`/app/runs/${run.id}`} className="list-row account-list-row" key={run.id}>
          <span><strong className="mono">Run #{run.runNumber}</strong><small>{run.currentNode}</small></span><StatusBadge status={run.status} />
        </Link>
      )) : <EmptyPanel icon={Workflow} title="No runs yet" description="Completed and active play runs will appear here." />}
    </section>
  );
}

function MemoryView({ data }: { data: AccountDetail }) {
  return (
    <div className="evidence-workspace-grid">
      <section className="account-section">
        <SectionHeader title="Account memory" subtitle="Durable source-linked facts retained across missions." action={<Badge tone="accent">{data.memory.length}</Badge>} />
        {data.memory.length ? data.memory.map((fact) => (
          <div className="list-row account-list-row" key={fact.id}>
            <span><strong>{humanize(fact.category)}</strong><small>{fact.fact}</small></span><Badge tone="success">{Math.round(Number(fact.confidence) * 100)}%</Badge>
          </div>
        )) : <EmptyPanel icon={BrainCircuit} title="Account memory is empty" description="Verified facts will be retained here after research and human review." />}
      </section>
      <aside className="account-main-column">
        <section className="rail-section">
          <SectionHeader title="Next best actions" />
          {data.nextActions.length ? data.nextActions.map((action) => (
            <article className="memory-action" key={action.id}><StatusBadge status={action.priority} /><h3>{action.title}</h3><p>{action.rationale}</p></article>
          )) : <EmptyPanel icon={Sparkles} title="No next action" description="Navo will recommend an action when enough account context is available." />}
        </section>
      </aside>
    </div>
  );
}

function TasksView({ data }: { data: AccountDetail }) {
  return (
    <section className="account-section">
      <SectionHeader title="Manual tasks" subtitle="Human work required to unblock or advance this account." action={<Badge tone="neutral">{data.tasks.length}</Badge>} />
      {data.tasks.length ? data.tasks.map((task) => (
        <div className="list-row account-list-row" key={task.id}>
          <span><strong>{task.title}</strong><small>{task.description}</small></span>
          <span className="status-pair"><StatusBadge status={task.priority} /><StatusBadge status={task.status} /></span>
        </div>
      )) : <EmptyPanel icon={ListTodo} title="No manual tasks" description="Tasks will appear when Navo needs human input or follow-up." />}
    </section>
  );
}

function CrmView({ data }: { data: AccountDetail }) {
  return (
    <section className="account-section">
      <SectionHeader title="CRM mirror" subtitle="Read-only opportunity context synchronized into Navo." action={<Badge tone={data.opportunities.length ? "success" : "neutral"}>{data.opportunities.length ? "SYNCED" : "NO RECORD"}</Badge>} />
      {data.opportunities.length ? (
        <div className="crm-opportunity-list">
          {data.opportunities.map((opportunity) => (
            <article className="crm-opportunity" key={opportunity.id}>
              <div className="crm-opportunity-main"><span className="crm-icon"><Link2 size={14} /></span><div><strong>{opportunity.name}</strong><span>{opportunity.stage}</span></div></div>
              <div><span>Next step</span><strong>{opportunity.nextStep ?? "Not set"}</strong></div>
            </article>
          ))}
        </div>
      ) : <EmptyPanel icon={Link2} title="No CRM opportunity linked" description="Connect an opportunity to mirror stage and next-step context here without changing the CRM source of truth." />}
    </section>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="account-section-header">
      <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
      {action ? <div className="account-section-action">{action}</div> : null}
    </div>
  );
}

function IntelligenceType({ kind, compact = false }: { kind: IntelligenceKind; compact?: boolean }) {
  const config = intelligenceKinds[kind];
  const Icon = config.icon;
  return <span className={`intelligence-type intelligence-type-${kind}${compact ? " intelligence-type-compact" : ""}`}><Icon size={12} />{config.label}</span>;
}

function FindingList({ kind, heading, values }: { kind: "decision" | "confirm"; heading: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="finding-list">
      <div><IntelligenceType kind={kind} compact /><strong>{heading}</strong></div>
      <ul>{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul>
    </div>
  );
}

function EmptyPanel({ icon: Icon, title, description, actionHref, actionLabel }: { icon: typeof CircleDashed; title: string; description: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="account-empty-state">
      <span><Icon size={17} /></span>
      <div><strong>{title}</strong><p>{description}</p></div>
      {actionHref && actionLabel ? <Link className="button button-secondary" href={actionHref}>{actionLabel}</Link> : null}
    </div>
  );
}

function ResearchStateIcon({ state }: { state: ResearchState }) {
  const Icon = state === "complete" ? CheckCircle2 : state === "blocked" ? AlertTriangle : state === "stale" ? Clock3 : state === "partial" ? CircleDashed : CircleHelp;
  return <Icon className={`research-state-icon research-state-${state}`} size={14} aria-hidden="true" />;
}

function ResearchStatePill({ state }: { state: ResearchState }) {
  return <span className={`research-state-pill research-state-pill-${state}`}><ResearchStateIcon state={state} />{researchStateLabel(state)}</span>;
}

function ResearchChecklist({ label, complete }: { label: string; complete: boolean }) {
  return <div className="research-check-row">{complete ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}<span>{label}</span><strong>{complete ? "Complete" : "Pending"}</strong></div>;
}

function getResearchState(data: AccountDetail): ResearchState {
  const hasEvidence = data.evidence.length > 0;
  const hasSignals = data.signals.length > 0;
  const hasSummary = Boolean(data.account.summary);
  const hasQualification = Boolean(data.qualification);
  const failed = data.missionTargets.some(({ mission }) => mission.status === "FAILED");
  if (failed) return hasEvidence || hasSummary ? "partial" : "blocked";
  if (!hasEvidence && !hasSignals && !hasSummary) return "empty";
  if (!hasEvidence || !hasSummary || !hasQualification) return "partial";
  if (data.account.lastResearchedAt) {
    const age = Date.now() - new Date(data.account.lastResearchedAt).getTime();
    if (age > 1000 * 60 * 60 * 24 * 30) return "stale";
  }
  return "complete";
}

function researchStateLabel(state: ResearchState) {
  return { empty: "Not started", partial: "Partial", stale: "Stale", blocked: "Blocked", complete: "Current" }[state];
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function sourceLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
