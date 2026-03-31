"use client";

import { useState } from "react";
import type { ExerciseReport, AttackPathStep } from "@/app/actions/report";
import KillChainNav from "./KillChainNav";
import StepDetail from "./StepDetail";
import BoardView from "./BoardView";
import CISOView from "./CISOView";
import SecurityTeamView from "./SecurityTeamView";
import RiskScoreView from "./RiskScoreView";

type SidebarView = "playbook" | "board" | "ciso" | "security" | "risk-score";

const SIDEBAR_VIEWS: { id: SidebarView; label: string }[] = [
  { id: "playbook", label: "Attack Path Playbook" },
  { id: "board", label: "Board Summary" },
  { id: "ciso", label: "CISO Analysis" },
  { id: "security", label: "Security Team" },
  { id: "risk-score", label: "Risk Score" },
];

interface PlaybookFirstLayoutProps {
  report: ExerciseReport;
  projectId: string;
}

export default function PlaybookFirstLayout({
  report,
  projectId,
}: PlaybookFirstLayoutProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [sidebarView, setSidebarView] = useState<SidebarView>("playbook");

  const attackPathPlaybook = report.attackPathPlaybook ?? [];
  const killChain =
    report.methodology?.attackPaths?.[0]?.killChain ?? [];
  const threatName =
    report.methodology?.attackPaths?.[0]?.threatName;
  const currentStep: AttackPathStep | undefined =
    attackPathPlaybook[activeStep];

  // MC summary stats for sidebar
  const mc = report.monteCarloStats;
  const resilience = report.resilience;
  return (
    <div className="flex min-h-[calc(100vh-80px)]">
      {/* ── Left Sidebar ── */}
      <aside className="w-60 shrink-0 bg-pitch-black-50 border-r border-pitch-black-200 p-4 overflow-y-auto space-y-6">
        {/* Exercise Metadata */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-pitch-black-400 mb-1">
            Exercise
          </p>
          <p className="text-sm font-semibold text-pitch-black-800">
            {report.companyName ?? "Exercise Report"}
          </p>
          <p className="text-xs text-pitch-black-400 mt-0.5">
            {report.generatedAt
              ? new Date(report.generatedAt).toLocaleDateString()
              : ""}
          </p>
        </div>

        {/* Readiness Score */}
        {resilience && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-pitch-black-400 mb-2">
              Readiness Score
            </p>
            <div className="flex items-center justify-center">
              <div className="relative w-20 h-20">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-pitch-black-200"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-tuscan-sun-500"
                    strokeDasharray={`${(resilience.overall / 100) * 264} 264`}
                    strokeDashoffset="-66"
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-tuscan-sun-600">
                  {resilience.overall}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-pitch-black-400 text-center mt-1">
              / 100
            </p>
          </div>
        )}

        {/* MC Stats */}
        {mc && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-pitch-black-400 mb-2">
              Monte Carlo
            </p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-pitch-black-400">Iterations</span>
                <span className="font-semibold text-pitch-black-700">
                  {mc.iteration_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-pitch-black-400">Contained</span>
                <span className="font-semibold text-verdigris-600">
                  {mc.iteration_count > 0
                    ? Math.round(
                        ((mc.outcome_distribution.contained_early +
                          mc.outcome_distribution.contained_late) /
                          mc.iteration_count) *
                          100,
                      )
                    : 0}
                  %
                </span>
              </div>
              {mc.containment_round_stats && (
                <div className="flex justify-between">
                  <span className="text-pitch-black-400">Avg Rounds</span>
                  <span className="font-semibold text-pitch-black-700">
                    {mc.containment_round_stats.mean.toFixed(1)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-pitch-black-400">Escalated</span>
                <span className="font-semibold text-pitch-black-700">
                  {mc.outcome_distribution.escalated ?? 0}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* View Switcher */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-pitch-black-400 mb-2">
            Views
          </p>
          <div className="space-y-0.5">
            {SIDEBAR_VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setSidebarView(v.id)}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                  sidebarView === v.id
                    ? "bg-royal-azure-50 text-royal-azure-700 font-medium"
                    : "text-pitch-black-500 hover:bg-pitch-black-100 hover:text-pitch-black-700"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto">
        {sidebarView === "playbook" ? (
          <div className="space-y-6 p-6">
            {/* Kill Chain Navigation */}
            <KillChainNav
              killChain={killChain}
              activeStep={activeStep}
              onStepClick={setActiveStep}
              threatName={threatName}
            />

            {/* Step Detail */}
            {currentStep ? (
              <StepDetail step={currentStep} />
            ) : (
              <div className="text-center py-12 text-pitch-black-400">
                <p>Select a kill chain step to see response actions</p>
              </div>
            )}
          </div>
        ) : sidebarView === "board" ? (
          <div className="p-6">
            <BoardView report={report} />
          </div>
        ) : sidebarView === "ciso" ? (
          <div className="p-6">
            <CISOView report={report} />
          </div>
        ) : sidebarView === "security" ? (
          <div className="p-6">
            <SecurityTeamView report={report} />
          </div>
        ) : sidebarView === "risk-score" ? (
          <div className="p-6">
            <RiskScoreView report={report} projectId={projectId} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
