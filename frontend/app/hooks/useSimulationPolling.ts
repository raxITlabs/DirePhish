"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSimulationStatus, getSimulationActions } from "@/app/actions/simulation";
import { getGraphData } from "@/app/actions/graph";
import type { SimulationStatus, AgentAction, GraphData } from "@/app/types";

interface UseSimulationPollingResult {
  simStatus: SimulationStatus | null;
  simActions: AgentAction[];
  graphData: GraphData;
  graphPushing: boolean;
  error: string | null;
  pollGraph: () => Promise<void>;
}

export function useSimulationPolling(simId: string | null): UseSimulationPollingResult {
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [simActions, setSimActions] = useState<AgentAction[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [graphPushing, setGraphPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graphVersionRef = useRef(0);

  // Reset state when simId changes
  useEffect(() => {
    setSimStatus(null);
    setSimActions([]);
    setGraphData({ nodes: [], edges: [] });
    setGraphPushing(false);
    setError(null);
    graphVersionRef.current = 0;
  }, [simId]);

  const pollStatus = useCallback(async () => {
    if (!simId) return;
    const result = await getSimulationStatus(simId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setSimStatus(result.data);
  }, [simId]);

  const pollActions = useCallback(async () => {
    if (!simId) return;
    const result = await getSimulationActions(simId);
    if ("data" in result) {
      setSimActions(result.data);
    }
  }, [simId]);

  const pollGraph = useCallback(async () => {
    if (!simId) return;
    const result = await getGraphData(simId);
    if ("data" in result) setGraphData(result.data);
  }, [simId]);

  // Initial load when simId becomes available
  useEffect(() => {
    if (!simId) return;
    pollStatus();
    pollActions();
    pollGraph();
  }, [simId, pollStatus, pollActions, pollGraph]);

  // Status + actions polling (every 3s while running)
  useEffect(() => {
    if (!simId) return;
    if (!simStatus || (simStatus.status !== "running" && simStatus.status !== "starting")) return;
    const statusInterval = setInterval(pollStatus, 3000);
    const actionsInterval = setInterval(pollActions, 3000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(actionsInterval);
    };
  }, [simId, simStatus?.status, pollStatus, pollActions]);

  // Reactive graph polling — fetch when push version increments
  useEffect(() => {
    const pushInfo = simStatus?.graphPush;
    if (!pushInfo) return;
    setGraphPushing(pushInfo.pushing);
    if (pushInfo.version > graphVersionRef.current) {
      graphVersionRef.current = pushInfo.version;
      pollGraph();
    }
  }, [simStatus?.graphPush, pollGraph]);

  return { simStatus, simActions, graphData, graphPushing, error, pollGraph };
}
