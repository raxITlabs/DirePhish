"use client";

import { useState, useRef, useEffect } from "react";
import { AsciiEmptyState } from "@/app/components/ascii/DesignSystem";
import BottomBar from "@/app/components/layout/BottomBar";
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
  const contentRef = useRef<HTMLDivElement>(null);

  // Focus content area when view changes
  useEffect(() => {
    contentRef.current?.focus();
  }, [activeView]);

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
      <div ref={contentRef} tabIndex={-1} className="flex-1 min-w-0 h-full overflow-y-auto outline-none">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
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

    <BottomBar rightLabel={report.companyName || "Exercise Report"} />
    </div>
  );
}
