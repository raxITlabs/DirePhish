"use client";

import type { ExerciseReport } from "@/app/actions/report";

interface Props {
  report: ExerciseReport;
}

function fmt(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function CostView({ report }: Props) {
  const costs = report.costs;

  if (!costs || costs.totalUsd === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card p-8 text-center">
        <p className="text-sm text-foreground/60">No cost data available for this report.</p>
      </div>
    );
  }

  const breakdown = costs.breakdown ?? [];
  const maxPhaseUsd = Math.max(...breakdown.map((b) => b.usd), 0.001);
  const svc = costs.serviceBreakdown;
  const cacheRate =
    costs.totalInputTokens > 0
      ? Math.round((costs.totalCachedTokens / costs.totalInputTokens) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* 1. Total cost */}
      <div className="rounded-lg border border-border/40 bg-card p-4">
        <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-2">
          Total Pipeline Cost
        </p>
        <p className="text-4xl font-bold font-mono text-foreground">
          {fmt(costs.totalUsd)}
        </p>
        {costs.model && (
          <p className="text-xs text-foreground/50 mt-1">
            Primary model: {costs.model}
          </p>
        )}
      </div>

      {/* 2. Service breakdown */}
      {svc && (
        <div className="rounded-lg border border-border/40 bg-card p-4">
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-3">
            Cost by Service
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-mono text-foreground/50">LLM Inference</p>
              <p className="text-xl font-bold font-mono text-foreground mt-0.5">
                {fmt(svc.llm.usd)}
              </p>
              <p className="text-[11px] text-foreground/50 mt-0.5">
                {fmtTokens(svc.llm.inputTokens)} in / {fmtTokens(svc.llm.outputTokens)} out
              </p>
            </div>
            <div>
              <p className="text-xs font-mono text-foreground/50">Search Grounding</p>
              <p className="text-xl font-bold font-mono text-foreground mt-0.5">
                {fmt(svc.searchGrounding.usd)}
              </p>
              <p className="text-[11px] text-foreground/50 mt-0.5">
                {svc.searchGrounding.queries} queries
              </p>
            </div>
            <div>
              <p className="text-xs font-mono text-foreground/50">Embeddings</p>
              <p className="text-xl font-bold font-mono text-foreground mt-0.5">
                {fmt(svc.embedding.usd)}
              </p>
              <p className="text-[11px] text-foreground/50 mt-0.5">
                {fmtTokens(svc.embedding.tokens)} tokens
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Phase breakdown */}
      {breakdown.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-card p-4">
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-3">
            Cost by Phase
          </p>
          <div className="space-y-2.5">
            {[...breakdown]
              .sort((a, b) => b.usd - a.usd)
              .map((phase) => (
                <div key={phase.phase}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground/80">{phase.phase}</span>
                    <span className="text-xs font-mono font-semibold text-foreground">
                      {fmt(phase.usd)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-verdigris-500 rounded-full transition-all"
                      style={{ width: `${(phase.usd / maxPhaseUsd) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-4 mt-1">
                    <span className="text-[10px] text-foreground/40">
                      {fmtTokens(phase.inputTokens)} in
                    </span>
                    <span className="text-[10px] text-foreground/40">
                      {fmtTokens(phase.outputTokens)} out
                    </span>
                    {phase.cachedTokens > 0 && (
                      <span className="text-[10px] text-foreground/40">
                        {fmtTokens(phase.cachedTokens)} cached
                      </span>
                    )}
                    {phase.searchQueries > 0 && (
                      <span className="text-[10px] text-foreground/40">
                        {phase.searchQueries} searches
                      </span>
                    )}
                    {phase.embeddingTokens > 0 && (
                      <span className="text-[10px] text-foreground/40">
                        {fmtTokens(phase.embeddingTokens)} embed
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 4. Token summary */}
      <div className="rounded-lg border border-border/40 bg-card p-4">
        <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-3">
          Token Summary
        </p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-mono text-foreground/50">Input</p>
            <p className="text-lg font-bold font-mono text-foreground">
              {fmtTokens(costs.totalInputTokens)}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono text-foreground/50">Output</p>
            <p className="text-lg font-bold font-mono text-foreground">
              {fmtTokens(costs.totalOutputTokens)}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono text-foreground/50">Cached</p>
            <p className="text-lg font-bold font-mono text-foreground">
              {fmtTokens(costs.totalCachedTokens)}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono text-foreground/50">Cache Rate</p>
            <p className={`text-lg font-bold font-mono ${cacheRate >= 30 ? "text-verdigris-600" : "text-foreground"}`}>
              {cacheRate}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
