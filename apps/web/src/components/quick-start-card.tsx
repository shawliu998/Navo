"use client";

import Link from "next/link";
import { ArrowRight, Rocket, ShieldCheck } from "lucide-react";
import { GOLDEN_MISSION_PRESET } from "@/lib/mission-presets";

export function QuickStartCard() {
  return (
    <Link href={`/app/missions/new?preset=${GOLDEN_MISSION_PRESET.id}`} className="quick-start-card">
      <span className="quick-start-icon"><Rocket size={18} /></span>
      <span className="quick-start-body">
        <strong>{GOLDEN_MISSION_PRESET.name}</strong>
        <small className="muted">{GOLDEN_MISSION_PRESET.description}</small>
      </span>
      <span className="quick-start-safety">
        <ShieldCheck size={12} />
        <small>DRAFT only</small>
      </span>
      <ArrowRight size={16} className="muted" />
    </Link>
  );
}
