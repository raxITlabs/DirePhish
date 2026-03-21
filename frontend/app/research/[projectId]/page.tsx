// frontend/app/research/[projectId]/page.tsx
"use client";

import { use, useCallback, useEffect, useState } from "react";
import Header from "@/app/components/layout/Header";
import ViewToggle, { type ViewMode } from "@/app/components/simulation/ViewToggle";
import GraphPanel from "@/app/components/simulation/GraphPanel";
import ResearchProgress from "@/app/components/research/ResearchProgress";
import DossierEditor from "@/app/components/research/DossierEditor";
import SplitPanel from "@/app/components/shared/SplitPanel";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Skeleton } from "@/app/components/ui/skeleton";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import {
  getProjectStatus,
  getDossier,
  getProjectGraph,
} from "@/app/actions/project";
import { useRouter } from "next/navigation";
import type { Project, CompanyDossier, GraphData } from "@/app/types";

// Statuses where research is done and dossier exists
const POST_RESEARCH_STATUSES = [
  "research_complete",
  "analyzing_threats",
  "scenarios_ready",
  "generating_config",
  "config_ready",
  "generating_configs",
  "configs_ready",
];

export default function ResearchPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [dossier, setDossier] = useState<CompanyDossier | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const result = await getProjectStatus(projectId);
    if ("error" in result) {
      setLoadError(result.error);
      return null;
    }
    setProject(result.data);
    return result.data;
  }, [projectId]);

  const loadReviewData = useCallback(async () => {
    const [dossierResult, graphResult] = await Promise.all([
      getDossier(projectId),
      getProjectGraph(projectId),
    ]);
    if ("data" in dossierResult) setDossier(dossierResult.data);
    if ("data" in graphResult) setGraphData(graphResult.data);
  }, [projectId]);

  // Initial load
  useEffect(() => {
    fetchStatus().then((p) => {
      if (p && POST_RESEARCH_STATUSES.includes(p.status)) {
        loadReviewData();
      }
    });
  }, [fetchStatus, loadReviewData]);

  // Poll while researching
  useEffect(() => {
    if (!project || project.status !== "researching") return;
    const interval = setInterval(async () => {
      const p = await fetchStatus();
      if (p && POST_RESEARCH_STATUSES.includes(p.status)) {
        clearInterval(interval);
        loadReviewData();
      } else if (p?.status === "failed") {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [project?.status, fetchStatus, loadReviewData]);

  const refreshGraph = useCallback(async () => {
    const result = await getProjectGraph(projectId);
    if ("data" in result) setGraphData(result.data);
  }, [projectId]);

  // Poll graph until nodes appear (Zep processes episodes async)
  useEffect(() => {
    if (!project || !POST_RESEARCH_STATUSES.includes(project.status)) return;
    if (graphData.nodes.length > 0) return;
    const interval = setInterval(async () => {
      const result = await getProjectGraph(projectId);
      if ("data" in result && result.data.nodes.length > 0) {
        setGraphData(result.data);
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [project?.status, graphData.nodes.length, projectId]);

  if (loadError) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-6">
          <Alert variant="destructive" className="max-w-md">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="space-y-3 w-64">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Research" }, { label: projectId }]} />
        </div>
        {POST_RESEARCH_STATUSES.includes(project.status) && (
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        )}
      </div>

      {/* Loading / error states */}
      {(project.status === "researching" || project.status === "failed") && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md">
            <ResearchProgress
              progress={project.progress}
              message={project.progressMessage}
              errorMessage={
                project.status === "failed" ? project.errorMessage : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Review state */}
      {POST_RESEARCH_STATUSES.includes(project.status) && dossier && (
        <SplitPanel
          viewMode={viewMode}
          leftPanel={
            <GraphPanel
              data={graphData}
              isLive={false}
              onRefresh={refreshGraph}
            />
          }
          rightHeader={
            <span className="text-xs font-semibold text-muted-foreground">
              Company Intelligence
            </span>
          }
          rightPanel={
            <DossierEditor
              projectId={projectId}
              initialDossier={dossier}
            />
          }
        />
      )}

      {/* Config / threat analysis pass-through states */}
      {["generating_config", "config_ready", "analyzing_threats", "scenarios_ready", "generating_configs", "configs_ready"].includes(project.status) && !dossier && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md text-center">
            <p className="text-sm text-muted-foreground">
              {project.progressMessage || "Processing..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
