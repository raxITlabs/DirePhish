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
import WorldStats from "@/app/components/simulation/WorldStats";
import SplitPanel from "@/app/components/shared/SplitPanel";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
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
  const [graphVersion, setGraphVersion] = useState(0);
  const [graphPushing, setGraphPushing] = useState(false);

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

  // Reactive graph polling — fetch when push version increments
  useEffect(() => {
    const pushInfo = status?.graphPush;
    if (!pushInfo) return;
    setGraphPushing(pushInfo.pushing);
    if (pushInfo.version > graphVersion) {
      setGraphVersion(pushInfo.version);
      pollGraph();
    }
  }, [status?.graphPush, graphVersion, pollGraph]);

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

  const statusVariant = (status?.status === "failed" ? "destructive" : "secondary") as
    | "destructive"
    | "secondary"
    | "default"
    | "outline";

  return (
    <div className="h-screen flex flex-col">
      <Header />
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Simulation" }, { label: simId }]} />
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <span className="text-sm font-medium">
            Round <strong>{status?.currentRound || 0}</strong>/{status?.totalRounds || "?"}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {actions.length} actions &middot; {new Set(actions.map((a) => a.agent)).size} agents
          </span>
          <Badge variant={statusVariant}>
            {status?.status || "loading"}
          </Badge>
          {isRunning && (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              Stop
            </Button>
          )}
          {isDone && (
            <Button size="sm" onClick={handleViewReport}>
              View Report
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-4 mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Pressure strip */}
      <div className="px-4 pt-3">
        <PressureStrip pressures={status?.pressures || []} />
      </div>

      {/* World stats */}
      <div className="px-4 pt-2">
        <WorldStats actions={actions} />
      </div>

      {/* Split panels */}
      <SplitPanel
        viewMode={viewMode}
        leftPanel={<GraphPanel data={graphData} isLive={isRunning} isPushing={graphPushing} onRefresh={pollGraph} />}
        rightPanel={<WorldTabs actions={actions} scheduledEvents={scheduledEvents} />}
      />
    </div>
  );
}
