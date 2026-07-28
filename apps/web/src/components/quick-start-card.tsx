"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { MISSION_PRESETS } from "@/lib/mission-presets";

export function QuickStartCard() {
  return (
    <section className="quick-start-section" aria-labelledby="quick-start-title">
      <header className="quick-start-heading">
        <div>
          <h2 id="quick-start-title">Suggested workflows</h2>
          <p>Start with a bounded workflow, then review the plan before anything is created.</p>
        </div>
        <Link href="/app/missions/new">View all</Link>
      </header>
      <div className="quick-start-list">
        {MISSION_PRESETS.map((preset) => (
          <Link href={`/app/missions/new?preset=${preset.id}`} className="quick-start-card" key={preset.id}>
            <span className="quick-start-body">
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </span>
            <span className="quick-start-safety">
              <ShieldCheck size={12} />
              <small>{preset.type === "OPPORTUNITY_DISCOVERY" ? "Research only" : "Draft only"}</small>
            </span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
