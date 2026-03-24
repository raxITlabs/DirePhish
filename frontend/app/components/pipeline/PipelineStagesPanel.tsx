"use client";

import type { SimulationStatus, ThreatAnalysisResponse } from "@/app/types";
import { formatDuration } from "@/app/lib/utils";

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
}

const STATUS_ICON: Record<StepStatus, string> = {
  completed: "\u2713",
  running: "\u25C9",
  failed: "\u2717",
  pending: "\u25CB",
  skipped: "\u25CB",
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
    case "monte_carlo":
      return state?.detail ? `MC: ${state.detail}` : "Monte Carlo complete";
    case "counterfactual":
      return state?.detail ? state.detail : "Counterfactual complete";
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
}: PipelineStagesPanelProps) {
  const completedCount = stepOrder.filter((s) => steps[s.id]?.status === "completed").length;
  const totalSteps = stepOrder.length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  // Determine overall status label
  const runningStep = stepOrder.find((s) => steps[s.id]?.status === "running");
  let statusLabel = "Waiting to start...";
  if (pipelineComplete) {
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-mono text-xs font-semibold text-foreground/80 uppercase tracking-wider">
            Pipeline
          </h2>
          {!pipelineComplete && runningStep && (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
              Live
            </span>
          )}
          {pipelineComplete && (
            <span className="text-[10px] font-mono text-verdigris-600">
              Done
            </span>
          )}
        </div>
        <p className="text-[11px] font-mono text-muted-foreground truncate">{statusLabel}</p>
        {/* Progress bar */}
        <div
          className="mt-2 h-1 bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] font-mono text-muted-foreground/40 mt-1">
          {Math.round(progress)}% complete
        </p>
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
                  <span
                    className={`text-[13px] shrink-0 mt-0.5 ${
                      status === "completed"
                        ? "text-verdigris-600"
                        : isActive
                          ? "text-primary"
                          : status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground/30"
                    }`}
                  >
                    <span aria-hidden="true">{STATUS_ICON[status]}</span>
                    <span className="sr-only">{status}</span>
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
    </div>
  );
}
