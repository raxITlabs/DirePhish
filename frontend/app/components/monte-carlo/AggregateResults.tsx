"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type {
  BatchAggregation,
  MonteCarloMode,
} from "@/app/types/monte-carlo";

interface AggregateResultsProps {
  aggregation: BatchAggregation;
  iterationCount: number;
  mode: MonteCarloMode;
}

/* ── Color map for outcome categories ── */
const OUTCOME_COLORS: Record<string, { bg: string; label: string }> = {
  contained_early: {
    bg: "var(--color-verdigris-500)",
    label: "Contained Early",
  },
  contained_late: {
    bg: "var(--color-royal-azure-400)",
    label: "Contained Late",
  },
  not_contained: {
    bg: "var(--color-sandy-brown-500)",
    label: "Not Contained",
  },
  escalated: {
    bg: "var(--color-burnt-peach-500)",
    label: "Escalated",
  },
};

/* ── Helpers ── */
function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function lerp(a: string, b: string, t: number): string {
  // Interpolate between two oklch colors via t (0..1)
  // a = teal (verdigris-500), b = orange (sandy-brown-500)
  // We'll just use opacity mixing via CSS — return the appropriate one
  if (t < 0.33) return "var(--color-verdigris-500)";
  if (t < 0.66) return "var(--color-tuscan-sun-500)";
  return "var(--color-sandy-brown-500)";
}

function consistencyColor(score: number): string {
  if (score >= 0.8) return "var(--color-verdigris-500)";
  if (score >= 0.6) return "var(--color-verdigris-300)";
  if (score >= 0.4) return "var(--color-tuscan-sun-500)";
  if (score >= 0.2) return "var(--color-sandy-brown-400)";
  return "var(--color-burnt-peach-500)";
}

function consistencyBg(score: number): string {
  if (score >= 0.8) return "var(--color-verdigris-50)";
  if (score >= 0.6) return "var(--color-verdigris-100)";
  if (score >= 0.4) return "var(--color-tuscan-sun-50)";
  if (score >= 0.2) return "var(--color-sandy-brown-50)";
  return "var(--color-burnt-peach-50)";
}

/* ── Section A: Outcome Distribution ── */
function OutcomeDistribution({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  const entries = Object.entries(distribution).filter(([, v]) => v > 0);

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Outcome Distribution
      </h3>

      {/* Stacked bar */}
      <div className="flex w-full h-8 rounded-md overflow-hidden border border-border">
        {entries.map(([key, count]) => {
          const color = OUTCOME_COLORS[key]?.bg ?? "var(--color-pitch-black-300)";
          const widthPct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div
              key={key}
              className="relative h-full flex items-center justify-center transition-all"
              style={{
                width: `${widthPct}%`,
                backgroundColor: color,
                minWidth: widthPct > 0 ? "2px" : "0",
              }}
            >
              {widthPct > 12 && (
                <span className="text-[10px] font-mono font-bold text-white">
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend below */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {entries.map(([key, count]) => {
          const meta = OUTCOME_COLORS[key];
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: meta?.bg ?? "var(--color-pitch-black-300)" }}
              />
              <span className="text-xs text-muted-foreground">
                {meta?.label ?? key}
              </span>
              <span className="text-xs font-mono font-medium text-foreground">
                {count}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({pct(count, total)})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Section B: Containment Round Histogram ── */
function ContainmentHistogram({
  stats,
}: {
  stats: BatchAggregation["containmentRoundStats"];
}) {
  const SVG_W = 480;
  const SVG_H = 160;
  const PAD = { top: 12, right: 12, bottom: 28, left: 36 };
  const chartW = SVG_W - PAD.left - PAD.right;
  const chartH = SVG_H - PAD.top - PAD.bottom;

  const entries = useMemo(() => {
    return Object.entries(stats.histogram)
      .map(([round, freq]) => ({ round: Number(round), freq }))
      .sort((a, b) => a.round - b.round);
  }, [stats.histogram]);

  const maxFreq = Math.max(...entries.map((e) => e.freq), 1);
  const minRound = entries.length > 0 ? entries[0].round : 0;
  const maxRound = entries.length > 0 ? entries[entries.length - 1].round : 1;
  const roundSpan = maxRound - minRound + 1;

  const barW = Math.max(Math.min(chartW / roundSpan - 2, 28), 4);
  const barGap = (chartW - barW * roundSpan) / Math.max(roundSpan, 1);

  function xPos(round: number): number {
    return PAD.left + (round - minRound) * (barW + barGap) + barGap / 2;
  }

  function yPos(freq: number): number {
    return PAD.top + chartH - (freq / maxFreq) * chartH;
  }

  // Gradient color per bar: early rounds = teal, late = orange
  function barColor(round: number): string {
    if (roundSpan <= 1) return "var(--color-verdigris-500)";
    const t = (round - minRound) / (roundSpan - 1);
    return lerp("teal", "orange", t);
  }

  // Mean line x position
  const meanX = PAD.left + (stats.mean - minRound) * (barW + barGap) + barGap / 2 + barW / 2;

  // Std deviation shaded area
  const stdLeft = PAD.left + (stats.mean - stats.std - minRound) * (barW + barGap) + barGap / 2;
  const stdRight = PAD.left + (stats.mean + stats.std - minRound) * (barW + barGap) + barGap / 2 + barW;

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Containment Round Distribution
      </h3>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full"
        style={{ maxHeight: "180px" }}
      >
        {/* Std deviation shaded area */}
        <rect
          x={Math.max(stdLeft, PAD.left)}
          y={PAD.top}
          width={Math.max(stdRight - stdLeft, 0)}
          height={chartH}
          fill="var(--color-verdigris-100)"
          opacity={0.4}
        />

        {/* Y-axis gridlines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={PAD.left}
            y1={PAD.top + chartH - frac * chartH}
            x2={SVG_W - PAD.right}
            y2={PAD.top + chartH - frac * chartH}
            stroke="var(--color-pitch-black-200)"
            strokeWidth={0.5}
          />
        ))}

        {/* Bars */}
        {entries.map(({ round, freq }) => {
          const x = xPos(round);
          const h = (freq / maxFreq) * chartH;
          return (
            <g key={round}>
              <rect
                x={x}
                y={PAD.top + chartH - h}
                width={barW}
                height={h}
                rx={2}
                fill={barColor(round)}
                opacity={0.85}
              />
              {/* Frequency label on top if space allows */}
              {h > 14 && (
                <text
                  x={x + barW / 2}
                  y={PAD.top + chartH - h - 3}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill="var(--color-pitch-black-600)"
                >
                  {freq}
                </text>
              )}
            </g>
          );
        })}

        {/* Mean dashed line */}
        <line
          x1={meanX}
          y1={PAD.top}
          x2={meanX}
          y2={PAD.top + chartH}
          stroke="var(--color-burnt-peach-400)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text
          x={meanX + 4}
          y={PAD.top + 10}
          fontSize={9}
          fontFamily="var(--font-mono)"
          fill="var(--color-burnt-peach-500)"
        >
          {"\u03BC"}
        </text>

        {/* X-axis labels */}
        {entries.map(({ round }) => (
          <text
            key={round}
            x={xPos(round) + barW / 2}
            y={SVG_H - 4}
            textAnchor="middle"
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="var(--color-pitch-black-500)"
          >
            {round}
          </text>
        ))}

        {/* Y-axis labels */}
        {[0, 0.5, 1].map((frac) => (
          <text
            key={frac}
            x={PAD.left - 4}
            y={PAD.top + chartH - frac * chartH + 3}
            textAnchor="end"
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="var(--color-pitch-black-400)"
          >
            {Math.round(frac * maxFreq)}
          </text>
        ))}

        {/* Baseline */}
        <line
          x1={PAD.left}
          y1={PAD.top + chartH}
          x2={SVG_W - PAD.right}
          y2={PAD.top + chartH}
          stroke="var(--color-pitch-black-300)"
          strokeWidth={1}
        />
      </svg>

      {/* Stats row */}
      <div className="flex gap-4 mt-1.5 text-xs font-mono text-muted-foreground">
        <span>
          <span className="text-foreground font-medium">{"\u03BC"} = {stats.mean.toFixed(1)}</span>
        </span>
        <span>
          <span className="text-foreground font-medium">{"\u03C3"} = {stats.std.toFixed(1)}</span>
        </span>
        <span>min = {stats.min}</span>
        <span>max = {stats.max}</span>
        <span>median = {stats.median}</span>
      </div>
    </div>
  );
}

/* ── Section C: Decision Divergence Points ── */
function DivergencePoints({
  points,
}: {
  points: BatchAggregation["decisionDivergencePoints"];
}) {
  const top5 = useMemo(
    () =>
      [...points]
        .sort((a, b) => b.divergenceScore - a.divergenceScore)
        .slice(0, 5),
    [points]
  );

  if (top5.length === 0) {
    return (
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Decision Divergence Points
        </h3>
        <p className="text-xs text-muted-foreground">No divergence data available.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Decision Divergence Points
      </h3>

      <div className="relative pl-4">
        {/* Vertical timeline line */}
        <div
          className="absolute left-1 top-1 bottom-1 w-px"
          style={{ backgroundColor: "var(--color-pitch-black-300)" }}
        />

        {top5.map((pt, i) => {
          const intensity = pt.divergenceScore;
          const dotColor =
            intensity > 0.6
              ? "var(--color-burnt-peach-500)"
              : intensity > 0.3
                ? "var(--color-sandy-brown-500)"
                : "var(--color-verdigris-500)";

          const totalActions = Object.values(pt.actionDistribution).reduce(
            (s, v) => s + v,
            0
          );

          return (
            <div key={i} className="relative mb-4 last:mb-0">
              {/* Dot on timeline */}
              <div
                className="absolute -left-3 top-1.5 w-2 h-2 rounded-full"
                style={{ backgroundColor: dotColor }}
              />

              <div className="ml-2">
                {/* Header */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono font-bold text-foreground">
                    R{pt.round}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {pt.agent}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: dotColor }}>
                    {(pt.divergenceScore * 100).toFixed(0)}% divergence
                  </span>
                </div>

                {/* Divergence score bar */}
                <div className="w-full h-1.5 rounded-full bg-pitch-black-100 mb-1.5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pt.divergenceScore * 100}%`,
                      backgroundColor: dotColor,
                    }}
                  />
                </div>

                {/* Action distribution — mini horizontal stacked bar + labels */}
                <div className="flex w-full h-4 rounded-sm overflow-hidden border border-border mb-1">
                  {Object.entries(pt.actionDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .map(([action, count], j) => {
                      const w = totalActions > 0 ? (count / totalActions) * 100 : 0;
                      const colors = [
                        "var(--color-verdigris-400)",
                        "var(--color-royal-azure-300)",
                        "var(--color-tuscan-sun-400)",
                        "var(--color-sandy-brown-400)",
                        "var(--color-pitch-black-300)",
                      ];
                      return (
                        <div
                          key={action}
                          className="h-full"
                          style={{
                            width: `${w}%`,
                            backgroundColor: colors[j % colors.length],
                            minWidth: w > 0 ? "1px" : "0",
                          }}
                        />
                      );
                    })}
                </div>

                {/* Action labels */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {Object.entries(pt.actionDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .map(([action, count]) => (
                      <span key={action} className="text-[10px] text-muted-foreground font-mono">
                        {action}({pct(count, totalActions)})
                      </span>
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Section D: Agent Consistency Heatmap ── */
function AgentConsistency({
  consistency,
}: {
  consistency: Record<string, number>;
}) {
  const entries = Object.entries(consistency).sort(([, a], [, b]) => b - a);

  if (entries.length === 0) {
    return (
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Agent Consistency
        </h3>
        <p className="text-xs text-muted-foreground">No consistency data available.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Agent Consistency
      </h3>

      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(entries.length, 4)}, 1fr)` }}>
        {entries.map(([agent, score]) => (
          <div
            key={agent}
            className="rounded-md border border-border px-3 py-2 text-center transition-colors"
            style={{ backgroundColor: consistencyBg(score) }}
          >
            <div className="text-[10px] text-muted-foreground truncate mb-0.5">
              {agent}
            </div>
            <div
              className="text-sm font-mono font-bold"
              style={{ color: consistencyColor(score) }}
            >
              {(score * 100).toFixed(0)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Section E: Cost Summary ── */
function CostSummary({
  cost,
}: {
  cost: BatchAggregation["costSummary"];
}) {
  const metrics = [
    { label: "Total", value: cost.totalUsd },
    { label: "Average", value: cost.averageUsd },
    { label: "Min", value: cost.minUsd },
    { label: "Max", value: cost.maxUsd },
  ];

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Cost Summary
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-md border border-border bg-card px-3 py-2 text-center"
          >
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {m.label}
            </div>
            <div className="text-sm font-mono font-bold text-foreground mt-0.5">
              {usd(m.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Section F: Cost Extrapolation (test mode only) ── */
function CostExtrapolation({
  extrapolation,
}: {
  extrapolation: Record<string, number>;
}) {
  const entries = Object.entries(extrapolation);
  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Cost Extrapolation
      </h3>
      <div className="flex flex-wrap gap-3 text-xs font-mono">
        {entries.map(([label, cost]) => (
          <span key={label} className="text-muted-foreground">
            <span className="text-foreground font-medium">{label}</span>
            {": "}
            <span className="text-foreground">{usd(cost)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function AggregateResults({
  aggregation,
  iterationCount,
  mode,
}: AggregateResultsProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <span>Monte Carlo Analysis</span>
          <span className="text-xs font-mono font-normal text-muted-foreground">
            {iterationCount} iteration{iterationCount !== 1 ? 's' : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* A. Outcome Distribution */}
        <OutcomeDistribution
          distribution={aggregation.outcomeDistribution}
          total={iterationCount}
        />

        {/* B. Containment Round Histogram */}
        <ContainmentHistogram stats={aggregation.containmentRoundStats} />

        {/* C. Decision Divergence Points */}
        <DivergencePoints points={aggregation.decisionDivergencePoints} />

        {/* D. Agent Consistency */}
        <AgentConsistency consistency={aggregation.agentConsistency} />

        {/* E. Cost Summary */}
        <CostSummary cost={aggregation.costSummary} />

        {/* F. Cost Extrapolation (test mode) */}
        {mode === "test" && aggregation.costExtrapolation && (
          <CostExtrapolation extrapolation={aggregation.costExtrapolation} />
        )}
      </CardContent>
    </Card>
  );
}
