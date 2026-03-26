"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/app/components/ui/alert-dialog";
import { cn } from "@/app/lib/utils";
import type { SimulationConfig } from "@/app/types";
import type { MonteCarloMode, MonteCarloEstimate } from "@/app/types/monte-carlo";
import { MODE_CONFIG } from "@/app/types/monte-carlo";
import { estimateMonteCarloCost, launchMonteCarloBatch } from "@/app/actions/monte-carlo";

interface MonteCarloLauncherProps {
  config: SimulationConfig;
  projectId: string;
  onLaunch: (batchId: string) => void;
}

const DEFAULT_LIMITS: Record<MonteCarloMode, number> = {
  test: 5,
  quick: 25,
  standard: 100,
  deep: 250,
};

export default function MonteCarloLauncher({
  config,
  projectId,
  onLaunch,
}: MonteCarloLauncherProps) {
  const [mode, setMode] = useState<MonteCarloMode>("test");
  const [estimate, setEstimate] = useState<MonteCarloEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [costLimit, setCostLimit] = useState(DEFAULT_LIMITS.test);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testCompleted, setTestCompleted] = useState(false);

  const fetchEstimate = useCallback(async () => {
    setEstimateLoading(true);
    setError(null);
    const result = await estimateMonteCarloCost(config, mode);
    if ("error" in result) {
      setError(result.error);
      setEstimateLoading(false);
      return;
    }
    setEstimate(result.data);
    setEstimateLoading(false);
  }, [config, mode]);

  useEffect(() => {
    fetchEstimate();
  }, [fetchEstimate]);

  useEffect(() => {
    setCostLimit(DEFAULT_LIMITS[mode]);
  }, [mode]);

  const handleLaunch = async () => {
    setLaunching(true);
    setError(null);
    const result = await launchMonteCarloBatch(projectId, config, mode, costLimit);
    if ("error" in result) {
      setError(result.error);
      setLaunching(false);
      return;
    }
    if (mode === "test") setTestCompleted(true);
    onLaunch(result.data.batchId);
    setLaunching(false);
  };

  const needsTestGate = (mode === "standard" || mode === "deep") && !testCompleted;
  const modes = Object.entries(MODE_CONFIG) as [MonteCarloMode, (typeof MODE_CONFIG)[MonteCarloMode]][];

  return (
    <div className="space-y-5">
      {/* ── Mode Selector ── */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Batch Mode
        </div>
        <div className="grid grid-cols-4 gap-2">
          {modes.map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn(
                "relative rounded-lg border p-3 text-left transition-all",
                "hover:border-verdigris-400 hover:bg-verdigris-50/50",
                mode === key
                  ? "border-verdigris-500 bg-verdigris-50 ring-1 ring-verdigris-500/30"
                  : "border-border bg-card"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{cfg.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {cfg.iterations}x
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-mono">{cfg.workers}w</span>
                <span className="text-border">|</span>
                <span className="truncate">{cfg.description}</span>
              </div>
              {mode === key && (
                <div className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-verdigris-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cost Estimator ── */}
      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Cost Estimate
            </div>
            {estimateLoading && (
              <div className="h-3 w-3 rounded-full border-2 border-verdigris-500 border-t-transparent animate-spin" />
            )}
          </div>

          {estimate && !estimateLoading ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-2xl font-semibold text-foreground">
                  ${estimate.totalEstimatedCostUsd.toFixed(2)}
                </span>
                <span className="text-sm text-muted-foreground">estimated</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground font-mono">
                <span>{estimate.iterations} iteration{estimate.iterations !== 1 ? 's' : ''}</span>
                <span className="text-border">|</span>
                <span>${estimate.perSimCostUsd.toFixed(3)}/sim</span>
                <span className="text-border">|</span>
                <span>{estimate.perSimCalls} calls/sim</span>
                <span className="text-border">|</span>
                <span>{estimate.model}</span>
              </div>
            </div>
          ) : (
            !estimateLoading && (
              <div className="mt-2 font-mono text-sm text-muted-foreground">
                -- calculating --
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* ── Cost Limit ── */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Hard Cost Limit (USD)
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">$</span>
          <Input
            type="number"
            min={0.5}
            step={0.5}
            value={costLimit}
            onChange={(e) => setCostLimit(Number(e.target.value))}
            className="w-28 font-mono"
          />
          {estimate && costLimit < estimate.totalEstimatedCostUsd && (
            <Badge variant="destructive" className="text-[11px]">
              Below estimate
            </Badge>
          )}
        </div>
      </div>

      {/* ── Test Gate Warning ── */}
      {needsTestGate && (
        <div className="flex items-center gap-2 rounded-lg border border-tuscan-sun-300 bg-tuscan-sun-50 px-3 py-2">
          <Badge
            variant="outline"
            className="border-tuscan-sun-400 bg-tuscan-sun-100 text-tuscan-sun-700 text-[11px]"
          >
            No test run
          </Badge>
          <span className="text-xs text-tuscan-sun-700">
            Run a test batch first to validate config and measure per-sim cost before launching{" "}
            {MODE_CONFIG[mode].iterations} iteration{MODE_CONFIG[mode].iterations !== 1 ? 's' : ''}.
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-burnt-peach-300 bg-burnt-peach-50 px-3 py-2 text-xs text-burnt-peach-700">
          {error}
        </div>
      )}

      {/* ── Launch Button + Confirmation ── */}
      <div className="flex items-center justify-end gap-3">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                disabled={!estimate || estimateLoading || launching}
                className={cn(
                  "bg-verdigris-600 text-white hover:bg-verdigris-700",
                  "disabled:bg-verdigris-300 disabled:text-verdigris-100"
                )}
              >
                {launching ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Launching...
                  </span>
                ) : (
                  `Launch ${MODE_CONFIG[mode].label} Batch`
                )}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Launch {MODE_CONFIG[mode].iterations} simulations?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <span className="block font-mono text-sm">
                  Estimated cost:{" "}
                  <strong>${estimate?.totalEstimatedCostUsd.toFixed(2) ?? "..."}</strong>
                </span>
                <span className="block font-mono text-sm mt-1">
                  Hard limit:{" "}
                  <strong>${costLimit.toFixed(2)}</strong>
                </span>
                {needsTestGate && (
                  <span className="block text-tuscan-sun-600 text-xs mt-2">
                    Warning: No test batch has been completed for this config.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLaunch}
                className="bg-verdigris-600 text-white hover:bg-verdigris-700"
              >
                Confirm Launch
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
