"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/layout/Header";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import type {
  MonteCarloBatchStatus,
  IterationResult,
  BatchAggregation,
} from "@/app/types/monte-carlo";
import {
  getMonteCarloBatchStatus,
  getMonteCarloBatchResults,
  stopMonteCarloBatch,
} from "@/app/actions/monte-carlo";

// ── Polling hook ──

function useMonteCarloPolling(batchId: string) {
  const [batch, setBatch] = useState<MonteCarloBatchStatus | null>(null);
  const [iterations, setIterations] = useState<IterationResult[]>([]);
  const [aggregation, setAggregation] = useState<BatchAggregation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    const batchRes = await getMonteCarloBatchStatus(batchId);
    if ("error" in batchRes) {
      setError(batchRes.error);
      return;
    }
    setBatch(batchRes.data);

    // Fetch results (iterations + aggregation) when there's progress or completion
    if (batchRes.data.iterationsCompleted > 0) {
      const resultsRes = await getMonteCarloBatchResults(batchId);
      if ("data" in resultsRes) {
        setIterations(resultsRes.data.iterations);
        if (
          batchRes.data.status === "completed" ||
          batchRes.data.status === "cost_exceeded" ||
          batchRes.data.status === "stopped"
        ) {
          setAggregation(resultsRes.data.aggregation);
        }
      }
    }
  }, [batchId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Poll every 3s while running
  useEffect(() => {
    if (!batch || (batch.status !== "running" && batch.status !== "pending")) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(fetchAll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [batch?.status, fetchAll]);

  return { batch, iterations, aggregation, error, refetch: fetchAll };
}

// ── Helpers ──

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function costColor(spent: number, limit: number): string {
  const pct = limit > 0 ? spent / limit : 0;
  if (pct > 0.8) return "text-burnt-peach-500";
  if (pct > 0.5) return "text-tuscan-sun-500";
  return "text-verdigris-500";
}

function statusBadgeVariant(
  status: MonteCarloBatchStatus["status"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "running":
    case "pending":
      return "secondary";
    case "completed":
      return "default";
    case "failed":
      return "destructive";
    case "cost_exceeded":
    case "stopped":
      return "outline";
    default:
      return "secondary";
  }
}

function statusDotClass(
  status: string
): string {
  switch (status) {
    case "pending":
      return "bg-pitch-black-300";
    case "running":
      return "bg-verdigris-500 animate-pulse-dot";
    case "completed":
      return "bg-verdigris-600";
    case "failed":
      return "bg-burnt-peach-500";
    default:
      return "bg-pitch-black-300";
  }
}

// ── Page ──

export default function BatchDashboardPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = use(params);
  const router = useRouter();
  const { batch, iterations, aggregation, error, refetch } = useMonteCarloPolling(batchId);
  const [elapsed, setElapsed] = useState("--");

  // Tick elapsed timer
  useEffect(() => {
    if (!batch?.startedAt) return;
    const tick = () => setElapsed(formatElapsed(batch.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [batch?.startedAt]);

  const handleStop = async () => {
    await stopMonteCarloBatch(batchId);
    refetch();
  };

  const isRunning = batch?.status === "running" || batch?.status === "pending";
  const isDone = batch?.status === "completed" || batch?.status === "cost_exceeded" || batch?.status === "stopped";
  const progressPct = batch ? batch.progressPct : 0;

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Batches", href: "/" },
              { label: batchId },
            ]}
          />
          <code className="text-xs text-muted-foreground font-mono">
            {batchId.slice(0, 12)}
          </code>
        </div>
        <div className="flex items-center gap-3">
          {batch && (
            <>
              <Badge variant="outline" className="font-mono text-[11px]">
                {batch.mode}
              </Badge>
              <Badge variant={statusBadgeVariant(batch.status)}>
                {batch.status}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {elapsed}
              </span>
            </>
          )}
          {isRunning && (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              Stop
            </Button>
          )}
          {isDone && (
            <Button
              size="sm"
              onClick={() => router.push(`/report/${batchId}`)}
            >
              View Report
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-burnt-peach-300 bg-burnt-peach-50 px-3 py-2 text-xs text-burnt-peach-700">
          {error}
        </div>
      )}

      {/* ── Live Cost Counter ── */}
      {batch && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-3xl font-semibold tabular-nums",
                costColor(batch.costSoFar, batch.costLimit)
              )}
            >
              ${batch.costSoFar.toFixed(4)}
            </span>
            <span className="font-mono text-sm text-muted-foreground">
              / ${batch.costLimit.toFixed(2)} limit
            </span>
          </div>

          {/* ── Progress Bar ── */}
          <div className="mt-3 relative h-1.5 w-full rounded-full bg-pitch-black-100 overflow-hidden">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                isRunning ? "bg-verdigris-500" : isDone ? "bg-verdigris-600" : "bg-pitch-black-300"
              )}
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
            {isRunning && (
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_ease-in-out_infinite]"
                style={{
                  width: `${Math.min(progressPct, 100)}%`,
                  backgroundSize: "200% 100%",
                }}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between text-[11px] font-mono text-muted-foreground">
            <span>
              {batch.iterationsCompleted}/{batch.iterationsTotal} completed
              {batch.iterationsFailed > 0 && (
                <span className="text-burnt-peach-500 ml-1">
                  ({batch.iterationsFailed} failed)
                </span>
              )}
            </span>
            <span>{progressPct.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* ── Iteration Grid ── */}
      <div className="flex-1 overflow-auto px-4 pt-2 pb-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Iterations
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
          {batch &&
            Array.from({ length: batch.iterationsTotal }, (_, i) => {
              const iter = iterations[i] ?? undefined;
              const completed = iter !== undefined;
              const running = !completed && isRunning && i <= batch.iterationsCompleted;
              const status = completed
                ? "completed"
                : running
                  ? "running"
                  : "pending";

              return (
                <Card
                  key={i}
                  size="sm"
                  className={cn(
                    "h-16 cursor-default",
                    status === "completed" && "border-verdigris-200",
                    status === "running" && "border-verdigris-400"
                  )}
                >
                  <CardContent className="flex flex-col justify-between h-full py-1.5 px-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        #{i + 1}
                      </span>
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          statusDotClass(status)
                        )}
                      />
                    </div>
                    {completed && iter ? (
                      <div className="space-y-0.5">
                        <div className="font-mono text-[11px] text-foreground">
                          ${iter.costUsd.toFixed(3)}
                        </div>
                        <div
                          className="text-[10px] text-muted-foreground truncate"
                          title={iter.variationDescription}
                        >
                          {iter.variationDescription}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground">
                        {status === "running" ? "running..." : "pending"}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>

        {/* ── Stats Panel (completed) ── */}
        {aggregation && isDone && (
          <div className="mt-6 space-y-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Aggregated Results
            </div>

            {/* Outcome Distribution */}
            <Card size="sm">
              <CardContent>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Outcome Distribution
                </div>
                <div className="flex h-5 w-full rounded overflow-hidden">
                  {Object.entries(aggregation.outcomeDistribution).map(
                    ([outcome, count], idx) => {
                      const total = Object.values(
                        aggregation.outcomeDistribution
                      ).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? (count / total) * 100 : 0;
                      const colors = [
                        "bg-verdigris-500",
                        "bg-tuscan-sun-500",
                        "bg-burnt-peach-500",
                        "bg-royal-azure-500",
                        "bg-sandy-brown-500",
                      ];
                      return (
                        <div
                          key={outcome}
                          className={cn(colors[idx % colors.length])}
                          style={{ width: `${pct}%` }}
                          title={`${outcome}: ${count} (${pct.toFixed(0)}%)`}
                        />
                      );
                    }
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {Object.entries(aggregation.outcomeDistribution).map(
                    ([outcome, count], idx) => {
                      const colors = [
                        "bg-verdigris-500",
                        "bg-tuscan-sun-500",
                        "bg-burnt-peach-500",
                        "bg-royal-azure-500",
                        "bg-sandy-brown-500",
                      ];
                      return (
                        <div
                          key={outcome}
                          className="flex items-center gap-1 text-[11px]"
                        >
                          <div
                            className={cn(
                              "h-2 w-2 rounded-sm",
                              colors[idx % colors.length]
                            )}
                          />
                          <span className="text-muted-foreground">
                            {outcome}
                          </span>
                          <span className="font-mono text-foreground">
                            {count}
                          </span>
                        </div>
                      );
                    }
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Containment Round Stats */}
            <Card size="sm">
              <CardContent>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Containment Round
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    {
                      label: "Mean",
                      value: aggregation.containmentRoundStats.mean.toFixed(1),
                    },
                    {
                      label: "Median",
                      value: aggregation.containmentRoundStats.median.toFixed(1),
                    },
                    {
                      label: "Std",
                      value: `\u00B1${aggregation.containmentRoundStats.std.toFixed(1)}`,
                    },
                    {
                      label: "Min",
                      value: String(aggregation.containmentRoundStats.min),
                    },
                    {
                      label: "Max",
                      value: String(aggregation.containmentRoundStats.max),
                    },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center">
                      <div className="font-mono text-lg font-semibold text-foreground">
                        {stat.value}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Cost Summary */}
            <Card size="sm">
              <CardContent>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Cost Summary
                </div>
                <div className="grid grid-cols-4 gap-3 font-mono text-sm">
                  <div>
                    <div className="text-foreground font-semibold">
                      ${aggregation.costSummary.totalUsd.toFixed(2)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Total
                    </div>
                  </div>
                  <div>
                    <div className="text-foreground font-semibold">
                      ${aggregation.costSummary.averageUsd.toFixed(3)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Avg
                    </div>
                  </div>
                  <div>
                    <div className="text-foreground font-semibold">
                      ${aggregation.costSummary.minUsd.toFixed(3)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Min
                    </div>
                  </div>
                  <div>
                    <div className="text-foreground font-semibold">
                      ${aggregation.costSummary.maxUsd.toFixed(3)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Max
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cost Extrapolation (test mode) */}
            {aggregation.costExtrapolation && (
              <Card size="sm">
                <CardContent>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Cost Extrapolation
                  </div>
                  <div className="grid grid-cols-3 gap-3 font-mono text-sm">
                    {Object.entries(aggregation.costExtrapolation).map(
                      ([mode, cost]) => (
                        <div key={mode}>
                          <div className="text-foreground font-semibold">
                            ${cost.toFixed(2)}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {mode}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
