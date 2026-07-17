"use client";

import Link from "next/link";
import { ArrowRight, Rocket, ShieldCheck } from "lucide-react";
import { MISSION_PRESETS } from "@/lib/mission-presets";

export function QuickStartCard() {
  return <div className="stack" style={{marginBottom:16}}>{MISSION_PRESETS.map((preset) => (
    <Link href={`/app/missions/new?preset=${preset.id}`} className="quick-start-card" key={preset.id}>
      <span className="quick-start-icon"><Rocket size={18} /></span>
      <span className="quick-start-body">
        <strong>{preset.name}</strong>
        <small className="muted">{preset.description}</small>
      </span>
      <span className="quick-start-safety">
        <ShieldCheck size={12} />
        <small>{preset.type === "OPPORTUNITY_DISCOVERY" ? "Research only" : "DRAFT only"}</small>
      </span>
      <ArrowRight size={16} className="muted" />
    </Link>
  ))}</div>;
}
