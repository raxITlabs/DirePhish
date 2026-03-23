"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SimulationStatus, AgentAction } from "@/app/types";

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

const STATUS_ICON: Record<StepStatus, string> = {
  completed: "\u2713",
  running: "\u25C9",
  failed: "\u2717",
  pending: "\u25CB",
  skipped: "\u25CB",
};

const STATUS_COLOR: Record<StepStatus, string> = {
  completed: "text-verdigris-600",
  running: "text-primary",
  failed: "text-destructive",
  pending: "text-muted-foreground/40",
  skipped: "text-muted-foreground/30",
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
        <span className={STATUS_COLOR[d.status]}>{STATUS_ICON[d.status]}</span>
        <span className="text-foreground/80">{d.label}</span>
        {d.status === "running" && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot ml-1" />
        )}
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
            <span className={`text-sm ${STATUS_COLOR[d.status]}`}>{STATUS_ICON[d.status]}</span>
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
              {(d.durationMs / 1000).toFixed(1)}s
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
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono">{d.simStatus.currentRound}/{d.simStatus.totalRounds}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Round</div>
          </div>
          <div className="bg-muted rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono">{d.simStatus.actionCount}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Actions</div>
          </div>
          <div className="bg-muted rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono">{d.simStatus.status === "running" ? "\u25C9" : "\u25CB"}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Status</div>
          </div>
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
            {d.confirming ? "Confirming..." : "Confirm & Continue"}
          </button>
        )}
      </div>
    );
  }

  // Default: show message/detail
  if (d.status === "running") {
    return (
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-muted-foreground">{d.message || "Processing..."}</span>
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
