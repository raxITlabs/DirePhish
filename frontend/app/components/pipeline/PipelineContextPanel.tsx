"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import SimulationLivePanel from "./SimulationLivePanel";
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner";
import { AsciiSectionHeader, AsciiStatus } from "@/app/components/ascii/DesignSystem";
import type { CompanyDossier, SimulationStatus, AgentAction, GraphData } from "@/app/types";

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

interface PipelineContextPanelProps {
  steps: Record<string, StepState>;
  stepOrder: StepDef[];
  dossier: CompanyDossier | null;
  hookData: { hookToken: string; projectId: string } | null;
  confirming: boolean;
  onConfirmDossier: () => void;
  projectId: string;
  companyUrl?: string;
  simStatus: SimulationStatus | null;
  simActions: AgentAction[];
  graphData: GraphData;
  activeSimIndex: number;
  totalSims: number;
  simError: string | null;
  pipelineComplete: boolean;
}

function getActiveStepId(steps: Record<string, StepState>, stepOrder: StepDef[]): string | null {
  const running = stepOrder.find((s) => steps[s.id]?.status === "running");
  if (running) return running.id;
  let lastCompleted: string | null = null;
  for (const s of stepOrder) {
    if (steps[s.id]?.status === "completed") lastCompleted = s.id;
  }
  return lastCompleted;
}

function parseScenarios(detail: string): { title: string; probability: number }[] {
  const results: { title: string; probability: number }[] = [];
  const regex = /(.+?)\s*\((\d+)%\)/g;
  let match;
  while ((match = regex.exec(detail)) !== null) {
    results.push({ title: match[1].trim(), probability: parseInt(match[2], 10) });
  }
  return results;
}

export default function PipelineContextPanel({
  steps,
  stepOrder,
  dossier,
  hookData,
  confirming,
  onConfirmDossier,
  projectId,
  companyUrl,
  simStatus,
  simActions,
  graphData,
  activeSimIndex,
  totalSims,
  simError,
  pipelineComplete,
}: PipelineContextPanelProps) {
  const router = useRouter();
  const activeStepId = getActiveStepId(steps, stepOrder);

  // Pipeline complete
  if (pipelineComplete) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-green-600 text-xl">&#10003;</span>
          </div>
          <h2 className="text-lg font-semibold mb-2">Pipeline Complete</h2>
          <p className="text-sm text-muted-foreground mb-4">
            All simulations and reports have been generated.
          </p>
          {projectId && (
            <Button onClick={() => router.push(`/report/comparative/${projectId}`)}>
              View Comparative Report
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Step 6: Simulations
  if (activeStepId === "simulations" && totalSims > 0) {
    return (
      <SimulationLivePanel
        simStatus={simStatus}
        simActions={simActions}
        graphData={graphData}
        activeSimIndex={activeSimIndex}
        totalSims={totalSims}
        error={simError}
      />
    );
  }

  // Step 2: Dossier Review
  if (activeStepId === "dossier_review" && hookData) {
    return (
      <div className="h-full flex flex-col p-4 gap-3">
        {dossier && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Dossier Summary
            </div>
            <div className="text-xs space-y-2 text-muted-foreground">
              <p><strong className="text-foreground">Company:</strong> {dossier.company?.name}</p>
              <p><strong className="text-foreground">Industry:</strong> {dossier.company?.industry}</p>
              <p><strong className="text-foreground">Size:</strong> {dossier.company?.size} ({dossier.company?.employeeCount} employees)</p>
              <p><strong className="text-foreground">Systems:</strong> {dossier.systems?.length || 0} tracked</p>
              <p><strong className="text-foreground">Risks:</strong> {dossier.risks?.length || 0} identified</p>
              <p><strong className="text-foreground">Compliance:</strong> {dossier.compliance?.join(", ")}</p>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="text-sm text-primary font-medium mb-1">Awaiting your review</div>
          <p className="text-xs text-muted-foreground">
            Review the dossier and confirm to continue the pipeline.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <Button onClick={onConfirmDossier} disabled={confirming} className="flex-1">
            {confirming ? <><AsciiSpinner /> Confirming</> : "Confirm & Continue"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push(`/research/${projectId}`)}
          >
            Edit Dossier
          </Button>
        </div>
      </div>
    );
  }

  // Steps 3-4: Scenarios
  if (
    activeStepId === "scenario_selection" ||
    activeStepId === "threat_analysis" ||
    (activeStepId === "config_expansion" && steps["scenario_selection"]?.status === "completed")
  ) {
    const scenarioDetail = steps["scenario_selection"]?.detail;
    const scenarios = scenarioDetail ? parseScenarios(scenarioDetail) : [];

    if (activeStepId === "threat_analysis" && steps["threat_analysis"]?.status === "running") {
      return (
        <div className="h-full flex flex-col p-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Threat Analysis
            </div>
            <div className="flex items-center gap-2">
              <AsciiSpinner className="text-primary" />
              <span className="text-sm">{steps["threat_analysis"]?.message || "Analyzing threats..."}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col p-4 gap-3">
        {scenarios.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Selected Scenarios
            </div>
            <div className="space-y-3">
              {scenarios.map((s, i) => (
                <div key={i} className="p-3 bg-muted/50 rounded-md border-l-2 border-l-primary">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="text-xs font-semibold text-primary">{s.probability}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeStepId === "config_expansion" && steps["config_expansion"]?.status === "running" && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <AsciiSpinner className="text-primary" />
              <span className="text-sm">{steps["config_expansion"]?.message || "Generating configs..."}</span>
            </div>
          </div>
        )}
        {activeStepId === "config_expansion" && steps["config_expansion"]?.status === "completed" && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm text-green-600">{steps["config_expansion"]?.detail || "Configs ready"}</div>
          </div>
        )}
      </div>
    );
  }

  // Steps 7-8: Reports
  if (activeStepId === "reports" || activeStepId === "comparative") {
    return (
      <div className="h-full flex flex-col p-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {activeStepId === "reports" ? "After-Action Reports" : "Comparative Analysis"}
          </div>
          <div className="flex items-center gap-2">
            {steps[activeStepId]?.status === "running" ? (
              <>
                <AsciiSpinner className="text-primary" />
                <span className="text-sm">{steps[activeStepId]?.message}</span>
              </>
            ) : (
              <span className="text-sm text-green-600">{steps[activeStepId]?.message}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Research (default)
  return (
    <div className="h-full flex flex-col p-4 gap-3">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {steps["research"]?.status === "running" ? "Researching" : "Company Research"}
        </div>
        {companyUrl ? (
          <p className="text-sm font-medium mb-1">{companyUrl}</p>
        ) : null}
        {steps["research"]?.status === "running" && (
          <div className="flex items-center gap-2 mt-2">
            <AsciiSpinner className="text-primary" />
            <span className="text-sm text-muted-foreground">{steps["research"]?.message}</span>
          </div>
        )}
        {steps["research"]?.status === "completed" && (
          <div className="text-sm text-green-600 mt-2">{steps["research"]?.message}</div>
        )}
      </div>
    </div>
  );
}
