"use client";

import { useState } from "react";
import type { ExerciseReport, AttackPathStep } from "@/app/actions/report";
import KillChainNav from "./KillChainNav";
import StepDetail from "./StepDetail";

interface AttackPathPlaybookViewProps {
  report: ExerciseReport;
}

export default function AttackPathPlaybookView({
  report,
}: AttackPathPlaybookViewProps) {
  const [activeStep, setActiveStep] = useState(0);

  const attackPathPlaybook = report.attackPathPlaybook ?? [];
  const killChain = report.methodology?.attackPaths?.[0]?.killChain ?? [];
  const threatName = report.methodology?.attackPaths?.[0]?.threatName;
  const currentStep: AttackPathStep | undefined =
    attackPathPlaybook[activeStep];

  if (attackPathPlaybook.length === 0) {
    return (
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-6 text-center">
        <p className="text-sm text-pitch-black-500">
          Attack path playbook not available. Run the full pipeline with Monte
          Carlo analysis to generate per-step response actions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
  );
}
