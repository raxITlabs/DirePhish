// frontend/app/pipeline/[runId]/page.tsx
"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/layout/Header";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import { Button } from "@/app/components/ui/button";
import DossierEditor from "@/app/components/research/DossierEditor";
import { getDossier, getProjectGraph } from "@/app/actions/project";
import type { CompanyDossier, GraphData } from "@/app/types";

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

const statusIcon: Record<StepStatus, string> = {
  pending: "○",
  running: "◉",
  completed: "✓",
  failed: "✗",
  skipped: "—",
};

const statusColor: Record<StepStatus, string> = {
  pending: "text-muted-foreground",
  running: "text-primary",
  completed: "text-green-600",
  failed: "text-red-600",
  skipped: "text-muted-foreground/50",
};

export default function PipelinePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const router = useRouter();

  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [hookData, setHookData] = useState<{ hookToken: string; projectId: string } | null>(null);
  const [dossier, setDossier] = useState<CompanyDossier | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

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
                  // detail is not hook JSON, that's fine
                }
              }

              // Check for completion
              if (update.step === "complete") {
                setPipelineComplete(true);
              }

              // Check for project ID in research step
              if (update.step === "research" && update.detail?.startsWith("Project:")) {
                const pid = update.detail.replace("Project: ", "");
                setProjectId(pid);
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
    getDossier(hookData.projectId).then(result => {
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
      setHookData(null); // clear the review state
    } catch {
      setError("Failed to confirm dossier");
    } finally {
      setConfirming(false);
    }
  }, [hookData]);

  const formatDuration = (ms?: number) => {
    if (!ms) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
        <Breadcrumbs items={[
          { label: "Home", href: "/" },
          { label: "Pipeline" },
        ]} />

        <h1 className="text-2xl font-bold mb-2">Crucible Pipeline</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Autonomous predictive simulation pipeline
        </p>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Pipeline Steps */}
        <div className="space-y-1 mb-8">
          {STEP_ORDER.map((stepDef) => {
            const state = steps[stepDef.id];
            const status = state?.status || "pending";
            const isActive = status === "running";
            const isHook = stepDef.id === "dossier_review" && hookData && status === "running";

            return (
              <div
                key={stepDef.id}
                className={`rounded-lg border p-4 transition-all ${
                  isActive ? "border-primary bg-primary/5" : "border-border"
                } ${status === "completed" ? "bg-green-50/50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`font-mono text-lg ${statusColor[status]}`}>
                      {status === "running" ? (
                        <span className="inline-block h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        statusIcon[status]
                      )}
                    </span>
                    <div>
                      <span className={`text-sm font-medium ${status === "pending" ? "text-muted-foreground" : ""}`}>
                        {stepDef.label}
                      </span>
                      {state?.message && status !== "pending" && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {state.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                    {state?.durationMs && (
                      <span>{formatDuration(state.durationMs)}</span>
                    )}
                    {state?.cost && (
                      <span>${state.cost.toFixed(3)}</span>
                    )}
                  </div>
                </div>

                {/* Expandable detail */}
                {state?.detail && !isHook && status === "completed" && (
                  <div className="mt-2 pl-10 text-xs text-muted-foreground border-l-2 border-muted ml-2">
                    {state.detail}
                  </div>
                )}

                {/* Dossier Review Hook UI */}
                {isHook && dossier && (
                  <div className="mt-4 pl-2">
                    <div className="rounded-lg border bg-card p-4 max-h-96 overflow-y-auto mb-4">
                      <h3 className="text-sm font-semibold mb-2">
                        {dossier.company?.name || "Company"} — Dossier
                      </h3>
                      <div className="text-xs space-y-2 text-muted-foreground">
                        <p><strong>Industry:</strong> {dossier.company?.industry}</p>
                        <p><strong>Size:</strong> {dossier.company?.size} ({dossier.company?.employeeCount} employees)</p>
                        <p><strong>Systems:</strong> {dossier.systems?.length || 0} tracked</p>
                        <p><strong>Risks:</strong> {dossier.risks?.length || 0} identified</p>
                        <p><strong>Recent Events:</strong> {dossier.recentEvents?.length || 0} tracked</p>
                        <p><strong>Compliance:</strong> {dossier.compliance?.join(", ")}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button onClick={handleConfirmDossier} disabled={confirming}>
                        {confirming ? "Confirming..." : "Confirm & Continue"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => router.push(`/research/${projectId}`)}
                      >
                        Edit Dossier
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Completion state */}
        {pipelineComplete && projectId && (
          <div className="rounded-lg border-2 border-green-200 bg-green-50/50 p-6 text-center">
            <h2 className="text-lg font-semibold mb-2">Pipeline Complete</h2>
            <p className="text-sm text-muted-foreground mb-4">
              All simulations and reports have been generated.
            </p>
            <Button onClick={() => router.push(`/report/comparative/${projectId}`)}>
              View Comparative Report
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
