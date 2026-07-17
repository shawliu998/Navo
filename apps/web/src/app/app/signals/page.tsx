import Link from "next/link";
import { ArrowRight, Radar, Sparkles, Target } from "lucide-react";
import { DEMO_WORKSPACE_ID, getAccountMissionContexts, getSignals } from "@navo/db/queries";
import { Badge, MetricCard, PageHeader, StatusBadge } from "@navo/ui";

export const metadata = { title: "Signals" };

export default async function SignalsPage() {
  const [items, missionContexts] = await Promise.all([getSignals(DEMO_WORKSPACE_ID), getAccountMissionContexts(DEMO_WORKSPACE_ID)]);
  const contextByAccount = new Map<string, (typeof missionContexts)[number]>();
  for (const context of missionContexts) if (!contextByAccount.has(context.accountId)) contextByAccount.set(context.accountId, context);
  const highConfidence = items.filter(({ signal }) => Number(signal.confidence) >= .8).length;
  const inMission = items.filter(({ signal }) => contextByAccount.has(signal.accountId)).length;

  return <div className="page page-wide">
    <PageHeader eyebrow="AGENT DISCOVERY" title="Signals" description="将来源可追溯的业务变化与 Navo 当前 Mission 上下文放在一起，便于判断为何关注以及下一步。"/>
    <section className="metrics-grid">
      <MetricCard label="Observed signals" value={items.length} helper="Current workspace" icon={<Radar size={14}/>}/>
      <MetricCard label="High confidence" value={highConfidence} helper="Confidence ≥ 80%" icon={<Sparkles size={14}/>}/>
      <MetricCard label="In mission context" value={inMission} helper="Account is a mission target" icon={<Target size={14}/>}/>
    </section>
    <div className="table-shell"><table className="data-table"><thead><tr><th>Signal</th><th>Account</th><th>Confidence</th><th>Status</th><th>Agent context</th><th>Detected</th><th></th></tr></thead><tbody>{items.map(({signal, accountName}) => {
      const context = contextByAccount.get(signal.accountId);
      const confidence = Math.round(Number(signal.confidence) * 100);
      return <tr key={signal.id}>
        <td><span><Badge tone="accent"><Sparkles size={11}/>{signal.type.replaceAll("_", " ")}</Badge><small className="muted" style={{display: "block", marginTop: 7, maxWidth: 360}}>{signal.summary}</small></span></td>
        <td><Link href={`/app/accounts/${signal.accountId}`}><strong>{accountName}</strong></Link><small className="muted" style={{display: "block"}}>{signal.ownerName ?? "No owner"}</small></td>
        <td><Badge tone={confidence >= 80 ? "success" : confidence >= 60 ? "warning" : "danger"}>{confidence}%</Badge></td>
        <td><StatusBadge status={signal.status}/></td>
        <td>{context ? <Link href={`/app/missions/${context.missionId}`}><strong style={{display: "block", fontSize: 12}}>{context.missionName}</strong><small className="muted" style={{display: "block", marginTop: 3}}>{context.currentStep ?? context.suggestedAction ?? "Target selected"} · {context.priority.toLowerCase()} priority</small></Link> : <span><strong style={{display: "block", fontSize: 12}}>Not in an active context</strong><small className="muted">Available for future mission planning</small></span>}</td>
        <td>{signal.detectedAt.toLocaleDateString("zh-CN")}</td>
        <td><Link className="icon-button" href={`/app/accounts/${signal.accountId}`} aria-label={`Open ${accountName}`}><ArrowRight size={14}/></Link></td>
      </tr>;
    })}</tbody></table></div>
    <div className="alert alert-info" style={{marginTop: 14}}><Radar size={16}/><span>当一个 Account 属于多个 Mission 时，这里展示最近更新的 Mission 上下文；原始 Signal 不会因此被改写。</span></div>
  </div>;
}
