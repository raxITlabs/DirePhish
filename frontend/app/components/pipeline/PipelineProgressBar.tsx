"use client";

import { AsciiProgressBar } from "@/app/components/ascii/DesignSystem";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  message: string;
  detail?: string;
  durationMs?: number;
  cost?: number;
}

interface StepDef {
  id: string;
  label: string;
}

interface PipelineProgressBarProps {
  steps: Record<string, StepState>;
  stepOrder: StepDef[];
}

const STATUS_COLORS: Record<StepStatus, string> = {
  completed: "bg-green-500",
  running: "bg-primary",
  failed: "bg-destructive",
  pending: "bg-muted",
  skipped: "bg-muted",
};

export default function PipelineProgressBar({ steps, stepOrder }: PipelineProgressBarProps) {
  const activeStep = stepOrder.find((s) => steps[s.id]?.status === "running");
  const activeState = activeStep ? steps[activeStep.id] : null;
  const completedCount = stepOrder.filter((s) => steps[s.id]?.status === "completed").length;
  const progressPct = stepOrder.length > 0 ? (completedCount / stepOrder.length) * 100 : 0;

  return (
    <div className="px-4 py-3 border-b border-border bg-card">
      <div className="flex gap-1">
        {stepOrder.map((stepDef) => {
          const status = steps[stepDef.id]?.status || "pending";
          return (
            <div
              key={stepDef.id}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${STATUS_COLORS[status]}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-sm">
          {activeStep ? (
            <span>
              <span className="font-medium">{activeStep.label}</span>
              {activeState?.message && (
                <span className="text-muted-foreground"> — {activeState.message}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {stepOrder.every((s) => steps[s.id]?.status === "completed")
                ? "Pipeline complete"
                : "Starting pipeline..."}
            </span>
          )}
        </div>
        <AsciiProgressBar value={progressPct} width={14} label="Pipeline progress" />
      </div>
    </div>
  );
}
