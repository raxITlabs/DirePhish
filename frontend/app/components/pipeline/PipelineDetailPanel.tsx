"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDuration } from "@/app/lib/utils";
import { AsciiSectionHeader, AsciiStatus, AsciiMetric, AsciiProgressBar, AsciiMetricCard, AsciiDivider } from "@/app/components/ascii/DesignSystem";
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner";
import type {
  CompanyDossier,
  GraphData,
  ThreatAnalysisResponse,
  SimulationStatus,
  AgentAction,
  SimulationConfig,
} from "@/app/types";
import type { ResearchProgress } from "@/app/hooks/useResearchPolling";
import { useSimulationPolling } from "@/app/hooks/useSimulationPolling";
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
  mcSimStatus?: SimulationStatus | null;
  mcSimActions?: AgentAction[];
  cfSimStatus?: SimulationStatus | null;
  cfSimActions?: AgentAction[];
  researchProgress?: ResearchProgress;
  mcLiveProgress?: { completed: number; total: number } | null;
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
  mcSimStatus,
  mcSimActions,
  cfSimStatus,
  cfSimActions,
  researchProgress,
  mcLiveProgress,
}: PipelineDetailPanelProps) {
  const state = steps[stageId];
  const status = state?.status || "pending";

  // Dossier review → delegate to full dossier editor
  if (stageId === "dossier_review" && dossier) {
    return (
      <div className="flex flex-col h-[calc(100%-16px)] mt-2 mr-2 bg-card rounded-xl border border-border/20 shadow-sm overflow-hidden">
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
      <div className="flex flex-col h-[calc(100%-16px)] mt-2 mr-2 bg-card rounded-xl border border-border/20 shadow-sm overflow-hidden">
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
    <div className="flex flex-col h-[calc(100%-16px)] mt-2 mr-2 bg-card rounded-xl border border-border/20 shadow-sm overflow-hidden animate-slide-in-right">
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
          mcSimActions={mcSimActions}
          mcSimStatus={mcSimStatus}
          cfSimActions={cfSimActions}
          cfSimStatus={cfSimStatus}
          researchProgress={researchProgress}
          mcLiveProgress={mcLiveProgress}
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

function MCIterationList({ batchId, live, selectedIterationId, onSelectIteration }: {
  batchId: string;
  live?: boolean;
  selectedIterationId?: string | null;
  onSelectIteration?: (iterationId: string) => void;
}) {
  const [iterations, setIterations] = useState<Array<{
    iteration_id: string; variation_description: string;
    total_rounds: number; total_actions: number; cost_usd: number;
    seed?: number; outcome?: string; stopped_at_round?: number;
  }>>([]);

  useEffect(() => {
    const fetchIterations = () => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001"}/api/crucible/monte-carlo/${batchId}/iterations`)
        .then(r => r.json())
        .then(d => { if (d.data) setIterations(d.data); })
        .catch(() => {});
    };
    fetchIterations();
    if (live) {
      const interval = setInterval(fetchIterations, 5000);
      return () => clearInterval(interval);
    }
  }, [batchId, live]);

  if (!iterations.length) return null;

  function parseVariation(desc: string): Array<{ label: string; detail: string; color: string }> {
    const items: Array<{ label: string; detail: string; color: string }> = [];

    const tempMatch = desc.match(/temp=([\d.]+)/);
    if (tempMatch) {
      const temp = parseFloat(tempMatch[1]);
      const color = temp > 0.8 ? "bg-tuscan-sun-100 text-tuscan-sun-700" : temp > 0.65 ? "bg-tuscan-sun-50 text-tuscan-sun-600" : "bg-verdigris-50 text-verdigris-700";
      const label = temp > 0.8 ? "High pressure" : temp > 0.65 ? "Moderate pressure" : "Cautious";
      items.push({ label, detail: `temp ${temp.toFixed(2)}`, color });
    }

    const personaMatch = desc.match(/persona_mods=\[([^\]]+)\]/);
    if (personaMatch) {
      const agents = personaMatch[1].split(", ").map(a => a.split(" ").pop() || a);
      items.push({
        label: "Modified priorities",
        detail: agents.length > 2 ? `${agents.slice(0, 2).join(", ")} +${agents.length - 2}` : agents.join(", "),
        color: "bg-royal-azure-50 text-royal-azure-700",
      });
    }

    const timingMatch = desc.match(/timing_shifts=\[([^\]]+)\]/);
    if (timingMatch) {
      const shiftMatch = timingMatch[1].match(/'event_round':\s*(\d+).*?'shifted_to':\s*(\d+)/);
      if (shiftMatch) {
        items.push({ label: "Timing shift", detail: `inject R${shiftMatch[1]} → R${shiftMatch[2]}`, color: "bg-muted text-foreground/70" });
      } else {
        items.push({ label: "Timing shift", detail: "events rescheduled", color: "bg-muted text-foreground/70" });
      }
    }

    const orderMatch = desc.match(/order=\[([^\]]+)\]/);
    if (orderMatch) {
      const first = orderMatch[1].split(", ")[0]?.split(" ").pop() || "";
      const hasAttackerFirst = orderMatch[1].toLowerCase().includes("threat") || orderMatch[1].toLowerCase().includes("attack") || orderMatch[1].toLowerCase().includes("operator");
      items.push({
        label: hasAttackerFirst ? "Attacker first" : "Reordered",
        detail: `leads: ${first}`,
        color: hasAttackerFirst ? "bg-tuscan-sun-100 text-tuscan-sun-700" : "bg-muted text-foreground/70",
      });
    }

    return items.length > 0 ? items : [{ label: "Baseline", detail: "no modifications", color: "bg-muted text-muted-foreground" }];
  }

  function outcomeLabel(outcome?: string): { text: string; color: string } | null {
    if (!outcome) return null;
    if (outcome.includes("contained") || outcome.includes("resolved")) return { text: "Contained", color: "text-verdigris-700" };
    if (outcome.includes("critical") || outcome.includes("failure") || outcome.includes("catastrophic") || outcome.includes("escalat")) return { text: "Escalated", color: "text-tuscan-sun-700" };
    if (outcome.includes("max_round") || outcome.includes("limit") || outcome.includes("stagnant")) return { text: "Stagnant", color: "text-muted-foreground" };
    return { text: outcome.split("_").join(" "), color: "text-muted-foreground" };
  }

  return (
    <div className="space-y-2">
      <span className="text-2xs font-mono text-muted-foreground/60 uppercase tracking-wider">
        Completed Variations ({iterations.length})
      </span>
      {iterations.map((iter, idx) => {
        const changes = parseVariation(iter.variation_description || "");
        const outcome = outcomeLabel(iter.outcome);
        return (
          <div
            key={iter.iteration_id}
            className={`border rounded-lg px-3 py-2.5 space-y-2 transition-colors ${
              onSelectIteration ? "cursor-pointer hover:bg-muted/40" : ""
            } ${selectedIterationId === iter.iteration_id ? "border-royal-azure-400 bg-royal-azure-50/30" : "border-border/40"}`}
            onClick={() => onSelectIteration?.(iter.iteration_id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-foreground/80">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selectedIterationId === iter.iteration_id ? "bg-royal-azure-500" : "bg-verdigris-500"}`} />
                <span className="font-medium">Variation {idx + 1}</span>
                {outcome && <span className={`text-2xs ${outcome.color}`}>{outcome.text}</span>}
              </div>
              <div className="flex items-center gap-2 text-2xs font-mono text-muted-foreground">
                <span>{iter.stopped_at_round || iter.total_rounds}R</span>
                <span className="text-muted-foreground/40">·</span>
                <span>{iter.total_actions} actions</span>
                {iter.cost_usd > 0 && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span>${iter.cost_usd.toFixed(2)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {changes.map((c, i) => (
                <span key={i} className={`text-2xs font-mono px-2 py-1 rounded-md ${c.color}`} title={c.detail}>
                  {c.label}
                  <span className="opacity-50 mx-1">·</span>
                  <span className="opacity-70">{c.detail}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  { threshold: 5,  label: "Crawling company website" },
  {
    threshold: 25,
    label: "Grounded web search",
    substeps: [
      "Security intel — breaches, certifications, CISO, bug bounty",
      "Tech & org — stack, infrastructure, executives, headcount",
      "Industry context — regulations, geopolitical risks, threat landscape",
      "Recent news — acquisitions, lawsuits, incidents, AI adoption",
      "Emerging tech — AI strategy, model security, IoT, shadow AI",
    ],
  },
  { threshold: 45, label: "Processing uploaded documents" },
  {
    threshold: 55,
    label: "Synthesizing company dossier",
    substeps: [
      "People — executives, security leadership, reporting chains",
      "Systems — cloud, databases, SIEM, identity, CI/CD, firewalls",
      "Vendors — supply chain entities, SPoF analysis, contracts",
      "Data flows — system-to-system data movement, encryption, protocols",
      "Access mappings — role-to-system privileges, MFA requirements",
      "Network topology — DMZ, internal zones, cloud VPC, exposure",
      "Risks — company-specific threats, affected systems, mitigations",
      "Events — breaches, acquisitions, lawsuits, leadership changes",
      "Compliance & security posture — frameworks, tools, IR plan",
    ],
  },
  { threshold: 85, label: "Indexing dossier to knowledge graph" },
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
      {/* Progress + Elapsed — single line */}
      <div className="font-mono text-xs flex items-baseline gap-2 whitespace-nowrap">
        <AsciiProgressBar value={progress.progress} width={12} showPercent={false} color="text-primary" label={`Research progress: ${progress.progress}%`} />
        <span className="text-foreground tabular-nums">{progress.progress}%</span>
        {progress.startedAt && (
          <span className="text-muted-foreground tabular-nums">{minutes}:{seconds}</span>
        )}
      </div>

      <AsciiDivider variant="dots" />

      {/* Activity timeline */}
      <AsciiSectionHeader sigil="│" as="h4">Activity</AsciiSectionHeader>
      <div className="space-y-0">
        {RESEARCH_STEPS.map((step, i) => {
          const isCompleted = i < activeStepIndex;
          const isActive = i === activeStepIndex;
          const isLast = i === RESEARCH_STEPS.length - 1;

          const status: "complete" | "running" | "pending" = isCompleted
            ? "complete"
            : isActive
              ? "running"
              : "pending";

          return (
            <div key={step.threshold} className="flex items-start gap-2 font-mono text-xs">
              {/* ASCII timeline rail */}
              <div className="flex flex-col items-center select-none shrink-0" aria-hidden="true">
                <AsciiStatus status={status} showLabel={false} />
                {!isLast && (
                  <span className="text-muted-foreground/30 text-[10px] leading-tight whitespace-pre">{"│\n│"}</span>
                )}
              </div>
              {/* Content */}
              <div className="pb-3 min-w-0">
                <span
                  className={`leading-tight ${
                    isCompleted
                      ? "text-foreground"
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
                {"substeps" in step && step.substeps && (isActive || isCompleted) && (
                  <ul className="mt-1 space-y-0.5">
                    {step.substeps.map((sub: string) => (
                      <li key={sub} className="flex items-start gap-1.5 text-[10px]">
                        <span className="text-muted-foreground/40 select-none" aria-hidden="true">·</span>
                        <span className={isCompleted ? "text-foreground/70" : "text-muted-foreground"}>
                          {sub}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AsciiDivider variant="dots" />

      {/* Counters */}
      <div className="grid grid-cols-2 gap-3">
        <AsciiMetricCard label="Entities" value="--" icon="§" valueColor="text-primary" />
        <AsciiMetricCard label="Relationships" value="--" icon="›" valueColor="text-secondary" />
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
  mcSimActions,
  mcSimStatus,
  cfSimActions,
  cfSimStatus,
  researchProgress,
  mcLiveProgress,
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
  mcSimActions?: AgentAction[];
  mcSimStatus?: SimulationStatus | null;
  cfSimActions?: AgentAction[];
  cfSimStatus?: SimulationStatus | null;
  researchProgress?: ResearchProgress;
  mcLiveProgress?: { completed: number; total: number } | null;
}) {
  // MC iteration selection for viewing actions on completed runs
  const [selectedMcIterId, setSelectedMcIterId] = useState<string | null>(null);
  const { simStatus: selectedMcStatus, simActions: selectedMcActions } = useSimulationPolling(selectedMcIterId);

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
            <AsciiSpinner className="text-lg text-primary shrink-0" />
            <span className="text-sm font-mono text-muted-foreground">
              {state?.detail || "Building agent personas, pressures, and communication channels\u2026"}
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
    let parsed: { iterations?: number; completed?: number; totalCost?: number; scenarioTitle?: string; variation_description?: string; batchId?: string } | null = null;
    if (state?.detail) {
      try { parsed = JSON.parse(state.detail); } catch { /* detail is plain text */ }
    }

    if (state?.status === "running") {
      // Use MC-specific data (not shared mcCf which may be CF's data)
      const mcSt = mcSimStatus || mcCfSimStatus;
      const mcAc = mcSimActions || mcCfSimActions;
      if (mcSt && mcAc) {
        const title = parsed?.scenarioTitle
          ? `Stress Test: ${parsed.scenarioTitle}`
          : "Stress Test Variation";

        const variationDesc = parsed?.variation_description || mcSt?.variation_description || "";
        const mcChanges: string[] = [];
        if (variationDesc) {
          // Parse "temp=0.74"
          const tempMatch = variationDesc.match(/temp=([\d.]+)/);
          if (tempMatch) {
            const temp = parseFloat(tempMatch[1]);
            if (temp > 0.75) mcChanges.push("Team under higher pressure");
            else if (temp < 0.6) mcChanges.push("Team responds more cautiously");
            else mcChanges.push("Slightly varied decision-making");
          }
          // Parse timing shifts
          if (variationDesc.includes("timing_shift")) {
            mcChanges.push("Attack events shifted in timing");
          }
          // Parse order shuffle
          if (variationDesc.includes("order=")) {
            mcChanges.push("Team response order changed");
          }
          // Parse persona mods
          if (variationDesc.includes("persona_mods")) {
            mcChanges.push("Team members respond with different priorities");
          }
        }

        const mcCompleted = mcLiveProgress?.completed ?? parsed?.completed ?? 0;
        const mcTotal = mcLiveProgress?.total ?? parsed?.iterations ?? 1;

        return (
          <div className="flex flex-col h-full">
            {parsed?.batchId && mcCompleted > 0 && (
              <div className="px-3 py-2 border-b border-border/10 max-h-[40%] overflow-y-auto shrink-0">
                <MCIterationList batchId={parsed.batchId} live />
              </div>
            )}
            <div className="flex-1 min-h-0">
              <PipelineSimulationPanel
                simStatus={mcSt}
                simActions={mcAc}
                graphData={graphData}
                activeSimIndex={0}
                totalSims={1}
                scenarioTitle={title}
                contextHeader={{
                  title: `Stress Test: ${parsed?.scenarioTitle || "scenario"}`,
                  subtitle: `Variation ${mcCompleted + 1}/${mcTotal}`,
                  changes: mcChanges.length > 0 ? mcChanges : ["Testing with controlled variations"],
                }}
              />
            </div>
          </div>
        );
      }

      const completed = mcLiveProgress?.completed ?? parsed?.completed ?? 0;
      const total = mcLiveProgress?.total ?? parsed?.iterations ?? 1;
      const pct = Math.round((completed / total) * 100);

      return (
        <div className="space-y-3" aria-live="polite">
          <div className="flex items-center gap-3">
            <AsciiSpinner className="text-lg text-tuscan-sun-500 shrink-0" />
            <span className="text-sm font-mono text-foreground/80">
              Variation {completed + 1}/{total}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-tuscan-sun-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {parsed?.batchId && <MCIterationList batchId={parsed.batchId} live />}
          {!parsed && state.detail && (
            <p className="text-xs font-mono text-muted-foreground">{state.detail}</p>
          )}
        </div>
      );
    }

    if (state?.status === "completed") {
      return (
        <div className="space-y-4">
          <p className="text-xs font-mono text-verdigris-700">{state.message || "Stress testing complete"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-tuscan-sun-50 rounded-lg px-3 py-2 text-center">
              <div className="text-xl font-bold font-mono text-tuscan-sun-700">{parsed?.iterations || "?"}</div>
              <div className="text-[10px] font-mono text-tuscan-sun-600 uppercase">Variations</div>
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
          {parsed?.batchId && (
            <MCIterationList
              batchId={parsed.batchId}
              selectedIterationId={selectedMcIterId}
              onSelectIteration={(id) => setSelectedMcIterId(prev => prev === id ? null : id)}
            />
          )}
          {selectedMcIterId && selectedMcStatus && selectedMcActions && selectedMcActions.length > 0 && (
            <PipelineSimulationPanel
              simStatus={selectedMcStatus}
              simActions={selectedMcActions}
              graphData={graphData}
              activeSimIndex={0}
              totalSims={1}
              scenarioTitle={parsed?.scenarioTitle ? `Stress Test: ${parsed.scenarioTitle}` : "Stress Test Results"}
            />
          )}
          {!selectedMcIterId && (mcSimStatus || mcCfSimStatus) && (mcSimActions || mcCfSimActions) && ((mcSimActions || mcCfSimActions)?.length ?? 0) > 0 && (
            <PipelineSimulationPanel
              simStatus={(mcSimStatus || mcCfSimStatus)!}
              simActions={(mcSimActions || mcCfSimActions)!}
              graphData={graphData}
              activeSimIndex={0}
              totalSims={1}
              scenarioTitle={parsed?.scenarioTitle ? `Stress Test: ${parsed.scenarioTitle}` : "Stress Test Results"}
            />
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
      // Use CF-specific data (not shared mcCf which may be MC's data)
      const cfSt = cfSimStatus || mcCfSimStatus;
      const cfAc = cfSimActions || mcCfSimActions;
      if (cfSt && cfAc) {
        const title = parsed?.forkAgent && parsed?.forkRound
          ? `What If: Round ${parsed.forkRound} — ${parsed.forkAgent}'s decision`
          : "Alternate Timeline";
        return (
          <PipelineSimulationPanel
            simStatus={cfSt}
            simActions={cfAc}
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
            <AsciiSpinner className="text-lg text-primary shrink-0" />
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
          <p className="text-xs font-mono text-verdigris-700">{state.message || "What-if analysis complete"}</p>
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
                <div className="text-[10px] font-mono text-verdigris-600 uppercase">Branches Tested</div>
              </div>
            )}
          </div>
          {(cfSimStatus || mcCfSimStatus) && (cfSimActions || mcCfSimActions) && ((cfSimActions || mcCfSimActions)?.length ?? 0) > 0 && (
            <PipelineSimulationPanel
              simStatus={(cfSimStatus || mcCfSimStatus)!}
              simActions={(cfSimActions || mcCfSimActions)!}
              graphData={graphData}
              activeSimIndex={0}
              totalSims={1}
              scenarioTitle={parsed?.forkAgent && parsed?.forkRound
                ? `What If: Round ${parsed.forkRound} — ${parsed.forkAgent}'s decision`
                : "Alternate Timeline"}
            />
          )}
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
        <AsciiSpinner className="text-lg text-primary shrink-0" />
        <span className="text-sm font-mono text-muted-foreground">{state.message || "Processing\u2026"}</span>
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
