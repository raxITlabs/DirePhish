"use client";

import { createContext, useContext } from "react";
import { formatDuration } from "@/app/lib/utils";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  message: string;
  durationMs?: number;
}

interface StepDef {
  id: string;
  label: string;
}

interface PipelineContextValue {
  steps: Record<string, StepState>;
  stepOrder: StepDef[];
  onStageClick: (stageId: string) => void;
}

export const PipelineContext = createContext<PipelineContextValue | null>(null);

const STATUS_ICON: Record<StepStatus, string> = {
  completed: "✓",
  running: "◉",
  failed: "✗",
  pending: "○",
  skipped: "○",
};

export default function PipelineStagesContent() {
  const ctx = useContext(PipelineContext);

  if (!ctx) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-sidebar-foreground/50 font-mono">Pipeline stages</p>
      </div>
    );
  }

  const { steps, stepOrder, onStageClick } = ctx;
  const completedCount = stepOrder.filter((s) => steps[s.id]?.status === "completed").length;
  const progress = stepOrder.length > 0 ? (completedCount / stepOrder.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="px-3">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stage list */}
      <ul className="space-y-0.5">
        {stepOrder.map((step) => {
          const state = steps[step.id];
          const status = state?.status || "pending";
          const isActive = status === "running";

          return (
            <li key={step.id}>
              <button
                onClick={() => onStageClick(step.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  isActive
                    ? "text-sidebar-primary bg-sidebar-accent font-medium"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <span className={`text-[13px] ${status === "failed" ? "text-destructive" : isActive ? "text-primary" : status === "completed" ? "text-verdigris-600" : "text-muted-foreground/40"}`}>
                  {STATUS_ICON[status]}
                </span>
                <span className="font-mono text-xs tracking-tight flex-1">{step.label}</span>
                {state?.durationMs && status === "completed" && (
                  <span className="text-[10px] font-mono text-muted-foreground/40">
                    {formatDuration(state.durationMs)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
