// frontend/app/pipeline/[runId]/page.tsx
"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import PipelineCanvas from "@/app/components/pipeline/PipelineCanvas";
import PipelineStagesPanel from "@/app/components/pipeline/PipelineStagesPanel";
import PipelineDetailPanel from "@/app/components/pipeline/PipelineDetailPanel";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/app/components/ui/resizable";
import { useSimulationPolling } from "@/app/hooks/useSimulationPolling";
import { getDossier, getProjectGraph, updateDossier } from "@/app/actions/project";
import { getScenarios, getConfigs } from "@/app/actions/scenarios";
import type { CompanyDossier, GraphData, GraphNode, ThreatAnalysisResponse, SimulationConfig } from "@/app/types";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface PipelineUpdate {
  step: string;
  status: StepStatus;
  message: string;
  detail?: string;
  timestamp: string;
  durationMs?: number;
  cost?: number;
}

interface StepState {
  status: StepStatus;
  message: string;
  detail?: string;
  durationMs?: number;
  cost?: number;
}

const STEP_ORDER = [
  { id: "research", label: "Company Research" },
  { id: "dossier_review", label: "Dossier Review" },
  { id: "threat_analysis", label: "Threat Analysis" },
  { id: "scenario_selection", label: "Scenario Selection" },
  { id: "config_expansion", label: "Config Generation" },
  { id: "simulations", label: "Simulations" },
  { id: "exercise_report", label: "Exercise Report" },
];

export default function PipelinePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  // Pipeline state
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [hookData, setHookData] = useState<{ hookToken: string; projectId: string } | null>(null);
  const [dossier, setDossier] = useState<CompanyDossier | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Simulation state
  const [allSimIds, setAllSimIds] = useState<string[]>([]);
  const [activeSimId, setActiveSimId] = useState<string | null>(null);
  const [activeSimIndex, setActiveSimIndex] = useState(0);

  // Project graph (from research phase, before simulations)
  const [projectGraph, setProjectGraph] = useState<GraphData>({ nodes: [], edges: [] });

  // Threat analysis data (scenarios, threats, attack paths)
  const [threatData, setThreatData] = useState<ThreatAnalysisResponse | null>(null);

  // Canvas state
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Detail panel state — which stage is selected for detail view
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const [configs, setConfigs] = useState<SimulationConfig[] | null>(null);

  // Simulation polling hook
  const { simStatus, simActions, graphData: simGraphData, graphPushing, error: simError, pollGraph } =
    useSimulationPolling(activeSimId);

  // Merge: use simulation graph if available, otherwise project graph
  const graphData = simGraphData.nodes.length > 0 ? simGraphData : projectGraph;

  const isSimRunning = simStatus?.status === "running" || simStatus?.status === "starting";

  const lastAutoFollowedRef = useRef<string | null>(null);

  // Auto-follow only when a NEW stage starts running — not on every poll
  useEffect(() => {
    const runningStep = STEP_ORDER.find((s) => steps[s.id]?.status === "running");
    if (!runningStep) return;
    if (runningStep.id === lastAutoFollowedRef.current) return;
    if (runningStep.id === "dossier_review" && !dossier) return;
    if (runningStep.id === "simulations" && !simStatus) return;
    lastAutoFollowedRef.current = runningStep.id;
    setSelectedStageId(runningStep.id);
  }, [steps, dossier, simStatus]);

  // Handle stage selection from sidebar
  const handleSelectStage = useCallback((stageId: string) => {
    setSelectedStageId((prev) => (prev === stageId ? null : stageId));
  }, []);

  // Handle simulation switching
  const handleSimChange = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < allSimIds.length) {
      setActiveSimIndex(newIndex);
      setActiveSimId(allSimIds[newIndex]);
    }
  }, [allSimIds]);

  // Poll for pipeline updates
  useEffect(() => {
    if (pipelineComplete) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pipeline/stream?runId=${runId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.data?.updates) {
          setSteps((prev) => {
            const newSteps = { ...prev };
            for (const update of json.data.updates as PipelineUpdate[]) {
              newSteps[update.step] = {
                status: update.status,
                message: update.message,
                detail: update.detail,
                durationMs: update.durationMs,
                cost: update.cost,
              };

              // Check for hook data (dossier review pause)
              if (update.step === "dossier_review" && update.detail) {
                try {
                  const parsed = JSON.parse(update.detail);
                  if (parsed.hookToken && parsed.projectId) {
                    setHookData(parsed);
                    setProjectId(parsed.projectId);
                  }
                } catch {
                  // detail is not hook JSON
                }
              }

              // Check for completion
              if (update.step === "complete") {
                setPipelineComplete(true);
              }

              // Extract project ID from research step
              if (update.step === "research" && update.detail?.startsWith("Project:")) {
                const pid = update.detail.replace("Project: ", "");
                setProjectId(pid);
              }

              // Extract simIds from simulations step
              if (update.step === "simulations" && update.status === "running" && update.detail) {
                const ids = update.detail.split(", ").filter(Boolean);
                if (ids.length > 1) {
                  setAllSimIds(ids);
                  setActiveSimId(ids[0]);
                  setActiveSimIndex(0);
                } else if (ids.length === 1) {
                  setActiveSimId(ids[0]);
                }
              }

              // Track sim index from message pattern "Simulation N/M running..."
              if (update.step === "simulations" && update.message) {
                const simMatch = update.message.match(/Simulation (\d+)\/(\d+)/);
                if (simMatch) {
                  setActiveSimIndex(parseInt(simMatch[1], 10) - 1);
                }
              }
            }
            return newSteps;
          });
        }
      } catch {
        // polling failure is ok
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [runId, pipelineComplete]);

  // Load dossier when hook fires
  useEffect(() => {
    if (!hookData?.projectId) return;
    getDossier(hookData.projectId).then((result) => {
      if ("data" in result) setDossier(result.data);
    });
  }, [hookData?.projectId]);

  // Fetch project graph once research completes (projectId is available)
  useEffect(() => {
    if (!projectId) return;
    const researchState = steps["research"];
    if (researchState?.status !== "completed") return;
    getProjectGraph(projectId).then((result) => {
      if ("data" in result && result.data.nodes.length > 0) {
        setProjectGraph(result.data);
      }
    });
  }, [projectId, steps]);

  // Fetch threat analysis data as soon as threat_analysis or scenario_selection completes
  useEffect(() => {
    if (!projectId || threatData) return;
    const threatState = steps["threat_analysis"];
    const scenarioState = steps["scenario_selection"];
    if (threatState?.status !== "completed" && scenarioState?.status !== "completed") return;
    getScenarios(projectId).then((result) => {
      if ("data" in result) setThreatData(result.data);
    });
  }, [projectId, steps, threatData]);

  // Fetch configs when config_expansion completes
  useEffect(() => {
    if (!projectId) return;
    const configState = steps["config_expansion"];
    if (configState?.status !== "completed" || configs) return;
    getConfigs(projectId).then((result) => {
      if ("data" in result) setConfigs(result.data);
    });
  }, [projectId, steps, configs]);

  const handleConfirmWithSave = useCallback(async (editedDossier: CompanyDossier) => {
    if (!hookData || !projectId) return;
    setConfirming(true);
    try {
      // Save edited dossier
      await updateDossier(projectId, editedDossier);
      setDossier(editedDossier);
      // Then confirm pipeline
      await fetch("/api/pipeline/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: hookData.hookToken, confirmed: true }),
      });
      setHookData(null);
    } catch {
      setError("Failed to confirm dossier");
    } finally {
      setConfirming(false);
    }
  }, [hookData, projectId]);

  return (
    <div className="flex" style={{ width: "100%", height: "calc(100svh - 3rem)" }}>
      {/* Left: stage navigator — always visible */}
      <PipelineStagesPanel
        steps={steps}
        stepOrder={STEP_ORDER}
        selectedStageId={selectedStageId}
        onSelectStage={handleSelectStage}
        simStatus={simStatus}
        dossierSummary={dossier?.company?.name}
        pipelineComplete={pipelineComplete}
        threatData={threatData}
      />

      {/* Center + Right: canvas with optional detail panel */}
      <div className="flex-1 min-w-0">
        {selectedStageId ? (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel defaultSize={60} minSize={30}>
              <PipelineCanvas
                graphData={graphData}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
                error={error || simError}
                isSimRunning={isSimRunning}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={25}>
              <PipelineDetailPanel
                stageId={selectedStageId}
                steps={steps}
                dossier={dossier}
                onConfirmDossier={handleConfirmWithSave}
                confirming={confirming}
                simStatus={simStatus}
                simActions={simActions}
                activeSimIndex={activeSimIndex}
                totalSims={allSimIds.length}
                threatData={threatData}
                graphData={graphData}
                scenarioTitle={threatData?.scenarios?.[activeSimIndex]?.title}
                onClose={() => setSelectedStageId(null)}
                projectId={projectId}
                allSimIds={allSimIds}
                onSimChange={handleSimChange}
                configs={configs}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <PipelineCanvas
            graphData={graphData}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            error={error || simError}
            isSimRunning={isSimRunning}
          />
        )}
      </div>
    </div>
  );
}
