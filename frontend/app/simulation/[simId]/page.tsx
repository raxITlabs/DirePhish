"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/layout/Header";
import PressureStrip from "@/app/components/simulation/PressureStrip";
import ViewToggle, { type ViewMode } from "@/app/components/simulation/ViewToggle";
import WorldTabs from "@/app/components/simulation/WorldTabs";
import { getSimulationStatus, getSimulationActions, stopSimulation } from "@/app/actions/simulation";
import { generateReport } from "@/app/actions/report";
import { getGraphData } from "@/app/actions/graph";
import GraphPanel from "@/app/components/simulation/GraphPanel";
import type { SimulationStatus, AgentAction, ScheduledEvent, GraphData } from "@/app/types";

export default function SimulationPage({
  params,
}: {
  params: Promise<{ simId: string }>;
}) {
  const { simId } = use(params);
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [status, setStatus] = useState<SimulationStatus | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [scheduledEvents] = useState<ScheduledEvent[]>([]); // loaded from config
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });

  const pollStatus = useCallback(async () => {
    const result = await getSimulationStatus(simId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStatus(result.data);
  }, [simId]);

  const pollActions = useCallback(async () => {
    const result = await getSimulationActions(simId);
    if ("data" in result) {
      setActions(result.data);
    }
  }, [simId]);

  const pollGraph = useCallback(async () => {
    const result = await getGraphData(simId);
    if ("data" in result) setGraphData(result.data);
  }, [simId]);

  // Initial load
  useEffect(() => {
    pollStatus();
    pollActions();
    pollGraph();
  }, [pollStatus, pollActions, pollGraph]);

  // Polling
  useEffect(() => {
    if (!status || (status.status !== "running" && status.status !== "starting")) return;
    const statusInterval = setInterval(pollStatus, 3000);
    const actionsInterval = setInterval(pollActions, 3000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(actionsInterval);
    };
  }, [status?.status, pollStatus, pollActions]);

  // Graph polling (30s when running/starting)
  useEffect(() => {
    if (!status || (status.status !== "running" && status.status !== "starting")) return;
    const graphInterval = setInterval(pollGraph, 30000);
    return () => clearInterval(graphInterval);
  }, [status?.status, pollGraph]);

  const handleStop = async () => {
    await stopSimulation(simId);
    pollStatus();
  };

  const handleViewReport = async () => {
    await generateReport(simId);
    router.push(`/report/${simId}`);
  };

  const isRunning = status?.status === "running" || status?.status === "starting";
  const isDone = status?.status === "completed" || status?.status === "stopped";

  const statusColor = {
    starting: "bg-yellow-100 text-yellow-700",
    running: "bg-green-100 text-green-700",
    completed: "bg-blue-100 text-blue-700",
    stopped: "bg-gray-100 text-gray-600",
    failed: "bg-red-100 text-red-700",
  }[status?.status || "starting"];

  // Panel widths based on view mode
  const graphWidth = viewMode === "graph" ? "100%" : viewMode === "split" ? "50%" : "0%";
  const tabsWidth = viewMode === "focus" ? "100%" : viewMode === "split" ? "50%" : "0%";

  return (
    <div className="h-screen flex flex-col">
      <Header />
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Crucible</span>
          <span className="text-sm text-text-secondary">{simId}</span>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <span className="text-sm font-medium">
            Round <strong>{status?.currentRound || 0}</strong>/{status?.totalRounds || "?"}
          </span>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor}`}>
            {status?.status || "loading"}
          </span>
          {isRunning && (
            <button
              onClick={handleStop}
              className="px-3 py-1 text-xs rounded-md bg-red-500 text-white hover:bg-red-600"
            >
              Stop
            </button>
          )}
          {isDone && (
            <button
              onClick={handleViewReport}
              className="px-3 py-1 text-xs rounded-md bg-accent text-white hover:opacity-90"
            >
              View Report
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-severity-critical-bg text-severity-critical-text text-sm">
          {error}
        </div>
      )}

      {/* Pressure strip */}
      <div className="px-4 pt-3">
        <PressureStrip pressures={status?.pressures || []} />
      </div>

      {/* Split panels */}
      <div className="flex-1 flex min-h-0 px-4 pb-4 gap-3">
        {/* Graph panel */}
        <div
          className="min-h-0 transition-all duration-300"
          style={{ width: graphWidth, opacity: viewMode === "focus" ? 0 : 1 }}
        >
          <div className="h-full border border-border rounded-lg bg-card overflow-hidden">
            <GraphPanel data={graphData} isLive={isRunning} onRefresh={pollGraph} />
          </div>
        </div>
        {/* World tabs */}
        <div
          className="min-h-0 transition-all duration-300"
          style={{ width: tabsWidth, opacity: viewMode === "graph" ? 0 : 1 }}
        >
          <div className="h-full border border-border rounded-lg bg-card flex flex-col" style={{ minHeight: 0 }}>
            <WorldTabs actions={actions} scheduledEvents={scheduledEvents} />
          </div>
        </div>
      </div>
    </div>
  );
}
