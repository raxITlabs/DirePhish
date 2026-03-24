"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDuration } from "@/app/lib/utils";
import type {
  CompanyDossier,
  GraphData,
  ThreatAnalysisResponse,
  SimulationStatus,
  AgentAction,
  SimulationConfig,
} from "@/app/types";
import { getExerciseReport, type ExerciseReport } from "@/app/actions/report";
import PipelineDossierPanel from "./PipelineDossierPanel";
import PipelineSimulationPanel from "./PipelineSimulationPanel";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  message: string;
  detail?: string;
  durationMs?: number;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-burnt-peach-100 text-burnt-peach-700",
  high: "bg-tuscan-sun-100 text-tuscan-sun-700",
  medium: "bg-sandy-brown-100 text-sandy-brown-700",
  low: "bg-verdigris-100 text-verdigris-700",
};

function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[severity?.toLowerCase()] || "bg-pitch-black-100 text-pitch-black-700";
}

const STAGE_LABELS: Record<string, string> = {
  research: "Company Research",
  dossier_review: "Dossier Review",
  threat_analysis: "Threat Analysis",
  scenario_selection: "Scenario Selection",
  config_expansion: "Config Generation",
  simulations: "Simulations",
  reports: "After-Action Reports",
  comparative: "Comparative Analysis",
  exercise_report: "Exercise Report",
};

interface PipelineDetailPanelProps {
  stageId: string;
  steps: Record<string, StepState>;
  dossier: CompanyDossier | null;
  onConfirmDossier: (editedDossier: CompanyDossier) => void;
  confirming: boolean;
  simStatus: SimulationStatus | null;
  simActions: AgentAction[];
  activeSimIndex: number;
  totalSims: number;
  threatData: ThreatAnalysisResponse | null;
  graphData: GraphData;
  configs: SimulationConfig[] | null;
  scenarioTitle?: string;
  onClose: () => void;
  projectId: string;
  allSimIds: string[];
  onSimChange?: (index: number) => void;
}

export default function PipelineDetailPanel({
  stageId,
  steps,
  dossier,
  onConfirmDossier,
  confirming,
  simStatus,
  simActions,
  activeSimIndex,
  totalSims,
  threatData,
  graphData,
  configs,
  scenarioTitle,
  onClose,
  projectId,
  allSimIds,
  onSimChange,
}: PipelineDetailPanelProps) {
  const state = steps[stageId];
  const status = state?.status || "pending";

  // Dossier review → delegate to full dossier editor
  if (stageId === "dossier_review" && dossier) {
    return (
      <div className="flex flex-col h-full bg-card">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/10 shrink-0">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Dossier Review</span>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors text-sm" aria-label="Close detail panel">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <PipelineDossierPanel dossier={dossier} onConfirm={onConfirmDossier} confirming={confirming} />
        </div>
      </div>
    );
  }

  // Simulation → delegate to simulation panel
  if (stageId === "simulations" && simStatus) {
    return (
      <div className="flex flex-col h-full bg-card">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/10 shrink-0">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Simulation</span>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors text-sm" aria-label="Close detail panel">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <PipelineSimulationPanel
            simStatus={simStatus}
            simActions={simActions}
            graphData={graphData}
            activeSimIndex={activeSimIndex}
            totalSims={totalSims}
            scenarioTitle={scenarioTitle}
            onSimChange={onSimChange}
          />
        </div>
      </div>
    );
  }

  // All other stages → generic detail view
  return (
    <div className="flex flex-col h-full bg-card animate-slide-in-right">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/10 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground">
            {STAGE_LABELS[stageId] || stageId}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
            aria-label="Close detail panel"
          >
            ✕
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
              status === "completed"
                ? "bg-verdigris-100 text-verdigris-700"
                : status === "running"
                  ? "bg-primary/10 text-primary"
                  : status === "failed"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
            }`}
          >
            {status}
          </span>
          {state?.durationMs && status === "completed" && (
            <span className="text-[10px] font-mono text-muted-foreground/50">
              {formatDuration(state.durationMs)}
            </span>
          )}
        </div>
      </div>

      {/* Body — stage-specific content */}
      <div key={stageId} className="flex-1 overflow-y-auto px-5 py-4 animate-slide-in-right">
        <StageDetail
          stageId={stageId}
          state={state}
          threatData={threatData}
          graphData={graphData}
          configs={configs}
          projectId={projectId}
          allSimIds={allSimIds}
        />
      </div>
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-tuscan-sun-100 text-tuscan-sun-800",
  medium: "bg-royal-azure-50 text-royal-azure-700",
};

function ExerciseReportSummary({ projectId, message }: { projectId: string; message?: string }) {
  const [report, setReport] = useState<ExerciseReport | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    getExerciseReport(projectId)
      .then((result) => {
        if ("data" in result) setReport(result.data);
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : "Failed to load exercise report");
      });
  }, [projectId]);

  const headline = report?.conclusions?.headline;
  const findings = report?.conclusions?.keyFindings;

  if (fetchError) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-mono text-destructive">{fetchError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-mono text-verdigris-700">{message || "Exercise report complete"}</p>

      {/* Report link */}
      <Link
        href={`/report/exercise/${projectId}`}
        className="flex items-center justify-between bg-royal-azure-50 rounded-md px-3 py-3 hover:bg-royal-azure-100 transition-colors"
      >
        <span className="text-xs font-mono font-medium text-royal-azure-700">View Full Report</span>
        <span className="text-[10px] font-mono text-royal-azure-600">→</span>
      </Link>

      {/* Headline */}
      {headline && (
        <p className="text-sm font-mono font-medium leading-relaxed">{headline}</p>
      )}

      {/* Key findings */}
      {findings && findings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Key Findings
          </h4>
          {findings.map((f, i) => (
            <div key={f.id || i} className="bg-muted/30 rounded-md px-3 py-2 space-y-1">
              <div className="flex items-start gap-2">
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${SEVERITY_COLORS[f.severity] || "bg-muted text-muted-foreground"}`}>
                  {f.severity}
                </span>
                <span className="text-xs font-mono leading-snug">{f.finding}</span>
              </div>
              {f.businessImpact && (
                <p className="text-[10px] font-mono text-muted-foreground/70 pl-[42px]">{f.businessImpact}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StageDetail({
  stageId,
  state,
  threatData,
  graphData,
  configs,
  projectId,
  allSimIds,
}: {
  stageId: string;
  state: StepState | undefined;
  threatData: ThreatAnalysisResponse | null;
  graphData: GraphData;
  configs: SimulationConfig[] | null;
  projectId: string;
  allSimIds: string[];
}) {
  // Research — entity summary
  if (stageId === "research") {
    const entityCount = graphData.nodes.length;
    const edgeCount = graphData.edges.length;
    const typeCounts = new Map<string, number>();
    for (const node of graphData.nodes) {
      const t = node.type || "other";
      typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    }
    const entries = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-royal-azure-50 rounded-lg px-3 py-2 text-center">
            <div className="text-xl font-bold font-mono text-royal-azure-700">{entityCount}</div>
            <div className="text-[10px] font-mono text-royal-azure-600 uppercase">Entities</div>
          </div>
          <div className="bg-verdigris-50 rounded-lg px-3 py-2 text-center">
            <div className="text-xl font-bold font-mono text-verdigris-700">{edgeCount}</div>
            <div className="text-[10px] font-mono text-verdigris-600 uppercase">Relationships</div>
          </div>
        </div>
        {entries.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">By Type</p>
            {entries.map(([type, count]) => (
              <div key={type} className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-1.5">
                <span className="text-xs font-mono text-foreground/80 capitalize">{type}</span>
                <span className="text-xs font-mono text-muted-foreground font-semibold">{count}</span>
              </div>
            ))}
          </div>
        )}
        {state?.message && (
          <p className="text-xs font-mono text-muted-foreground">{state.message}</p>
        )}
      </div>
    );
  }

  // Threat Analysis — scenarios + attack paths
  if (stageId === "threat_analysis" && threatData) {
    const scenarios = threatData.scenarios || [];
    const paths = threatData.attackPaths || [];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-burnt-peach-50 rounded-lg px-3 py-2 text-center">
            <div className="text-xl font-bold font-mono text-burnt-peach-700">{scenarios.length}</div>
            <div className="text-[10px] font-mono text-burnt-peach-600 uppercase">Scenarios</div>
          </div>
          <div className="bg-royal-azure-50 rounded-lg px-3 py-2 text-center">
            <div className="text-xl font-bold font-mono text-royal-azure-700">{paths.length}</div>
            <div className="text-[10px] font-mono text-royal-azure-600 uppercase">Attack Paths</div>
          </div>
        </div>
        {/* Attack Paths */}
        {paths.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Attack Paths</p>
            {paths.map((path, i) => (
              <div key={i} className="bg-muted/30 rounded-md px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-foreground/90">{path.title}</span>
                </div>
                {path.expectedOutcome && (
                  <p className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed">{path.expectedOutcome}</p>
                )}
                {path.killChain?.length > 0 && (
                  <div className="space-y-1 ml-2 border-l-2 border-border/20 pl-3">
                    {path.killChain.map((step, j) => (
                      <div key={j} className="text-[10px] font-mono">
                        <span className="text-foreground/70">{step.tactic || `Step ${step.step}`}</span>
                        {step.technique && <span className="text-muted-foreground/50 ml-1">[{step.technique}]</span>}
                        {step.description && <span className="text-muted-foreground/60 ml-1">— {step.description}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Scenarios */}
        {scenarios.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Identified Scenarios</p>
            {scenarios.map((s, i) => (
              <div key={i} className="bg-muted/30 rounded-md px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground/80 flex-1">{s.title || `Scenario ${i + 1}`}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${getSeverityStyle(s.severity)}`}>{s.severity}</span>
                </div>
                {s.summary && (
                  <p className="text-[10px] font-mono text-muted-foreground/70 mt-1 leading-relaxed">{s.summary}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Scenario Selection — selected scenarios with probabilities
  if (stageId === "scenario_selection" && threatData?.scenarios) {
    return (
      <div className="space-y-4">
        <div className="bg-tuscan-sun-50 rounded-lg px-3 py-2 text-center">
          <div className="text-xl font-bold font-mono text-tuscan-sun-700">{threatData.scenarios.length}</div>
          <div className="text-[10px] font-mono text-tuscan-sun-600 uppercase">Selected Scenarios</div>
        </div>
        <div className="space-y-3">
          {threatData.scenarios.map((s, i) => (
            <div key={i} className="bg-muted/30 rounded-md px-3 py-3 space-y-2">
              {/* Title + severity + probability */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-medium text-foreground/90 flex-1">
                  {s.title || `Scenario ${i + 1}`}
                </span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${getSeverityStyle(s.severity)}`}>{s.severity}</span>
                {s.probability != null && (
                  <span className="text-[10px] font-mono text-primary font-semibold">{Math.round(s.probability * 100)}%</span>
                )}
              </div>
              {/* Summary */}
              {s.summary && (
                <p className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed">{s.summary}</p>
              )}
              {/* Affected Teams */}
              {s.affectedTeams?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.affectedTeams.map((team, j) => (
                    <span key={j} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-royal-azure-50 text-royal-azure-600">{team}</span>
                  ))}
                </div>
              )}
              {/* Evidence */}
              {s.evidence?.length > 0 && (
                <details className="text-[10px] font-mono">
                  <summary className="text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
                    {s.evidence.length} evidence items
                  </summary>
                  <ul className="mt-1 space-y-0.5 ml-3 list-disc list-outside text-muted-foreground/70">
                    {s.evidence.map((e, j) => <li key={j}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Config Generation — with actual config data
  if (stageId === "config_expansion") {
    // Completed with configs
    if (state?.status === "completed" && configs && configs.length > 0) {
      return (
        <div className="space-y-4">
          <div className="bg-tuscan-sun-50 rounded-lg px-3 py-2 text-center">
            <div className="text-xl font-bold font-mono text-tuscan-sun-700">{configs.length}</div>
            <div className="text-[10px] font-mono text-tuscan-sun-600 uppercase">Configs Generated</div>
          </div>
          <div className="space-y-3">
            {configs.map((config, i) => (
              <div key={i} className="bg-muted/30 rounded-md px-3 py-3 space-y-2">
                <span className="text-xs font-mono font-medium text-foreground/90">
                  Scenario {i + 1}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-royal-azure-50 text-royal-azure-600">
                    {config.agents?.length || 0} agents
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-verdigris-50 text-verdigris-600">
                    {config.worlds?.length || 0} worlds
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-burnt-peach-50 text-burnt-peach-600">
                    {config.pressures?.length || 0} pressures
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sandy-brown-50 text-sandy-brown-600">
                    {config.scheduledEvents?.length || 0} events
                  </span>
                </div>
                {config.agents && config.agents.length > 0 && (
                  <div className="text-[10px] font-mono text-muted-foreground/70">
                    {config.agents.map(a => a.name || a.role).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }
    // Running — show rich threat analysis context while user waits
    if (state?.status === "running") {
      const scenarios = threatData?.scenarios || [];
      const paths = threatData?.attackPaths || [];

      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm font-mono text-muted-foreground">
              {state?.detail || "Building agent personas, pressures, and communication channels..."}
            </span>
          </div>

          {/* Threat Analysis Summary — what we found (since those stages passed quickly) */}
          {scenarios.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-border/10">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Why these scenarios
              </p>
              <p className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed">
                Based on the company&apos;s risk profile, we identified {scenarios.length} threat scenarios
                {paths.length > 0 && ` with ${paths.length} distinct attack paths`}.
                Each scenario is being expanded into a full simulation config with agents, pressures, and timed events.
              </p>

              {/* Rich scenario cards */}
              {scenarios.map((s, i) => (
                <div key={i} className="bg-muted/30 rounded-md px-3 py-3 space-y-2">
                  {/* Title + severity + probability */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-medium text-foreground/90 flex-1">
                      {s.title || `Scenario ${i + 1}`}
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${getSeverityStyle(s.severity)}`}>
                      {s.severity}
                    </span>
                    {s.probability != null && (
                      <span className="text-[10px] font-mono text-primary font-semibold">
                        {Math.round(s.probability * 100)}%
                      </span>
                    )}
                  </div>

                  {/* Summary */}
                  {s.summary && (
                    <p className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed">
                      {s.summary}
                    </p>
                  )}

                  {/* Affected Teams */}
                  {s.affectedTeams?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {s.affectedTeams.map((team, j) => (
                        <span key={j} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-royal-azure-50 text-royal-azure-600">
                          {team}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Evidence */}
                  {s.evidence?.length > 0 && (
                    <details className="text-[10px] font-mono">
                      <summary className="text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
                        {s.evidence.length} supporting evidence items
                      </summary>
                      <ul className="mt-1 space-y-0.5 ml-3 list-disc list-outside text-muted-foreground/70">
                        {s.evidence.map((e, j) => <li key={j}>{e}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              ))}

              {/* Attack Paths preview */}
              {paths.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/10">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    Attack paths being simulated
                  </p>
                  {paths.map((path, i) => (
                    <div key={i} className="bg-muted/20 rounded-md px-3 py-2 space-y-1.5">
                      <span className="text-[11px] font-mono font-medium text-foreground/80">
                        {path.title}
                      </span>
                      {path.killChain?.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-center">
                          {path.killChain.map((step, j) => (
                            <span key={j} className="text-[9px] font-mono">
                              {j > 0 && <span className="text-muted-foreground/40 mx-0.5">→</span>}
                              <span className="px-1 py-0.5 rounded bg-royal-azure-50/50 text-royal-azure-600">
                                {step.technique}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {state?.detail && <p className="text-xs font-mono text-foreground/80 leading-relaxed">{state.detail}</p>}
        <p className="text-xs font-mono text-muted-foreground">{state?.message || "Configuration generated"}</p>
      </div>
    );
  }

  // Simulations completed — show report links
  if (stageId === "simulations" && state?.status === "completed") {
    return (
      <div className="space-y-4">
        <p className="text-xs font-mono text-verdigris-700">{state.message || "All simulations complete"}</p>
        {allSimIds.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">View Reports</p>
            {allSimIds.map((simId, i) => (
              <Link
                key={simId}
                href={`/report/${simId}`}
                className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs font-mono text-foreground/80">Simulation {i + 1}</span>
                <span className="text-[10px] font-mono text-primary">View Report →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Reports completed — after-action report links
  if (stageId === "reports" && state?.status === "completed") {
    return (
      <div className="space-y-4">
        <p className="text-xs font-mono text-verdigris-700">{state.message || "Reports generated"}</p>
        {allSimIds.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">After-Action Reports</p>
            {allSimIds.map((simId, i) => (
              <Link
                key={simId}
                href={`/report/${simId}`}
                className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs font-mono text-foreground/80">Simulation {i + 1} Report</span>
                <span className="text-[10px] font-mono text-primary">View →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Comparative completed — comparative analysis link
  if (stageId === "comparative" && state?.status === "completed" && projectId) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-mono text-verdigris-700">{state.message || "Comparative analysis complete"}</p>
        <Link
          href={`/report/comparative/${projectId}`}
          className="flex items-center justify-between bg-royal-azure-50 rounded-md px-3 py-3 hover:bg-royal-azure-100 transition-colors"
        >
          <span className="text-xs font-mono font-medium text-royal-azure-700">Comparative Analysis</span>
          <span className="text-[10px] font-mono text-royal-azure-600">View Report →</span>
        </Link>
      </div>
    );
  }

  // Exercise report completed — summary + link
  if (stageId === "exercise_report" && state?.status === "completed" && projectId) {
    return <ExerciseReportSummary projectId={projectId} message={state.message} />;
  }

  // Generic fallback — running or completed
  if (state?.status === "running") {
    return (
      <div className="flex items-center gap-3 py-8">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
        <span className="text-sm font-mono text-muted-foreground">{state.message || "Processing..."}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state?.message && <p className="text-xs font-mono text-foreground/80">{state.message}</p>}
      {state?.detail && <p className="text-xs font-mono text-muted-foreground">{state.detail}</p>}
      {!state?.message && !state?.detail && (
        <p className="text-xs font-mono text-muted-foreground/50">No details available</p>
      )}
    </div>
  );
}
