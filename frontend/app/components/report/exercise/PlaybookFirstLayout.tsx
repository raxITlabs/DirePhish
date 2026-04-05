"use client";

import { useState } from "react";
import { AsciiEmptyState } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport, AttackPathStep } from "@/app/actions/report";
import ReportStagesPanel from "./ReportStagesPanel";
import KillChainNav from "./KillChainNav";
import StepDetail from "./StepDetail";
import ExecutiveSummaryView from "./ExecutiveSummaryView";
import SecurityTeamView from "./SecurityTeamView";
import CrisisCommsView from "./CrisisCommsView";
import CostView from "./CostView";

function formatTactic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ViewId = "playbook" | "executive" | "security" | "crisis-comms" | "cost";

interface PlaybookFirstLayoutProps {
  report: ExerciseReport;
  projectId: string;
}

export default function PlaybookFirstLayout({
  report,
  projectId,
}: PlaybookFirstLayoutProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [activeView, setActiveView] = useState<ViewId>("playbook");

  const attackPathPlaybook = report.attackPathPlaybook ?? [];
  const killChain = report.methodology?.attackPaths?.[0]?.killChain ?? [];
  const threatName = report.methodology?.attackPaths?.[0]?.threatName;
  const currentStep: AttackPathStep | undefined =
    attackPathPlaybook[activeStep];

  return (
    <div className="relative h-svh w-full overflow-hidden">
    <div
      className="flex overflow-hidden"
      style={{ width: "100%", height: "calc(100svh - 2.5rem)" }}
    >
      {/* Left: Stages Panel */}
      <ReportStagesPanel
        killChain={killChain}
        activeStep={activeStep}
        onStepClick={setActiveStep}
        report={report}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main content — full width, scrollable */}
      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-5">
          {activeView === "playbook" ? (
            <>
              {/* Kill chain horizontal nav at top */}
              <KillChainNav
                killChain={killChain}
                activeStep={activeStep}
                onStepClick={setActiveStep}
                threatName={threatName}
              />

              {/* Step detail — full width */}
              {currentStep ? (
                <StepDetail step={currentStep} />
              ) : (
                <AsciiEmptyState
                  title="Select a kill chain step to see response actions"
                  sigil="▶"
                />
              )}
            </>
          ) : activeView === "executive" ? (
            <ExecutiveSummaryView report={report} />
          ) : activeView === "security" ? (
            <SecurityTeamView report={report} />
          ) : activeView === "crisis-comms" ? (
            <CrisisCommsView report={report} />
          ) : activeView === "cost" ? (
            <CostView report={report} />
          ) : null}
        </div>
      </div>
    </div>

    {/* Bottom bar */}
    <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center px-5 py-2 border-t border-border/15 bg-background/60 backdrop-blur-sm">
      <a href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80 shrink-0">
        <span className="font-mono text-sm font-bold text-primary tracking-tighter">DirePhish</span>
        <span className="text-[7px] font-mono uppercase tracking-wider text-primary/50 border border-primary/30 rounded px-1 py-px leading-none">Alpha</span>
        <span className="font-mono text-[8px] tracking-widest text-primary/35 hidden sm:inline">by raxIT Labs</span>
      </a>
      <span className="flex-1 mx-4 font-mono text-[10px] text-muted-foreground/20 select-none overflow-hidden whitespace-nowrap text-center" aria-hidden="true">
        {"─ · ".repeat(30)}
      </span>
      <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground/50 shrink-0">
        <span className="text-primary/50" aria-hidden="true">§</span>
        {report.companyName || "Exercise Report"}
      </span>
    </div>
    </div>
  );
}
