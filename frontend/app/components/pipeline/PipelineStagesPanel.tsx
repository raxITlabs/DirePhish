"use client";

import { useEffect, useRef, useState } from "react";
import type { SimulationStatus, ThreatAnalysisResponse } from "@/app/types";
import { formatDuration } from "@/app/lib/utils";
import { AsciiStatus, AsciiProgressBar, AsciiSectionHeader } from "@/app/components/ascii/DesignSystem";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  message: string;
  detail?: string;
  durationMs?: number;
}

interface StepDef {
  id: string;
  label: string;
}

interface PipelineStagesPanelProps {
  steps: Record<string, StepState>;
  stepOrder: StepDef[];
  selectedStageId: string | null;
  onSelectStage: (stageId: string) => void;
  simStatus: SimulationStatus | null;
  dossierSummary?: string;
  pipelineComplete: boolean;
  threatData?: ThreatAnalysisResponse | null;
  runId?: string;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onSkip?: () => void;
  cancelled?: boolean;
  paused?: boolean;
  mcProgress?: { completed: number; total: number } | null;
}

const STATUS_TO_ASCII: Record<StepStatus, "complete" | "running" | "failed" | "pending"> = {
  completed: "complete",
  running: "running",
  failed: "failed",
  pending: "pending",
  skipped: "pending",
};

function getInlineSummary(
  stageId: string,
  state: StepState | undefined,
  simStatus: SimulationStatus | null,
  threatData: ThreatAnalysisResponse | null | undefined,
  dossierSummary: string | undefined,
): string {
  switch (stageId) {
    case "research":
      return state?.message || "Research complete";
    case "dossier_review":
      return dossierSummary ? `${dossierSummary} — confirmed` : "Dossier confirmed";
    case "threat_analysis": {
      const scenarios = threatData?.scenarios?.length || 0;
      const paths = threatData?.attackPaths?.length || 0;
      return scenarios > 0 ? `${scenarios} scenarios, ${paths} attack paths` : (state?.message || "Analysis complete");
    }
    case "scenario_selection": {
      const count = threatData?.scenarios?.length || 0;
      return count > 0 ? `${count} scenarios selected` : (state?.message || "Selection complete");
    }
    case "config_expansion":
      return state?.detail || state?.message || "Configs generated";
    case "simulations":
      return state?.message || "Simulations complete";
    case "reports":
      return state?.message || "Reports generated";
    case "comparative":
      return state?.message || "Analysis complete";
    case "monte_carlo": {
      if (state?.detail) {
        try {
          const parsed = JSON.parse(state.detail);
          const count = parsed.iterations || 0;
          return `${count || "?"} variation${count !== 1 ? 's' : ''} tested`;
        } catch {
          return state.detail;
        }
      }
      return state?.message || "Stress testing";
    }
    case "counterfactual":
      return state?.message || "Testing alternate decisions";
    case "exercise_report":
      return state?.message || "Exercise report complete";
    default:
      return state?.message || "Complete";
  }
}

export default function PipelineStagesPanel({
  steps,
  stepOrder,
  selectedStageId,
  onSelectStage,
  simStatus,
  dossierSummary,
  pipelineComplete,
  threatData,
  runId,
  onCancel,
  onPause,
  onResume,
  onSkip,
  cancelled,
  paused,
  mcProgress,
}: PipelineStagesPanelProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const completedCount = stepOrder.filter((s) => steps[s.id]?.status === "completed").length;
  const totalSteps = stepOrder.length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  // Live elapsed timer — ticks every second while pipeline is running
  const completedDurationMs = stepOrder.reduce((sum, s) => sum + (steps[s.id]?.durationMs || 0), 0);
  const isRunning = stepOrder.some((s) => steps[s.id]?.status === "running");
  const startTimeRef = useRef<number | null>(null);
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    if (isRunning && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    if (!isRunning && pipelineComplete) {
      startTimeRef.current = null;
    }
  }, [isRunning, pipelineComplete]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setLiveTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const runningElapsed = isRunning && startTimeRef.current ? Date.now() - startTimeRef.current : 0;
  const totalDurationMs = completedDurationMs + runningElapsed;

  // Determine overall status label
  const runningStep = stepOrder.find((s) => steps[s.id]?.status === "running");
  let statusLabel = "Waiting to start...";
  if (cancelled) {
    statusLabel = "Pipeline cancelled";
  } else if (paused) {
    statusLabel = "Pipeline paused";
  } else if (pipelineComplete) {
    statusLabel = "Pipeline complete";
  } else if (runningStep) {
    statusLabel = `Running: ${runningStep.label}`;
  } else if (completedCount > 0) {
    statusLabel = `${completedCount}/${totalSteps} stages done`;
  }

  return (
    <div className="w-64 sm:w-[280px] shrink-0 flex flex-col overflow-hidden m-2 bg-card rounded-xl border border-border/20 shadow-sm">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/10">
        <AsciiSectionHeader as="h2">Simulation Pipeline</AsciiSectionHeader>
        <p className="text-[11px] font-mono text-muted-foreground truncate mt-2">{statusLabel}</p>
        {/* Progress bar + elapsed + status on one line */}
        <div className="flex items-center gap-2 mt-2">
          <AsciiProgressBar value={progress} width={10} showPercent={false} />
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {Math.round(progress)}%
          </span>
          {totalDurationMs > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
              {formatDuration(totalDurationMs)}
            </span>
          )}
          <span className="ml-auto">
            {!pipelineComplete && runningStep && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
                Live
              </span>
            )}
            {pipelineComplete && (
              <span className="text-[10px] font-mono text-verdigris-600">Done</span>
            )}
          </span>
        </div>
      </div>

      {/* Stage list */}
      <div className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5 px-2">
          {stepOrder.map((step, index) => {
            const state = steps[step.id];
            const status = state?.status || "pending";
            const isSelected = selectedStageId === step.id;
            const isActive = status === "running";

            return (
              <li key={step.id}>
                {/* Stage row */}
                <button
                  onClick={() => onSelectStage(step.id)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 ${
                    isSelected
                      ? "bg-primary/8 border border-primary/20"
                      : isActive
                        ? "bg-primary/5 border border-primary/10"
                        : status === "completed"
                          ? "border border-transparent hover:bg-muted/30"
                          : "border border-transparent hover:bg-muted/20 cursor-pointer"
                  }`}
                >
                  {/* Status indicator */}
                  <span className="shrink-0 mt-0.5">
                    <AsciiStatus status={STATUS_TO_ASCII[status]} showLabel={false} />
                  </span>

                  {/* Label + inline summary */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`font-mono text-xs tracking-tight block ${
                        isActive
                          ? "text-foreground font-medium"
                          : status === "completed"
                            ? "text-foreground/70"
                            : "text-muted-foreground/60"
                      }`}
                    >
                      {step.label}
                    </span>

                    {/* Inline summary — always visible for non-pending stages */}
                    {status === "completed" && (
                      <span className="text-[10px] font-mono text-muted-foreground/60 truncate block mt-0.5">
                        {getInlineSummary(step.id, state, simStatus, threatData, dossierSummary)}
                      </span>
                    )}
                    {status === "running" && (
                      <span className="text-[10px] font-mono text-muted-foreground/60 truncate block mt-0.5">
                        {state?.message || "Processing..."}
                      </span>
                    )}
                  </div>

                  {/* Duration or pulse */}
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot shrink-0 mt-1.5" />
                  )}
                  {state?.durationMs && status === "completed" && (
                    <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0 mt-0.5">
                      {formatDuration(state.durationMs)}
                    </span>
                  )}
                </button>

                {/* Connector line between stages */}
                {index < stepOrder.length - 1 && (
                  <div className="flex justify-start ml-[22px] h-2">
                    <div
                      className={`w-px ${
                        status === "completed" ? "bg-verdigris-300" : "bg-border/20"
                      }`}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Pipeline controls */}
      {!pipelineComplete && !cancelled && (isRunning || paused) && (
        <div className="px-4 py-3 border-t border-border/10 space-y-1.5">
          {!paused ? (
            <>
              {/* Pause button — context-aware label */}
              <button
                onClick={onPause}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-border/30 text-xs font-mono text-muted-foreground hover:text-tuscan-sun-700 hover:border-tuscan-sun-300 transition-colors"
              >
                <span className="select-none" aria-hidden="true">║</span>
                {runningStep?.id === "monte_carlo"
                  ? "Pause stress testing"
                  : runningStep?.id === "simulations"
                    ? "Pause simulations"
                    : `Pause after ${runningStep?.label || "current step"}`}
              </button>

              {/* Skip — only for expensive steps */}
              {(runningStep?.id === "monte_carlo" || runningStep?.id === "simulations") && (
                <button
                  onClick={onSkip}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1 rounded-lg text-[11px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  <span className="select-none" aria-hidden="true">»</span>
                  Skip to next step
                </button>
              )}
            </>
          ) : (
            <>
              {/* Resume */}
              <button
                onClick={onResume}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-verdigris-300 bg-verdigris-50 text-xs font-mono text-verdigris-700 hover:bg-verdigris-100 transition-colors"
              >
                <span className="select-none" aria-hidden="true">▶</span>
                Resume
              </button>

              {/* Skip while paused */}
              <button
                onClick={onSkip}
                className="w-full flex items-center justify-center gap-2 px-3 py-1 rounded-lg text-[11px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <span className="select-none" aria-hidden="true">»</span>
                Skip to next step
              </button>
            </>
          )}

          {/* Cancel — always with confirmation */}
          {!confirmCancel ? (
            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono text-muted-foreground/50 hover:text-burnt-peach-600 transition-colors"
            >
              <span className="select-none" aria-hidden="true">✗</span>
              Cancel
            </button>
          ) : (
            <div className="space-y-1.5 p-2 rounded-lg border border-burnt-peach-200 bg-burnt-peach-50/50">
              <p className="text-[10px] font-mono text-burnt-peach-600 text-center">
                This will stop the pipeline permanently.
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { onCancel?.(); setConfirmCancel(false); }}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-burnt-peach-300 bg-burnt-peach-100 text-xs font-mono text-burnt-peach-700 hover:bg-burnt-peach-200 transition-colors"
                >
                  [yes, cancel]
                </button>
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-border/30 text-xs font-mono text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  [no, keep running]
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paused footer — context-aware status */}
      {paused && !cancelled && (
        <div className="px-4 py-2 border-t border-tuscan-sun-200 bg-tuscan-sun-50/50">
          <p className="text-[10px] font-mono text-tuscan-sun-700 text-center">
            {runningStep?.id === "monte_carlo" && mcProgress
              ? `║ Paused at ${mcProgress.completed}/${mcProgress.total} variations`
              : runningStep?.id === "simulations"
                ? "║ Paused"
                : `║ Paused after ${runningStep?.label || "current step"}`}
          </p>
        </div>
      )}

      {/* Cancelled state */}
      {cancelled && (
        <div className="px-4 py-2 border-t border-burnt-peach-200 bg-burnt-peach-50/50">
          <p className="text-[10px] font-mono text-burnt-peach-600 text-center">
            ✗ Pipeline was cancelled
          </p>
        </div>
      )}
    </div>
  );
}
