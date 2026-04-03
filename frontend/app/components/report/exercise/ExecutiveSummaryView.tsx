"use client";

import type { ExerciseReport } from "@/app/actions/report";
import RiskScoreRing from "./RiskScoreRing";
import ScoreDimensions from "./ScoreDimensions";
import RiskDrivers from "./RiskDrivers";

interface Props {
  report: ExerciseReport;
}

function formatDollars(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function dimLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function ExecutiveSummaryView({ report }: Props) {
  const mc = report.monteCarloStats;
  const actions = report.conclusions?.actionItems ?? [];
  const rootCauses = report.rootCauseAnalysis ?? [];
  const cf = report.counterfactualComparison;
  const rs = report.riskScore;

  const totalOutcomes = mc
    ? Object.values(mc.outcome_distribution).reduce((a, b) => a + b, 0)
    : 0;
  const containedPct =
    mc && totalOutcomes > 0
      ? Math.round(
          ((mc.outcome_distribution.contained_early +
            mc.outcome_distribution.contained_late) /
            totalOutcomes) *
            100,
        )
      : null;

  // Find weakest and strongest dimensions
  const dims = rs?.dimensions ? Object.entries(rs.dimensions) as [string, number][] : [];
  const sortedDims = [...dims].sort((a, b) => a[1] - b[1]);
  const topDims = sortedDims.length > 3 ? [sortedDims[0], sortedDims[1], sortedDims[sortedDims.length - 1]] : sortedDims;

  return (
    <div className="space-y-5">
      {/* 1. Executive Summary */}
      {report.executiveSummary && (
        <div className="pb-5 border-b border-border/30">
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-3">
            Executive Summary
          </p>
          <div className="text-sm text-foreground leading-relaxed space-y-3 max-w-3xl">
            {report.executiveSummary.split("\n").filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      )}

      {/* 2. Three key numbers */}
      <div className="grid grid-cols-3 gap-4 pb-5 border-b border-border/30">
        <div>
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider">Risk Score</p>
          <p className={`text-3xl font-bold font-mono mt-1 ${
            rs ? (rs.composite_score >= 70 ? "text-verdigris-600" : rs.composite_score >= 40 ? "text-foreground" : "text-burnt-peach-600") : "text-foreground"
          }`}>
            {rs ? rs.composite_score.toFixed(0) : "—"}
            <span className="text-sm font-normal text-foreground/40">/100</span>
          </p>
          {rs?.interpretation && (
            <p className="text-xs text-foreground/60 mt-0.5">{rs.interpretation.label}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider">Annual Exposure</p>
          <p className="text-3xl font-bold font-mono mt-1 text-foreground">
            {rs?.fair_estimates ? formatDollars(rs.fair_estimates.ale) : "—"}
          </p>
          {rs?.fair_estimates && (
            <p className="text-xs text-foreground/60 mt-0.5">
              {formatDollars(rs.fair_estimates.p10_loss)} to {formatDollars(rs.fair_estimates.p90_loss)} range
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider">Containment</p>
          <p className={`text-3xl font-bold font-mono mt-1 ${
            containedPct !== null ? (containedPct >= 70 ? "text-verdigris-600" : "text-burnt-peach-600") : "text-foreground"
          }`}>
            {containedPct !== null ? `${containedPct}%` : "—"}
          </p>
          <p className="text-xs text-foreground/60 mt-0.5">
            {mc ? `across ${mc.iteration_count} variations` : ""}
          </p>
        </div>
      </div>

      {/* 3. Cost breakdown */}
      {rs?.fair_estimates && rs.fair_estimates.ale > 0 && (
        <div className="pb-5 border-b border-border/30">
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-2">
            What Drives This Cost
          </p>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
            <CostLine label="Team response time" detail={`${rs.fair_estimates.calibration_inputs?.team_size || 8} responders pulled from normal work`} />
            <CostLine label="Business disruption" detail="Systems isolated, deployments frozen during incident" />
            <CostLine label="IR mobilization" detail={`${Math.round((rs.fair_estimates.calibration_inputs?.incident_response_retainer || 250000) * 0.1 / 1000)}K of retainer activated`} />
            <CostLine label="Post-incident work" detail="Forensics, policy updates, lessons learned" />
          </div>
        </div>
      )}

      {/* 4. Key dimensions — top 3 */}
      {topDims.length > 0 && (
        <div className="pb-5 border-b border-border/30">
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-3">
            Key Dimensions
          </p>
          <div className="space-y-2.5">
            {topDims.map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-foreground/80 w-48">{dimLabel(key)}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${value >= 70 ? "bg-verdigris-500" : value >= 40 ? "bg-tuscan-sun-400" : "bg-burnt-peach-500"}`}
                    style={{ width: `${Math.min(value, 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-mono font-semibold w-9 text-right ${value >= 70 ? "text-verdigris-600" : value >= 40 ? "text-foreground/70" : "text-burnt-peach-600"}`}>
                  {value.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Priority Actions — max 3 */}
      {actions.length > 0 && (
        <div className="pb-5 border-b border-border/30">
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-3">
            Priority Actions
          </p>
          <div className="space-y-2">
            {actions.slice(0, 3).map((a, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground/70 shrink-0 mt-0.5">
                  {a.priority}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{a.action}</p>
                  <p className="text-xs text-foreground/60 mt-0.5">
                    {a.suggestedOwner} · {a.suggestedTimeline}
                  </p>
                </div>
              </div>
            ))}
            {actions.length > 3 && (
              <p className="text-xs text-foreground/50 pl-8">
                +{actions.length - 3} more in full report
              </p>
            )}
          </div>
        </div>
      )}

      {/* 6. Root Causes — max 3 */}
      {rootCauses.length > 0 && (
        <div className="pb-5 border-b border-border/30">
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-3">
            Root Causes
          </p>
          <div className="space-y-2">
            {rootCauses.slice(0, 3).map((rc, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-1">
                <p className="text-sm text-foreground flex-1">{rc.issue}</p>
                <span className={`text-xs font-mono shrink-0 ${
                  rc.severity === "critical" ? "text-burnt-peach-600 font-semibold" : "text-foreground/60"
                }`}>
                  {rc.severity}
                </span>
              </div>
            ))}
            {rootCauses.length > 3 && (
              <p className="text-xs text-foreground/50">
                +{rootCauses.length - 3} more in full report
              </p>
            )}
          </div>
        </div>
      )}

      {/* 7. Counterfactual */}
      {cf && (
        <div>
          <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider mb-2">
            What-If Comparison
          </p>
          <div className="flex items-baseline gap-4 text-sm">
            <span className="text-foreground">
              Original: <strong>{cf.original.containment_round ?? "—"} rounds</strong>, {cf.original.total_actions} actions
            </span>
            {cf.branches.map((branch, i) => (
              <span key={i} className="text-foreground/70">
                Alternate {i + 1}: <strong>{branch.containment_round ?? "—"} rounds</strong>, {branch.total_actions} actions
              </span>
            ))}
          </div>
          {cf.divergence_summary && (
            <p className="text-xs text-foreground/60 mt-1.5 leading-relaxed max-w-3xl">
              {cf.divergence_summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CostLine({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-foreground/80 font-medium">{label}</span>
      <span className="text-xs text-foreground/60">{detail}</span>
    </div>
  );
}
