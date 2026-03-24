"use client";

import { useEffect, useState, useCallback } from "react";
import { getMonteCarloBatchStatus } from "@/app/actions/monte-carlo";
import type { MonteCarloBatchStatus } from "@/app/types";

interface UseMonteCarloPollingResult {
  batchStatus: MonteCarloBatchStatus | null;
  error: string | null;
}

export function useMonteCarloPolling(batchId: string | null): UseMonteCarloPollingResult {
  const [batchStatus, setBatchStatus] = useState<MonteCarloBatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when batchId changes
  useEffect(() => {
    setBatchStatus(null);
    setError(null);
  }, [batchId]);

  const pollStatus = useCallback(async () => {
    if (!batchId) return;
    const result = await getMonteCarloBatchStatus(batchId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setBatchStatus(result.data);
  }, [batchId]);

  // Initial load when batchId becomes available
  useEffect(() => {
    if (!batchId) return;
    pollStatus();
  }, [batchId, pollStatus]);

  // Poll every 3s while running or pending
  useEffect(() => {
    if (!batchId) return;
    if (!batchStatus || (batchStatus.status !== "running" && batchStatus.status !== "pending")) return;
    const interval = setInterval(pollStatus, 3000);
    return () => {
      clearInterval(interval);
    };
  }, [batchId, batchStatus?.status, pollStatus]);

  return { batchStatus, error };
}
