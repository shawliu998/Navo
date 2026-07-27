"use client";

import Link from "next/link";
import { Activity, ArrowRight, CalendarClock } from "lucide-react";
import { StatusBadge } from "@navo/ui";
import styles from "@/app/app/missions/missions.module.css";

export type MissionListItem = {
  id: string; name: string; type: string; objective: string; status: string; progress: number;
  processedCount: number; targetCount: number; qualifiedCount: number; pendingApprovalCount: number;
  currentStep: string | null; updatedAt: string; dueAt: string | null;
};

const filters = [
  { label: "Active", statuses: ["ACTIVE", "RUNNING"] }, { label: "Waiting", statuses: ["WAITING"] },
  { label: "Completed", statuses: ["COMPLETED"] }, { label: "Draft", statuses: ["DRAFT", "PLANNING", "READY"] },
  { label: "Paused", statuses: ["PAUSED"] }, { label: "Failed", statuses: ["FAILED"] },
] as const;

export function MissionList({ missions, current }: { missions: MissionListItem[]; current?: string }) {
  const selected = filters.some((item) => item.label.toLowerCase() === current?.toLowerCase()) ? current!.toLowerCase() : "all";
  const activeFilter = filters.find((item) => item.label.toLowerCase() === selected);
  const visible = activeFilter ? missions.filter((mission) => (activeFilter.statuses as readonly string[]).includes(mission.status)) : missions;
  return <>
    <nav className={styles.filterBar} aria-label="Mission status filters">
      <Link href="/app/missions" className={`${styles.filterButton} ${selected === "all" ? styles.filterButtonActive : ""}`}>
        All <span className={styles.filterCount}>{missions.length}</span>
      </Link>
      {filters.map((filter) => {
        const count = missions.filter((mission) => (filter.statuses as readonly string[]).includes(mission.status)).length;
        const key = filter.label.toLowerCase();
        return <Link key={key} href={`/app/missions?status=${key}`} className={`${styles.filterButton} ${selected === key ? styles.filterButtonActive : ""}`}>
          {filter.label}<span className={styles.filterCount}>{count}</span>
        </Link>;
      })}
    </nav>
    <div className={styles.missionGrid}>
      {visible.map((mission) => <Link href={`/app/missions/${mission.id}`} className={styles.missionCard} key={mission.id}>
        <div className={styles.cardTop}><div><span className={styles.typeLabel}>{formatLabel(mission.type)}</span><h2>{mission.name}</h2></div><StatusBadge status={mission.status}/></div>
        <p className={styles.summary}>{mission.objective}</p>
        <div className={styles.progressRow}><div className={styles.progressTrack}><div className={styles.progressFill} style={{width:`${Math.max(0,Math.min(100,mission.progress))}%`}}/></div><strong>{mission.progress}%</strong></div>
        <div className={styles.metricRow}>
          <span className={styles.miniMetric}><span>Processed</span><strong>{mission.processedCount}/{mission.targetCount}</strong></span>
          <span className={styles.miniMetric}><span>Qualified</span><strong>{mission.qualifiedCount}</strong></span>
          <span className={styles.miniMetric}><span>Approvals</span><strong>{mission.pendingApprovalCount}</strong></span>
          <span className={styles.miniMetric}><span>Due</span><strong>{mission.dueAt ? shortDate(mission.dueAt) : "—"}</strong></span>
        </div>
        <footer className={styles.cardFooter}><span className={styles.currentStep}><Activity size={13}/><span>{mission.currentStep ?? "No current step"}</span></span><span style={{display:"inline-flex",alignItems:"center",gap:5}}>Updated {relativeTime(mission.updatedAt)} <ArrowRight size={13}/></span></footer>
      </Link>)}
      {!visible.length && <div className={styles.empty}><CalendarClock size={24}/><p>No {selected} missions yet.</p></div>}
    </div>
  </>;
}

function formatLabel(value:string){return value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase())}
function shortDate(value:string){return new Intl.DateTimeFormat("en",{month:"short",day:"numeric"}).format(new Date(value))}
function relativeTime(value:string){const days=Math.round((Date.now()-new Date(value).getTime())/86400000);return days<=0?"today":days===1?"yesterday":`${days}d ago`}
