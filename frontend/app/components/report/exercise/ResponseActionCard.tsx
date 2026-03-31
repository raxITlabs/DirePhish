"use client";

import type { ResponseAction } from "@/app/actions/report";
import EvidenceChip from "./EvidenceChip";

interface Props {
  action: ResponseAction;
  index: number;
}

const priorityStyles: Record<ResponseAction["priority"], string> = {
  critical: "bg-red-50 text-red-700",
  high: "bg-amber-50 text-amber-700",
  medium: "bg-royal-azure-900/20 text-royal-azure-400",
};

export default function ResponseActionCard({ action, index }: Props) {
  return (
    <div className="rounded-xl border border-pitch-black-200 bg-pitch-black-100 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pitch-black-200 text-xs font-semibold text-pitch-black-700">
          {index}
        </span>
        <h4 className="text-sm font-semibold text-pitch-black-700 flex-1">
          {action.title}
        </h4>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityStyles[action.priority]}`}
        >
          {action.priority}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-pitch-black-600 mb-3">{action.description}</p>

      {/* Commands */}
      {action.commands.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {action.commands.map((cmd, i) => (
            <pre
              key={i}
              className="rounded-lg bg-pitch-black-200 px-3 py-2 text-xs font-mono text-pitch-black-700 overflow-x-auto"
            >
              {cmd}
            </pre>
          ))}
        </div>
      )}

      {/* Evidence chips */}
      {action.evidence_chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {action.evidence_chips.map((chip, i) => (
            <EvidenceChip
              key={i}
              label={chip.label}
              type={chip.type}
              isInferred={chip.is_inferred}
            />
          ))}
        </div>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-pitch-black-400">
        {action.owner && <span>Owner: {action.owner}</span>}
        {action.sla && <span>SLA: {action.sla}</span>}
        {action.regulatory_refs.length > 0 && (
          <span>{action.regulatory_refs.join(", ")}</span>
        )}
      </div>
    </div>
  );
}
