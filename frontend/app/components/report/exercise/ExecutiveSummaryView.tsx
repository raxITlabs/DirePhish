"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import {
  Shield,
  AlertTriangle as AlertIcon,
  Clock,
  TrendingUp,
} from "lucide-react";
import type { ExerciseReport } from "@/app/actions/report";
import OutcomeDistributionBar from "./OutcomeDistributionBar";
import ReadinessGauge from "./ReadinessGauge";
import StressTestResults from "./StressTestResults";

interface Props {
  report: ExerciseReport;
}

export default function ExecutiveSummaryView({ report }: Props) {
  const mc = report.monteCarloStats;
  const resilience = report.resilience;
  const stressResults = report.stressTestResults;
  const topDivergence = mc?.decision_divergence_points?.[0];
  const actions = report.conclusions?.actionItems ?? [];
  const rootCauses = report.rootCauseAnalysis ?? [];
  const heatmapData = report.teamPerformance?.heatmapData ?? [];
  const agentConsistency = mc?.agent_consistency ?? {};
  const cf = report.counterfactualComparison;

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
  const escalatedPct =
    mc && totalOutcomes > 0
      ? Math.round((mc.outcome_distribution.escalated / totalOutcomes) * 100)
      : null;
  const meanResponse = mc?.containment_round_stats
    ? `${mc.containment_round_stats.mean.toFixed(1)} (σ ${mc.containment_round_stats.std.toFixed(1)})`
    : null;

  return (
    <div className="space-y-6">
      {/* 1. Executive Summary — the narrative leads */}
      {report.executiveSummary && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-pitch-black-600 mb-3">
              Executive Summary
            </p>
            <div className="text-sm text-pitch-black-700 leading-relaxed space-y-3">
              {report.executiveSummary.split("\n").filter(Boolean).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. KPIs — compact metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKPI
          icon={Shield}
          label="Containment"
          value={containedPct !== null ? `${containedPct}%` : "—"}
          color={
            containedPct !== null
              ? containedPct >= 70
                ? "text-verdigris-700"
                : containedPct >= 40
                  ? "text-tuscan-sun-700"
                  : "text-burnt-peach-700"
              : ""
          }
        />
        <MiniKPI
          icon={AlertIcon}
          label="Escalation"
          value={escalatedPct !== null ? `${escalatedPct}%` : "—"}
          color={
            escalatedPct !== null
              ? escalatedPct <= 10
                ? "text-verdigris-700"
                : "text-burnt-peach-700"
              : ""
          }
        />
        <MiniKPI
          icon={Clock}
          label="Avg Response"
          value={meanResponse ?? "—"}
          sublabel="rounds"
        />
        <MiniKPI
          icon={TrendingUp}
          label="Readiness"
          value={resilience ? `${Math.round(resilience.overall)}` : "—"}
          sublabel="/100"
          color={
            resilience
              ? resilience.overall >= 70
                ? "text-verdigris-700"
                : resilience.overall >= 40
                  ? "text-tuscan-sun-700"
                  : "text-burnt-peach-700"
              : ""
          }
        />
      </div>

      {/* 2.5. Risk Score + FAIR — inline from report data */}
      {report.riskScore && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full border-[3px] flex items-center justify-center text-lg font-bold shrink-0 ${
                report.riskScore.composite_score < 40
                  ? "border-verdigris-400 text-verdigris-600"
                  : report.riskScore.composite_score < 70
                    ? "border-tuscan-sun-400 text-tuscan-sun-600"
                    : "border-burnt-peach-400 text-burnt-peach-600"
              }`}>
                {report.riskScore.composite_score.toFixed(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {report.riskScore.interpretation?.label || "Risk Score"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {report.riskScore.interpretation?.description || ""}
                </p>
              </div>
              {report.riskScore.fair_estimates && (
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">Est. Annual Loss</p>
                  <p className="text-sm font-mono font-semibold text-foreground">
                    ${(report.riskScore.fair_estimates.ale || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">
                    ${(report.riskScore.fair_estimates.p10_loss || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} — ${(report.riskScore.fair_estimates.p90_loss || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} range
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Outcome Distribution + Readiness side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {mc && (
          <Card>
            <CardContent className="p-5">
              <OutcomeDistributionBar distribution={mc.outcome_distribution} />
              <p className="text-xs text-pitch-black-400 mt-2">
                Based on {mc.iteration_count} simulation variations
              </p>
            </CardContent>
          </Card>
        )}
        {resilience && (
          <Card>
            <CardContent className="p-5">
              <ReadinessGauge resilience={resilience} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* 4. Highest-Impact Decision */}
      {topDivergence && (
        <Card className="ring-1 ring-tuscan-sun-200 bg-tuscan-sun-50">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-tuscan-sun-200 flex items-center justify-center shrink-0">
                <AlertIcon size={16} className="text-tuscan-sun-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-tuscan-sun-900">
                  Highest-Impact Decision Point
                </p>
                <p className="text-sm text-tuscan-sun-800 mt-1">
                  Round {topDivergence.round} —{" "}
                  <strong>{topDivergence.agent}</strong> made a decision that
                  changed outcomes across{" "}
                  {Math.round(topDivergence.divergence_score * 25)}% of
                  simulations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Priority Actions (all, not sliced) */}
      {actions.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-pitch-black-600">
              Priority Actions
            </p>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl bg-pitch-black-50 ring-1 ring-foreground/10"
                >
                  <span
                    className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      i === 0
                        ? "bg-burnt-peach-500"
                        : i === 1
                          ? "bg-tuscan-sun-500"
                          : "bg-verdigris-500"
                    }`}
                  >
                    {a.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-pitch-black-800">
                      {a.action}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-pitch-black-500">
                      <span>{a.suggestedOwner}</span>
                      <span>{a.suggestedTimeline}</span>
                      <Badge
                        variant="outline"
                        className={
                          a.investmentLevel === "High"
                            ? "bg-burnt-peach-50 text-burnt-peach-700 border-burnt-peach-200"
                            : a.investmentLevel === "Medium"
                              ? "bg-tuscan-sun-50 text-tuscan-sun-700 border-tuscan-sun-200"
                              : "bg-verdigris-50 text-verdigris-700 border-verdigris-200"
                        }
                      >
                        {a.investmentLevel}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. Root Cause Analysis (from CISO — unique) */}
      {rootCauses.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-pitch-black-600">
              Root Cause Analysis
            </p>
            {rootCauses.map((rc, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-pitch-black-50 ring-1 ring-foreground/10 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-pitch-black-800">
                    {rc.issue}
                  </p>
                  <Badge
                    variant="outline"
                    className={
                      rc.severity === "critical"
                        ? "bg-burnt-peach-50 text-burnt-peach-700 border-burnt-peach-200"
                        : rc.severity === "high"
                          ? "bg-tuscan-sun-50 text-tuscan-sun-700 border-tuscan-sun-200"
                          : "bg-pitch-black-50 text-pitch-black-600 border-pitch-black-200"
                    }
                  >
                    {rc.severity}
                  </Badge>
                </div>
                {rc.fiveWhys && rc.fiveWhys.length > 0 && (
                  <div className="pl-3 border-l-2 border-pitch-black-100 space-y-1.5">
                    {rc.fiveWhys.slice(0, 3).map((w, wi) => (
                      <div key={wi}>
                        <p className="text-[11px] text-pitch-black-400">
                          Why {w.level}: {w.question}
                        </p>
                        <p className="text-xs text-pitch-black-600">
                          {w.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-pitch-black-500">
                  Root cause: {rc.rootCause}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 7. Stress Test Results (full, from CISO) */}
      {stressResults && stressResults.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <StressTestResults results={stressResults} mode="full" />
          </CardContent>
        </Card>
      )}

      {/* 8. Counterfactual Comparison (from CISO — unique) */}
      {cf && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-pitch-black-600">
              Counterfactual Comparison
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-royal-azure-50 ring-1 ring-royal-azure-200">
                <p className="text-[10px] font-mono uppercase text-royal-azure-600 mb-1">
                  Original
                </p>
                <p className="text-lg font-bold text-royal-azure-700">
                  {cf.original.containment_round ?? "—"}{" "}
                  <span className="text-xs font-normal">rounds</span>
                </p>
                <p className="text-xs text-royal-azure-600">
                  {cf.original.total_actions} actions
                </p>
              </div>
              {cf.branches.map((branch, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-tuscan-sun-50 ring-1 ring-tuscan-sun-200"
                >
                  <p className="text-[10px] font-mono uppercase text-tuscan-sun-600 mb-1">
                    Alternate {i + 1}
                  </p>
                  <p className="text-lg font-bold text-tuscan-sun-700">
                    {branch.containment_round ?? "—"}{" "}
                    <span className="text-xs font-normal">rounds</span>
                  </p>
                  <p className="text-xs text-tuscan-sun-600">
                    {branch.total_actions} actions
                  </p>
                </div>
              ))}
            </div>
            {cf.divergence_summary && (
              <p className="text-xs text-pitch-black-500 leading-relaxed">
                {cf.divergence_summary}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniKPI({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  sublabel?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-pitch-black-500 mb-1">
          <Icon size={14} />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${color ?? "text-pitch-black-800"}`}>
          {value}
          {sublabel && (
            <span className="text-sm font-normal text-pitch-black-400 ml-0.5">
              {sublabel}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
