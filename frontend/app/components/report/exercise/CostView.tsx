"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { AsciiSectionHeader, AsciiMetric, AsciiEmptyState, AsciiProgressBar } from "@/app/components/ascii/DesignSystem";
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
      <AsciiEmptyState
        title="No cost data available"
        description="Cost data will appear after the pipeline completes."
        sigil="$"
      />
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
      <Card>
        <CardContent>
          <AsciiSectionHeader as="h3" sigil="$">Total Pipeline Cost</AsciiSectionHeader>
          <p className="text-4xl font-bold font-mono text-foreground">
            {fmt(costs.totalUsd)}
          </p>
          {costs.model && (
            <p className="text-xs text-foreground/50 mt-1">
              Primary model: {costs.model}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. Service breakdown */}
      {svc && (
        <Card>
          <CardContent>
            <AsciiSectionHeader as="h4" sigil="»">Cost by Service</AsciiSectionHeader>
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
          </CardContent>
        </Card>
      )}

      {/* 3. Phase breakdown */}
      {breakdown.length > 0 && (
        <Card>
          <CardContent>
            <AsciiSectionHeader as="h4" sigil="»">Cost by Phase</AsciiSectionHeader>
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
          </CardContent>
        </Card>
      )}

      {/* 4. Token summary */}
      <Card>
        <CardContent>
          <AsciiSectionHeader as="h4" sigil="»">Token Summary</AsciiSectionHeader>
          <div className="space-y-1.5 mt-3">
            <AsciiMetric label="Input" value={fmtTokens(costs.totalInputTokens)} />
            <AsciiMetric label="Output" value={fmtTokens(costs.totalOutputTokens)} />
            <AsciiMetric label="Cached" value={fmtTokens(costs.totalCachedTokens)} />
            <AsciiMetric label="Cache Rate" value={`${cacheRate}%`} valueColor={cacheRate >= 30 ? "text-verdigris-600" : "text-foreground"} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
