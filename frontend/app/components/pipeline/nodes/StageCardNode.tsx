"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SimulationStatus, AgentAction } from "@/app/types";
import { formatDuration } from "@/app/lib/utils";
import { AsciiStatus, AsciiMetric } from "@/app/components/ascii/DesignSystem";
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface StageCardData {
  stageId: string;
  label: string;
  status: StepStatus;
  message?: string;
  detail?: string;
  durationMs?: number;
  expanded: boolean;
  onToggle: (stageId: string) => void;
  // Simulation-specific (only for simulations stage)
  simStatus?: SimulationStatus | null;
  simActions?: AgentAction[];
  // Dossier-specific
  onConfirmDossier?: () => void;
  confirming?: boolean;
  dossierSummary?: string;
}

const STATUS_TO_ASCII: Record<StepStatus, "complete" | "running" | "failed" | "pending"> = {
  completed: "complete",
  running: "running",
  failed: "failed",
  pending: "pending",
  skipped: "pending",
};

function StageCardNode({ data }: NodeProps) {
  const d = data as unknown as StageCardData;

  if (!d.expanded) {
    // Collapsed pill
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/20 shadow-sm cursor-pointer hover:border-border/40 transition-colors font-mono text-xs ${
          d.status === "running" ? "border-primary/30 bg-primary/5" : ""
        }`}
        onClick={() => d.onToggle(d.stageId)}
      >
        <AsciiStatus status={STATUS_TO_ASCII[d.status]} showLabel={false} />
        <span className="text-foreground/80">{d.label}</span>
      </div>
    );
  }

  // Expanded card
  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className="w-[320px] bg-card rounded-xl border border-border/20 shadow-md overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-border/10 cursor-pointer"
          onClick={() => d.onToggle(d.stageId)}
        >
          <div className="flex items-center gap-2">
            <AsciiStatus status={STATUS_TO_ASCII[d.status]} showLabel={false} />
            <span className="font-mono text-sm font-medium text-foreground">{d.label}</span>
          </div>
          {d.status === "running" && (
            <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
              Live
            </span>
          )}
          {d.durationMs && d.status === "completed" && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {formatDuration(d.durationMs)}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="px-4 py-3 max-h-[300px] overflow-y-auto">
          <StageContent data={d} />
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </>
  );
}

function StageContent({ data }: { data: StageCardData }) {
  const d = data;

  // Simulation live panel
  if (d.stageId === "simulations" && d.simStatus) {
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <AsciiMetric label="Round" value={`${d.simStatus.currentRound}/${d.simStatus.totalRounds}`} />
          <AsciiMetric label="Actions" value={String(d.simStatus.actionCount)} />
          <AsciiMetric label="Status" value={d.simStatus.status === "running" ? "Live" : "Idle"} valueColor={d.simStatus.status === "running" ? "text-primary" : "text-muted-foreground"} />
        </div>
        {d.simActions && d.simActions.length > 0 && (
          <div className="space-y-1 max-h-[150px] overflow-y-auto">
            {[...d.simActions].reverse().slice(0, 10).map((a, i) => (
              <div
                key={i}
                className={`text-[10px] font-mono px-2 py-1 rounded ${
                  a.role === "red_team" ? "bg-burnt-peach-50 text-burnt-peach-700" : "bg-verdigris-50 text-verdigris-700"
                }`}
              >
                <span className="font-semibold">{a.agent}:</span> {a.action}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Dossier review
  if (d.stageId === "dossier_review" && d.dossierSummary) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">{d.dossierSummary}</p>
        {d.onConfirmDossier && (
          <button
            onClick={d.onConfirmDossier}
            disabled={d.confirming}
            className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-xs font-mono font-medium disabled:opacity-40"
          >
            {d.confirming ? <><AsciiSpinner /> Confirming</> : "Confirm & Continue"}
          </button>
        )}
      </div>
    );
  }

  // Default: show message/detail
  if (d.status === "running") {
    return (
      <div className="flex items-center gap-2">
        <AsciiSpinner />
        <span className="text-xs font-mono text-muted-foreground">{d.message || "Processing\u2026"}</span>
      </div>
    );
  }

  if (d.status === "failed") {
    return <p className="text-xs font-mono text-destructive">{d.message || "Stage failed"}</p>;
  }

  if (d.status === "completed") {
    return <p className="text-xs font-mono text-muted-foreground">{d.message || "Completed"}</p>;
  }

  return <p className="text-xs font-mono text-muted-foreground/50">Waiting...</p>;
}

export default memo(StageCardNode);
