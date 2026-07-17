"use client";

import { Eye, Gauge, LockKeyhole, Sparkles } from "lucide-react";

export type OperatingMode = "OBSERVE" | "RECOMMEND" | "APPROVAL_CONTROLLED" | "AUTOPILOT";

const modes = [
  {
    id: "OBSERVE",
    label: "Observe",
    description: "Read, analyze and summarize only. No actions are created.",
    policy: "No external actions",
    icon: Eye,
  },
  {
    id: "RECOMMEND",
    label: "Recommend",
    description: "Research and propose actions. You decide what gets executed.",
    policy: "Every action is manual",
    icon: Sparkles,
  },
  {
    id: "APPROVAL_CONTROLLED",
    label: "Approval Controlled",
    description: "Low-risk internal work runs automatically. Outreach requires approval.",
    policy: "Email, sequences and CRM need approval",
    icon: LockKeyhole,
  },
  {
    id: "AUTOPILOT",
    label: "Autopilot",
    description: "Higher autonomy with configurable safety limits.",
    policy: "Coming later",
    icon: Gauge,
    disabled: true,
  },
] as const;

export function AgentOperatingMode({
  value,
  onChange,
  disabled = false,
}: {
  value: OperatingMode;
  onChange?: (mode: OperatingMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="operating-modes" disabled={disabled}>
      <legend>Operating mode</legend>
      {modes.map((mode) => {
        const Icon = mode.icon;
        const selected = value === mode.id;
        const unavailable = "disabled" in mode && mode.disabled;
        return (
          <label
            className={`operating-mode${selected ? " operating-mode-selected" : ""}${
              unavailable ? " operating-mode-disabled" : ""
            }`}
            key={mode.id}
          >
            <input
              type="radio"
              name="agent-operating-mode"
              value={mode.id}
              checked={selected}
              onChange={() => onChange?.(mode.id)}
              disabled={disabled || unavailable}
            />
            <span className="operating-mode-icon">
              <Icon size={15} />
            </span>
            <span className="operating-mode-copy">
              <span className="operating-mode-title">
                <strong>{mode.label}</strong>
                {unavailable && <span className="badge badge-neutral">Coming later</span>}
              </span>
              <small>{mode.description}</small>
              <span>{mode.policy}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
