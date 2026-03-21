"use client";

import type { SimulationStatus, AgentAction, GraphData } from "@/app/types";

interface SimulationLivePanelProps {
  simStatus: SimulationStatus | null;
  simActions: AgentAction[];
  graphData: GraphData;
  activeSimIndex: number;
  totalSims: number;
  error: string | null;
}

export default function SimulationLivePanel({
  simStatus,
  simActions,
  graphData,
  activeSimIndex,
  totalSims,
  error,
}: SimulationLivePanelProps) {
  const isRunning = simStatus?.status === "running" || simStatus?.status === "starting";

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 gap-3">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive shrink-0">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Simulation {activeSimIndex + 1} of {totalSims}
          </span>
          {isRunning && (
            <span className="text-xs text-primary font-semibold flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold font-mono">{simStatus?.currentRound || 0}</div>
            <div className="text-[10px] text-muted-foreground">
              of {simStatus?.totalRounds || "?"} rounds
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono">{graphData.nodes.length}</div>
            <div className="text-[10px] text-muted-foreground">nodes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono">{graphData.edges.length}</div>
            <div className="text-[10px] text-muted-foreground">edges</div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-lg border border-border bg-card flex flex-col">
        <div className="px-4 py-2 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Action Feed
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {simActions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Waiting for first action...
            </p>
          )}
          {[...simActions].reverse().map((action, i) => (
            <div
              key={`${action.round}-${action.agent}-${i}`}
              className={`text-xs p-3 rounded-md border-l-2 ${
                action.role === "red_team"
                  ? "bg-red-50 border-l-red-400 dark:bg-red-950/30"
                  : "bg-teal-50 border-l-teal-400 dark:bg-teal-950/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold ${
                  action.role === "red_team" ? "text-red-700 dark:text-red-400" : "text-teal-700 dark:text-teal-400"
                }`}>
                  {action.agent}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  Round {action.round}
                </span>
              </div>
              <p className="text-foreground">{action.action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
