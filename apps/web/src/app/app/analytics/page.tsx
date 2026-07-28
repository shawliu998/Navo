import { DEMO_WORKSPACE_ID, getAccounts, getApprovals, getOverview } from "@navo/db/queries";
import { PageHeader } from "@navo/ui";
import { FunnelBars, QualificationPie } from "@/components/analytics-charts";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const [{ metrics }, accounts, approvals] = await Promise.all([
    getOverview(DEMO_WORKSPACE_ID),
    getAccounts(DEMO_WORKSPACE_ID),
    getApprovals(DEMO_WORKSPACE_ID),
  ]);
  const approved = approvals.filter(({ approval }) => ["APPROVED", "APPROVED_WITH_CHANGES"].includes(approval.status)).length;
  const qualified = metrics.qualified;
  const imported = Math.max(metrics.imported, 1);
  const stages = [
    ["Imported", metrics.imported, "stage-imported"],
    ["Qualified", qualified, "stage-qualified"],
    ["Approved", approved, "stage-approved"],
    ["Positive reply", metrics.positive, "stage-positive"],
    ["Meeting", metrics.meetings, "stage-meeting"],
  ] as const;
  const sourceMap = new Map<string, { accounts: number; qualified: number; strong: number }>();
  for (const account of accounts) {
    const label = account.source.replaceAll("_", " ").toLowerCase();
    const current = sourceMap.get(label) ?? { accounts: 0, qualified: 0, strong: 0 };
    current.accounts += 1;
    if (!["NOT_RESEARCHED", "LOW_FIT", "DISQUALIFIED"].includes(account.qualification)) current.qualified += 1;
    if (account.qualification === "STRONG_FIT") current.strong += 1;
    sourceMap.set(label, current);
  }
  const channels = [...sourceMap.entries()].sort((a, b) => b[1].accounts - a[1].accounts).slice(0, 4);
  const qualificationCounts = accounts.reduce((counts, account) => {
    if (account.qualification === "STRONG_FIT") counts.strong += 1;
    else if (account.qualification === "POTENTIAL_FIT") counts.potential += 1;
    else if (account.qualification === "NEEDS_REVIEW") counts.review += 1;
    else counts.other += 1;
    return counts;
  }, { strong: 0, potential: 0, review: 0, other: 0 });
  const qualificationData = [
    { name: "Strong", value: qualificationCounts.strong, color: "#277f78" },
    { name: "Potential", value: qualificationCounts.potential, color: "#6ea9a4" },
    { name: "Review", value: qualificationCounts.review, color: "#d3a65f" },
    { name: "Other", value: qualificationCounts.other, color: "#d7dcda" },
  ];
  const metricCards = [
    ["Imported accounts", metrics.imported, "Current workspace"],
    ["Qualified accounts", qualified, `Qualification Rate · ${Math.round(qualified / imported * 100)}%`],
    ["Approved actions", approved, `${qualified ? Math.round(approved / qualified * 100) : 0}% of qualified`],
    ["Positive replies", metrics.positive, `${metrics.replies ? Math.round(metrics.positive / metrics.replies * 100) : 0}% positive reply rate`],
    ["Meetings booked", metrics.meetings, `${Math.round(metrics.meetings / imported * 100)}% of imported`],
  ] as const;

  return <div className="page page-wide analytics-page">
    <PageHeader title="Analytics" description="Account quality, approved actions and response outcomes from the current workspace." />

    <div className="analytics-toolbar analytics-toolbar-snapshot">
      <div className="analytics-updated"><span>Live database</span><small>Current workspace snapshot · no historical estimates</small></div>
    </div>

    <section className="analytics-metric-strip">
      {metricCards.map(([label, value, helper]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>)}
    </section>

    <section className="analytics-visual-grid">
      <article className="analytics-panel analytics-funnel-panel">
        <header><div><h2>Current pipeline conversion</h2><p>Imported → meeting · current workspace</p></div><span>{metrics.imported} accounts</span></header>
        <div className="analytics-funnel-large">
          <FunnelBars data={stages.map(([name, value]) => ({ name, value }))} />
        </div>
      </article>

      <article className="analytics-panel analytics-qualification-panel">
        <header><div><h2>Qualification mix</h2><p>Current account qualification states</p></div><span>{accounts.length} accounts</span></header>
        <div className="analytics-qualification-body">
          <QualificationPie data={qualificationData} />
          <div className="analytics-qualification-legend">
            {qualificationData.map((item) => <span key={item.name}><i style={{ background: item.color }} /><strong>{item.name}</strong><em>{item.value}</em></span>)}
          </div>
        </div>
      </article>
    </section>

    <section className="analytics-panel analytics-channel-panel">
      <header><h2>Source performance</h2><span>Current workspace qualification outcomes</span></header>
      <table><thead><tr><th>Source</th><th>Accounts</th><th>Qualified</th><th>Strong fit</th><th>Qualification rate</th></tr></thead>
        <tbody>{channels.map(([label, values]) => <tr key={label}><td>{label}</td><td>{values.accounts}</td><td>{values.qualified}</td><td>{values.strong}</td><td>{Math.round(values.qualified / Math.max(values.accounts, 1) * 100)}%</td></tr>)}
          <tr className="analytics-total-row"><td>Total</td><td>{metrics.imported}</td><td>{qualified}</td><td>{qualificationCounts.strong}</td><td>{Math.round(qualified / imported * 100)}%</td></tr>
        </tbody>
      </table>
    </section>
  </div>;
}
