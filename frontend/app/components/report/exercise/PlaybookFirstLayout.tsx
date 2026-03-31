"use client";

import { useState } from "react";
import type { ExerciseReport, AttackPathStep } from "@/app/actions/report";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/app/components/ui/resizable";
import ReportStagesPanel from "./ReportStagesPanel";
import MiniGraph from "./MiniGraph";
import StepDetail from "./StepDetail";
import ExecutiveSummaryView from "./ExecutiveSummaryView";
import SecurityTeamView from "./SecurityTeamView";
import RiskScoreView from "./RiskScoreView";

function formatTactic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
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
  const killChain =
    report.methodology?.attackPaths?.[0]?.killChain ?? [];
  const currentStep: AttackPathStep | undefined =
    attackPathPlaybook[activeStep];

  // Panel header label
  const panelTitle =
    activeView === "playbook"
      ? `${currentStep ? formatTactic(currentStep.tactic) : "Step"} · ${currentStep?.technique_id ?? ""}`
      : activeView === "executive"
        ? "Executive Summary"
        : activeView === "security"
          ? "Security Team"
          : "Risk Score";

  return (
    <div
      className="flex overflow-hidden"
      style={{ width: "100%", height: "calc(100svh - 3rem)" }}
    >
      {/* Left: Stages Panel (fixed width, not resizable) */}
      <ReportStagesPanel
        killChain={killChain}
        activeStep={activeStep}
        onStepClick={setActiveStep}
        report={report}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main content area */}
      <div className="flex-1 min-w-0">
        {activeView === "playbook" ? (
          /* Playbook: graph + detail split */
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel defaultSize={55} minSize={30}>
              <div className="h-full overflow-y-auto p-4">
                <MiniGraph
                  projectId={projectId}
                  killChain={killChain}
                  activeStep={activeStep}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle className="w-0 bg-transparent after:w-3 hover:after:bg-border/30 after:transition-colors after:duration-200 after:rounded-full" />

            <ResizablePanel defaultSize={45} minSize={25}>
              <div className="flex flex-col h-[calc(100%-16px)] mt-2 mr-2 bg-card rounded-xl border border-border/20 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/10 shrink-0">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                    {panelTitle}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {currentStep ? (
                    <StepDetail step={currentStep} />
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <p className="text-sm">Select a kill chain step</p>
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          /* Other views: full-width content with proper spacing */
          <div className="h-full overflow-y-auto">
            <div className="max-w-5xl mx-auto p-6 space-y-6">
              {activeView === "executive" ? (
                <ExecutiveSummaryView report={report} />
              ) : activeView === "security" ? (
                <SecurityTeamView report={report} />
              ) : activeView === "risk-score" ? (
                <RiskScoreView report={report} projectId={projectId} />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
