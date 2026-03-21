// frontend/app/pipeline/[runId]/page.tsx
"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/layout/Header";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import SplitPanel from "@/app/components/shared/SplitPanel";
import GraphPanel from "@/app/components/simulation/GraphPanel";
import PipelineProgressBar from "@/app/components/pipeline/PipelineProgressBar";
import PipelineGraphPlaceholder from "@/app/components/pipeline/PipelineGraphPlaceholder";
import PipelineContextPanel from "@/app/components/pipeline/PipelineContextPanel";
import { useSimulationPolling } from "@/app/hooks/useSimulationPolling";
import { getDossier } from "@/app/actions/project";
import type { CompanyDossier } from "@/app/types";

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
  { id: "reports", label: "After-Action Reports" },
  { id: "comparative", label: "Comparative Analysis" },
];

export default function PipelinePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const router = useRouter();

  // Pipeline state (existing)
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [hookData, setHookData] = useState<{ hookToken: string; projectId: string } | null>(null);
  const [dossier, setDossier] = useState<CompanyDossier | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // New simulation state
  const [allSimIds, setAllSimIds] = useState<string[]>([]);
  const [activeSimId, setActiveSimId] = useState<string | null>(null);
  const [activeSimIndex, setActiveSimIndex] = useState(0);

  // Simulation polling hook
  const { simStatus, simActions, graphData, graphPushing, error: simError, pollGraph } =
    useSimulationPolling(activeSimId);

  const isSimRunning = simStatus?.status === "running" || simStatus?.status === "starting";

  // Show GraphPanel as soon as activeSimId is set — GraphPanel handles empty data gracefully
  const showGraph = !!activeSimId;

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
                  // First "running" update: "simId1, simId2"
                  setAllSimIds(ids);
                  setActiveSimId(ids[0]);
                  setActiveSimIndex(0);
                } else if (ids.length === 1) {
                  // Per-sim update: single simId
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

  const handleConfirmDossier = useCallback(async () => {
    if (!hookData) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/pipeline/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: hookData.hookToken,
          confirmed: true,
        }),
      });
      if (!res.ok) {
        setError("Failed to confirm dossier");
      }
      setHookData(null);
    } catch {
      setError("Failed to confirm dossier");
    } finally {
      setConfirming(false);
    }
  }, [hookData]);

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {/* Breadcrumbs bar */}
      <div className="px-4 py-2 border-b border-border">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Pipeline" },
          ]}
        />
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Progress bar */}
      <PipelineProgressBar steps={steps} stepOrder={STEP_ORDER} />

      {/* Main split layout */}
      <SplitPanel
        viewMode="split"
        splitRatio={[60, 40]}
        leftPanel={
          showGraph ? (
            <GraphPanel
              data={graphData}
              isLive={isSimRunning}
              isPushing={graphPushing}
              onRefresh={pollGraph}
            />
          ) : (
            <PipelineGraphPlaceholder
              companyName={dossier?.company?.name}
            />
          )
        }
        rightPanel={
          <PipelineContextPanel
            steps={steps}
            stepOrder={STEP_ORDER}
            dossier={dossier}
            hookData={hookData}
            confirming={confirming}
            onConfirmDossier={handleConfirmDossier}
            projectId={projectId}
            companyUrl={undefined}
            simStatus={simStatus}
            simActions={simActions}
            graphData={graphData}
            activeSimIndex={activeSimIndex}
            totalSims={allSimIds.length}
            simError={simError}
            pipelineComplete={pipelineComplete}
          />
        }
      />
    </div>
  );
}
