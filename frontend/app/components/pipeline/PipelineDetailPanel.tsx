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
import type { ResearchProgress } from "@/app/hooks/useResearchPolling";
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
  monte_carlo: "Stress Testing",
  counterfactual: "What-If Analysis",
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
  mcCfSimStatus?: SimulationStatus | null;
  mcCfSimActions?: AgentAction[];
  mcCfSimId?: string | null;
  researchProgress?: ResearchProgress;
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
  mcCfSimStatus,
  mcCfSimActions,
  researchProgress,
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
          mcCfSimActions={mcCfSimActions}
          mcCfSimStatus={mcCfSimStatus}
          researchProgress={researchProgress}
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

// ── Research live activity view ──────────────────────────────────────────

const RESEARCH_STEPS = [
  { threshold: 0,  label: "Starting research" },
  { threshold: 5,  label: "Scraping company website" },
  { threshold: 25, label: "Searching for intelligence" },
  { threshold: 45, label: "Processing documents" },
  { threshold: 55, label: "Synthesizing dossier" },
  { threshold: 85, label: "Indexing to knowledge graph" },
];

function ResearchActivityView({ progress }: { progress: ResearchProgress }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!progress.startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - progress.startedAt!) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [progress.startedAt]);

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  // Determine which step is active
  const activeStepIndex = RESEARCH_STEPS.reduce((acc, step, i) =>
    progress.progress >= step.threshold ? i : acc, 0);

  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Progress</span>
          <span className="text-[10px] font-mono text-verdigris-600 tabular-nums">{progress.progress}%</span>
        </div>
        <div className="h-1.5 bg-verdigris-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-verdigris-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      </div>

      {/* Elapsed time */}
      {progress.startedAt && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Elapsed</span>
          <span className="text-xs font-mono text-foreground/70 tabular-nums">{minutes}:{seconds}</span>
        </div>
      )}

      {/* Research steps timeline */}
      <div className="space-y-0">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Activity</p>
        <div className="relative">
          {RESEARCH_STEPS.map((step, i) => {
            const isCompleted = i < activeStepIndex;
            const isActive = i === activeStepIndex;
            const isPending = i > activeStepIndex;

            return (
              <div key={step.threshold} className="flex items-start gap-3 relative">
                {/* Vertical connector line */}
                {i < RESEARCH_STEPS.length - 1 && (
                  <div
                    className={`absolute left-[7px] top-[18px] w-[2px] h-[calc(100%-2px)] ${
                      isCompleted ? "bg-verdigris-300" : "bg-border/30"
                    }`}
                  />
                )}
                {/* Dot / Check */}
                <div className="relative z-10 shrink-0 mt-0.5">
                  {isCompleted ? (
                    <div className="w-4 h-4 rounded-full bg-verdigris-500 flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  ) : isActive ? (
                    <div className="w-4 h-4 rounded-full bg-verdigris-500 animate-pulse-dot" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-border/30" />
                  )}
                </div>
                {/* Label */}
                <div className="pb-4 min-w-0">
                  <span
                    className={`text-xs font-mono leading-tight ${
                      isCompleted
                        ? "text-verdigris-700"
                        : isActive
                          ? "text-foreground font-medium"
                          : "text-muted-foreground/40"
                    }`}
                  >
                    {step.label}
                  </span>
                  {isActive && progress.progressMessage && (
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">
                      {progress.progressMessage}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Placeholder counters */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-royal-azure-50/50 rounded-lg px-3 py-2 text-center">
          <div className="text-xl font-bold font-mono text-royal-azure-300">--</div>
          <div className="text-[10px] font-mono text-royal-azure-400 uppercase">Entities</div>
        </div>
        <div className="bg-verdigris-50/50 rounded-lg px-3 py-2 text-center">
          <div className="text-xl font-bold font-mono text-verdigris-300">--</div>
          <div className="text-[10px] font-mono text-verdigris-400 uppercase">Relationships</div>
        </div>
      </div>
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
  mcCfSimActions,
  mcCfSimStatus,
  researchProgress,
}: {
  stageId: string;
  state: StepState | undefined;
  threatData: ThreatAnalysisResponse | null;
  graphData: GraphData;
  configs: SimulationConfig[] | null;
  projectId: string;
  allSimIds: string[];
  mcCfSimActions?: AgentAction[];
  mcCfSimStatus?: SimulationStatus | null;
  researchProgress?: ResearchProgress;
}) {
  // Research — live activity or entity summary
  if (stageId === "research") {
    const isRunning = state?.status === "running";

    // Running state — show live progress timeline
    if (isRunning && researchProgress) {
      return <ResearchActivityView progress={researchProgress} />;
    }

    // Completed state — show entity summary
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

  // Monte Carlo Analysis
  if (stageId === "monte_carlo") {
    let parsed: { iterations?: number; completed?: number; totalCost?: number; scenarioTitle?: string; variation_description?: string } | null = null;
    if (state?.detail) {
      try { parsed = JSON.parse(state.detail); } catch { /* detail is plain text */ }
    }

    if (state?.status === "running") {
      if (mcCfSimStatus && mcCfSimActions) {
        const title = parsed?.scenarioTitle
          ? `Stress Test: ${parsed.scenarioTitle}`
          : "Stress Test Variation";

        const variationDesc = parsed?.variation_description;
        const mcChanges: string[] = [];
        if (variationDesc) {
          if (variationDesc.includes("temp=")) {
            const tempMatch = variationDesc.match(/temp=([\d.]+)/);
            if (tempMatch) {
              const temp = parseFloat(tempMatch[1]);
              mcChanges.push(temp > 0.7 ? "Team under higher stress" : temp < 0.6 ? "Team more cautious" : "Normal stress levels");
            }
          }
          if (variationDesc.includes("timing_shifts")) mcChanges.push("Attack timing shifted");
          if (variationDesc.includes("order=")) mcChanges.push("Team response order shuffled");
          if (variationDesc.includes("persona_mods")) mcChanges.push("Team response patterns varied");
        }

        return (
          <PipelineSimulationPanel
            simStatus={mcCfSimStatus}
            simActions={mcCfSimActions}
            graphData={graphData}
            activeSimIndex={0}
            totalSims={1}
            scenarioTitle={title}
            contextHeader={{
              title: `Stress Test: ${parsed?.scenarioTitle || "scenario"}`,
              subtitle: `Variation ${(parsed?.completed || 0) + 1}/${parsed?.iterations || 1}`,
              changes: mcChanges.length > 0 ? mcChanges : ["Testing with controlled variations"],
            }}
          />
        );
      }

      const completed = parsed?.completed || 0;
      const total = parsed?.iterations || 1;
      const pct = Math.round((completed / total) * 100);

      return (
        <div className="space-y-3" aria-live="polite">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-tuscan-sun-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm font-mono text-foreground/80">
              Iteration {completed}/{total}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-tuscan-sun-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {!parsed && state.detail && (
            <p className="text-xs font-mono text-muted-foreground">{state.detail}</p>
          )}
        </div>
      );
    }

    if (state?.status === "completed") {
      return (
        <div className="space-y-4">
          <p className="text-xs font-mono text-verdigris-700">{state.message || "Monte Carlo analysis complete"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-tuscan-sun-50 rounded-lg px-3 py-2 text-center">
              <div className="text-xl font-bold font-mono text-tuscan-sun-700">{parsed?.iterations || "?"}</div>
              <div className="text-[10px] font-mono text-tuscan-sun-600 uppercase">Iterations</div>
            </div>
            {state.durationMs && (
              <div className="bg-royal-azure-50 rounded-lg px-3 py-2 text-center">
                <div className="text-sm font-bold font-mono text-royal-azure-700 truncate">{formatDuration(state.durationMs)}</div>
                <div className="text-[10px] font-mono text-royal-azure-600 uppercase">Duration</div>
              </div>
            )}
          </div>
          {parsed?.totalCost != null && (
            <div className="bg-muted/30 rounded-md px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">Total Cost</span>
              <span className="text-xs font-mono font-semibold text-foreground/80">${parsed.totalCost.toFixed(2)}</span>
            </div>
          )}
        </div>
      );
    }

    if (state?.status === "failed") {
      return (
        <div className="space-y-3">
          <p className="text-xs font-mono text-destructive">{state.message || "Monte Carlo analysis failed"}</p>
          {state.detail && <p className="text-xs font-mono text-muted-foreground">{state.detail}</p>}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {state?.message && <p className="text-xs font-mono text-foreground/80">{state.message}</p>}
        {state?.detail && <p className="text-xs font-mono text-muted-foreground">{state.detail}</p>}
        {!state?.message && !state?.detail && (
          <p className="text-xs font-mono text-muted-foreground/50">Monte Carlo will run the simulation multiple times with controlled variations to produce probabilistic outcomes.</p>
        )}
      </div>
    );
  }

  // Counterfactual Analysis
  if (stageId === "counterfactual") {
    let parsed: { decisions?: number; branches?: number; forkAgent?: string; forkRound?: number } | null = null;
    if (state?.detail) {
      try { parsed = JSON.parse(state.detail); } catch { /* detail is plain text */ }
    }

    // Parse "Analyzed X decisions, Y branches complete" from message
    const msgMatch = state?.message?.match(/Analyzed (\d+) decisions?, (\d+) branches?/);
    const decisionsCount = parsed?.decisions ?? (msgMatch ? parseInt(msgMatch[1], 10) : null);
    const branchesCount = parsed?.branches ?? (msgMatch ? parseInt(msgMatch[2], 10) : null);

    const forkAgent = parsed?.forkAgent;
    const forkRound = parsed?.forkRound;

    if (state?.status === "running") {
      if (mcCfSimStatus && mcCfSimActions) {
        const title = parsed?.forkAgent && parsed?.forkRound
          ? `What If: Round ${parsed.forkRound} — ${parsed.forkAgent}'s decision`
          : "Alternate Timeline";
        return (
          <PipelineSimulationPanel
            simStatus={mcCfSimStatus}
            simActions={mcCfSimActions}
            graphData={graphData}
            activeSimIndex={0}
            totalSims={1}
            scenarioTitle={title}
            contextHeader={{
              title: `What If: Round ${parsed?.forkRound || "?"}`,
              subtitle: `${parsed?.forkAgent || "Agent"}'s decision`,
              changes: ["Testing alternate outcome from this decision point"],
            }}
          />
        );
      }

      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm font-mono text-muted-foreground">
              {forkAgent && forkRound
                ? `Forking round ${forkRound} \u2014 ${forkAgent}\u2019s decision...`
                : state.message || "Analyzing critical decisions..."}
            </span>
          </div>
          {parsed?.decisions != null && (
            <div className="bg-muted/30 rounded-md px-3 py-2">
              <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">Critical Decisions</span>
              <p className="text-xs font-mono text-foreground/80 mt-0.5">{parsed.decisions} identified</p>
            </div>
          )}
          {state.detail && !parsed && (
            <p className="text-xs font-mono text-muted-foreground">{state.detail}</p>
          )}
        </div>
      );
    }

    if (state?.status === "completed") {
      return (
        <div className="space-y-4">
          <p className="text-xs font-mono text-verdigris-700">{state.message || "Counterfactual analysis complete"}</p>
          <div className="grid grid-cols-2 gap-3">
            {decisionsCount != null && (
              <div className="bg-burnt-peach-50 rounded-lg px-3 py-2 text-center">
                <div className="text-xl font-bold font-mono text-burnt-peach-700">{decisionsCount}</div>
                <div className="text-[10px] font-mono text-burnt-peach-600 uppercase">Decision Points</div>
              </div>
            )}
            {branchesCount != null && (
              <div className="bg-verdigris-50 rounded-lg px-3 py-2 text-center">
                <div className="text-xl font-bold font-mono text-verdigris-700">{branchesCount}</div>
                <div className="text-[10px] font-mono text-verdigris-600 uppercase">Branches Forked</div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (state?.status === "failed") {
      return (
        <div className="space-y-3">
          <p className="text-xs font-mono text-destructive">{state.message || "Counterfactual analysis failed"}</p>
          {state.detail && <p className="text-xs font-mono text-muted-foreground">{state.detail}</p>}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {state?.message && <p className="text-xs font-mono text-foreground/80">{state.message}</p>}
        {state?.detail && <p className="text-xs font-mono text-muted-foreground">{state.detail}</p>}
        {!state?.message && !state?.detail && (
          <p className="text-xs font-mono text-muted-foreground/50">Counterfactual analysis will identify critical decisions and test alternate outcomes.</p>
        )}
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

  // Pending stage descriptions
  const pendingDescriptions: Record<string, string> = {
    research: "Company research will gather public intelligence on the target organization.",
    dossier_review: "The company dossier will be presented for your review before proceeding.",
    threat_analysis: "Threat analysis will map vulnerabilities and identify attack scenarios.",
    scenario_selection: "The most impactful scenarios will be selected for simulation.",
    config_expansion: "Simulation configs will be generated with agents, pressures, and timed events.",
    simulations: "Multi-agent simulations will model how the organization responds under pressure.",
    monte_carlo: "Monte Carlo will run the simulation multiple times with controlled variations to produce probabilistic outcomes.",
    counterfactual: "Counterfactual analysis will identify critical decisions and test alternate outcomes.",
    exercise_report: "A comprehensive exercise report will be generated combining all simulation data.",
    reports: "After-action reports will summarize the key findings from each simulation.",
    comparative: "A comparative analysis will highlight differences across simulation runs.",
  };

  return (
    <div className="space-y-3">
      {state?.message && <p className="text-xs font-mono text-foreground/80">{state.message}</p>}
      {state?.detail && <p className="text-xs font-mono text-muted-foreground">{state.detail}</p>}
      {!state?.message && !state?.detail && (
        <p className="text-xs font-mono text-muted-foreground/50">
          {pendingDescriptions[stageId] || "This stage has not started yet."}
        </p>
      )}
    </div>
  );
}
