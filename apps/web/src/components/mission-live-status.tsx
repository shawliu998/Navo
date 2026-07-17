"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { StatusBadge } from "@navo/ui";
import { liveMissionStatuses, shouldRefreshMission, terminalMissionStatuses, type MissionLiveSnapshot } from "@/lib/mission-command";

type MissionResponse = { data?: { mission?: MissionLiveSnapshot & { updatedAt?: string | Date }; events?: unknown[] } };

export function MissionLiveStatus({ missionId, status, progress, currentStep, updatedAt, eventCount }: MissionLiveSnapshot & { missionId: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MissionLiveSnapshot>({ status, progress, currentStep, updatedAt, eventCount });
  const latest = useRef(snapshot);

  useEffect(() => {
    if (!liveMissionStatuses.has(status)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/missions/${missionId}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null) as MissionResponse | null;
        const mission = payload?.data?.mission;
        if (!disposed && response.ok && mission) {
          const next = { status: mission.status, progress: mission.progress, currentStep: mission.currentStep, updatedAt: mission.updatedAt ? new Date(mission.updatedAt).toISOString() : undefined, eventCount: payload.data?.events?.length ?? 0 };
          if (shouldRefreshMission(latest.current, next)) {
            latest.current = next;
            setSnapshot(next);
            router.refresh();
          }
          if (terminalMissionStatuses.has(next.status) || !liveMissionStatuses.has(next.status)) return;
        }
      } catch {
        // A transient request failure should never disrupt the mission detail page.
      }
      if (!disposed) timer = setTimeout(() => void poll(), 2_000);
    };
    void poll();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [missionId, router, status]);

  const live = liveMissionStatuses.has(snapshot.status);
  return <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8, fontSize: 12 }}>
    <Activity size={13} className={live ? "spin" : "muted"} />
    <strong>{live ? "Polling" : "Updated"}</strong>
    <StatusBadge status={snapshot.status} />
    <span className="muted">{snapshot.progress}% · {snapshot.currentStep ?? "Waiting for the next step"}</span>
  </span>;
}
