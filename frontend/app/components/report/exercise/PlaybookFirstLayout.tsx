"use client";

import { useState } from "react";
import type { ExerciseReport, AttackPathStep } from "@/app/actions/report";
import ReportStagesPanel from "./ReportStagesPanel";
import KillChainNav from "./KillChainNav";
import StepDetail from "./StepDetail";
import ExecutiveSummaryView from "./ExecutiveSummaryView";
import SecurityTeamView from "./SecurityTeamView";
import RiskScoreView from "./RiskScoreView";

function formatTactic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ViewId = "playbook" | "executive" | "security" | "risk-score";

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
    <div
      className="flex overflow-hidden"
      style={{ width: "100%", height: "calc(100svh - 3rem)" }}
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
                <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Select a kill chain step to see response actions
                  </p>
                </div>
              )}
            </>
          ) : activeView === "executive" ? (
            <ExecutiveSummaryView report={report} />
          ) : activeView === "security" ? (
            <SecurityTeamView report={report} />
          ) : activeView === "risk-score" ? (
            <RiskScoreView report={report} projectId={projectId} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
