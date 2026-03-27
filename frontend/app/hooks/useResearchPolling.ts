"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getProjectStatus } from "@/app/actions/project";

export interface ResearchProgress {
  progress: number;
  progressMessage: string;
  status: string;
  startedAt: number | null;
}

const INITIAL_STATE: ResearchProgress = {
  progress: 0,
  progressMessage: "",
  status: "",
  startedAt: null,
};

export function useResearchPolling(
  projectId: string | null,
  isActive: boolean,
): ResearchProgress {
  const [state, setState] = useState<ResearchProgress>(INITIAL_STATE);
  const startedAtRef = useRef<number | null>(null);

  // Reset when projectId changes
  useEffect(() => {
    setState(INITIAL_STATE);
    startedAtRef.current = null;
  }, [projectId]);

  const poll = useCallback(async () => {
    if (!projectId) return;
    const result = await getProjectStatus(projectId);
    if ("error" in result) return;
    const d = result.data;
    let startedAt = startedAtRef.current;
    if (d.progress > 0 && !startedAt) {
      startedAt = Date.now();
      startedAtRef.current = startedAt;
    }
    // Single setState — one re-render per poll instead of four
    setState({
      progress: d.progress,
      progressMessage: d.progressMessage,
      status: d.status,
      startedAt,
    });
  }, [projectId]);

  useEffect(() => {
    if (!isActive || !projectId) return;
    poll();
    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [isActive, projectId, poll]);

  return state;
}
