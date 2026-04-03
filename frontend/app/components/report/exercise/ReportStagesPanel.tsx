"use client";

import type { ExerciseReport } from "@/app/actions/report";

function formatTactic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface KillChainStep {
  step: number;
  tactic: string;
  technique: string;
  target: string;
  description: string;
}

type ViewId = "playbook" | "executive" | "security" | "crisis-comms";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "executive", label: "Executive Summary" },
  { id: "security", label: "Security Team" },
  { id: "crisis-comms", label: "Crisis Comms" },
];

interface ReportStagesPanelProps {
  killChain: KillChainStep[];
  activeStep: number;
  onStepClick: (index: number) => void;
  report: ExerciseReport;
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
}

export default function ReportStagesPanel({
  killChain,
  activeStep,
  onStepClick,
  report,
  activeView,
  onViewChange,
}: ReportStagesPanelProps) {
  const mc = report.monteCarloStats;
  const resilience = report.resilience;
  const containedPct =
    mc && mc.iteration_count > 0
      ? Math.round(
          ((mc.outcome_distribution.contained_early +
            mc.outcome_distribution.contained_late) /
            mc.iteration_count) *
            100,
        )
      : 0;

  return (
    <div className="w-64 sm:w-[280px] shrink-0 flex flex-col overflow-hidden m-2 bg-card rounded-xl border border-border/20 shadow-sm">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/10">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-mono text-xs font-semibold text-foreground/80 uppercase tracking-wider">
            Attack Path
          </h2>
          <span className="text-[10px] font-mono text-verdigris-600">
            Report
          </span>
        </div>
        <p className="text-[11px] font-mono text-muted-foreground truncate">
          {report.companyName ?? "Exercise"} · {report.generatedAt ? new Date(report.generatedAt).toLocaleDateString() : ""}
        </p>

        {/* Readiness bar */}
        {resilience && (
          <>
            <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-tuscan-sun-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${resilience.overall}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] font-mono text-muted-foreground/40">
                Readiness {resilience.overall}/100
              </span>
              {mc && (
                <span className="text-[10px] font-mono text-muted-foreground/40">
                  {containedPct}% contained
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Kill Chain Steps */}
      <div className="flex-1 overflow-y-auto py-2">
        <p className="px-4 mb-1.5 font-mono text-[10px] text-muted-foreground/40 uppercase tracking-wider">
          Kill Chain
        </p>
        <ul className="space-y-0.5 px-2">
          {killChain.map((step, i) => {
            const isSelected = i === activeStep && activeView === "playbook";

            return (
              <li key={step.step}>
                <button
                  onClick={() => {
                    onStepClick(i);
                    onViewChange("playbook");
                  }}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 ${
                    isSelected
                      ? "bg-primary/8 border border-primary/20"
                      : "border border-transparent hover:bg-muted/30"
                  }`}
                >
                  {/* Step number */}
                  <span
                    className={`text-[13px] shrink-0 mt-0.5 ${
                      isSelected ? "text-primary" : "text-verdigris-600"
                    }`}
                  >
                    {isSelected ? "\u25C9" : "\u2713"}
                  </span>

                  <div className="flex-1 min-w-0">
                    <span
                      className={`font-mono text-xs tracking-tight block ${
                        isSelected
                          ? "text-foreground font-medium"
                          : "text-foreground/70"
                      }`}
                    >
                      {formatTactic(step.tactic)}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/60 truncate block mt-0.5">
                      {step.technique} · {step.target}
                    </span>
                  </div>
                </button>

                {/* Connector line */}
                {i < killChain.length - 1 && (
                  <div className="flex justify-start ml-[22px] h-2">
                    <div className="w-px bg-verdigris-300" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* View Switcher */}
        <div className="mt-4 px-4">
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground/40 uppercase tracking-wider">
            Views
          </p>
          <div className="space-y-0.5 px-0">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => onViewChange(v.id)}
                className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 ${
                  activeView === v.id
                    ? "bg-primary/8 border border-primary/20"
                    : "border border-transparent hover:bg-muted/30"
                }`}
              >
                <span
                  className={`text-[13px] shrink-0 mt-0.5 ${
                    activeView === v.id
                      ? "text-primary"
                      : "text-muted-foreground/30"
                  }`}
                >
                  {activeView === v.id ? "\u25C9" : "\u25CB"}
                </span>
                <span
                  className={`font-mono text-xs tracking-tight ${
                    activeView === v.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {v.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
