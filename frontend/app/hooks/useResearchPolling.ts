"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getProjectStatus } from "@/app/actions/project";

export interface ResearchProgress {
  progress: number;
  progressMessage: string;
  status: string;
  startedAt: number | null;
}

export function useResearchPolling(
  projectId: string | null,
  isActive: boolean,
): ResearchProgress {
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [status, setStatus] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  // Reset when projectId changes
  useEffect(() => {
    setProgress(0);
    setProgressMessage("");
    setStatus("");
    setStartedAt(null);
    startedAtRef.current = null;
  }, [projectId]);

  const poll = useCallback(async () => {
    if (!projectId) return;
    const result = await getProjectStatus(projectId);
    if ("error" in result) return;
    const d = result.data;
    setProgress(d.progress);
    setProgressMessage(d.progressMessage);
    setStatus(d.status);
    if (d.progress > 0 && !startedAtRef.current) {
      startedAtRef.current = Date.now();
      setStartedAt(Date.now());
    }
  }, [projectId]);

  useEffect(() => {
    if (!isActive || !projectId) return;
    // Initial fetch
    poll();
    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [isActive, projectId, poll]);

  return { progress, progressMessage, status, startedAt };
}
