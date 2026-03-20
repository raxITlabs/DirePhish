// frontend/app/research/[projectId]/page.tsx
"use client";

import { use, useCallback, useEffect, useState } from "react";
import Header from "@/app/components/layout/Header";
import ViewToggle, { type ViewMode } from "@/app/components/simulation/ViewToggle";
import GraphPanel from "@/app/components/simulation/GraphPanel";
import ResearchProgress from "@/app/components/research/ResearchProgress";
import DossierEditor from "@/app/components/research/DossierEditor";
import {
  getProjectStatus,
  getDossier,
  getProjectGraph,
} from "@/app/actions/project";
import type { Project, CompanyDossier, GraphData } from "@/app/types";

export default function ResearchPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

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
      if (p?.status === "research_complete") {
        loadReviewData();
      }
    });
  }, [fetchStatus, loadReviewData]);

  // Poll while researching
  useEffect(() => {
    if (!project || project.status !== "researching") return;
    const interval = setInterval(async () => {
      const p = await fetchStatus();
      if (p?.status === "research_complete") {
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
    if (!project || project.status !== "research_complete") return;
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

  // Panel widths based on view mode
  const graphWidth =
    viewMode === "graph" ? "100%" : viewMode === "split" ? "50%" : "0%";
  const editorWidth =
    viewMode === "focus" ? "100%" : viewMode === "split" ? "50%" : "0%";

  if (loadError) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="p-4 rounded-lg bg-severity-critical-bg border border-severity-critical-border text-severity-critical-text text-sm max-w-md">
            {loadError}
          </div>
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-text-secondary">Loading...</p>
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
          <span className="font-semibold">Research</span>
          <span className="text-sm text-text-secondary font-mono">
            {projectId}
          </span>
        </div>
        {project.status === "research_complete" && (
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
      {project.status === "research_complete" && dossier && (
        <div className="flex-1 flex overflow-hidden px-4 pb-4 pt-3 gap-3">
          {/* Graph panel */}
          <div
            className="overflow-hidden transition-all duration-300"
            style={{
              width: graphWidth,
              opacity: viewMode === "focus" ? 0 : 1,
            }}
          >
            <div className="h-full border border-border rounded-lg bg-card overflow-hidden">
              <GraphPanel
                data={graphData}
                isLive={false}
                onRefresh={refreshGraph}
              />
            </div>
          </div>

          {/* Dossier editor panel */}
          <div
            className="overflow-hidden transition-all duration-300"
            style={{
              width: editorWidth,
              opacity: viewMode === "graph" ? 0 : 1,
            }}
          >
            <div className="h-full border border-border rounded-lg bg-card overflow-hidden flex flex-col">
              <div className="px-4 py-2 border-b border-border">
                <span className="text-xs font-semibold text-text-secondary">
                  Company Intelligence
                </span>
              </div>
              <DossierEditor
                projectId={projectId}
                initialDossier={dossier}
              />
            </div>
          </div>
        </div>
      )}

      {/* Config generating / config ready pass-through states */}
      {(project.status === "generating_config" ||
        project.status === "config_ready") && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md text-center">
            <p className="text-sm text-text-secondary">
              {project.status === "generating_config"
                ? "Generating simulation config..."
                : "Config ready. Redirecting..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
