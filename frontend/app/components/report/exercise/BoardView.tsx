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

interface BoardViewProps {
  report: ExerciseReport;
}

export default function BoardView({ report }: BoardViewProps) {
  const mc = report.monteCarloStats;
  const resilience = report.resilience;
  const stressResults = report.stressTestResults;
  const topDivergence = mc?.decision_divergence_points?.[0];
  const actions = report.conclusions?.actionItems?.slice(0, 3) ?? [];

  // Compute hero KPIs from MC data
  const totalOutcomes = mc
    ? Object.values(mc.outcome_distribution).reduce((a, b) => a + b, 0)
    : 0;
  const containedPct = mc && totalOutcomes > 0
    ? Math.round(
        ((mc.outcome_distribution.contained_early +
          mc.outcome_distribution.contained_late) /
          totalOutcomes) *
          100,
      )
    : null;
  const escalatedPct = mc && totalOutcomes > 0
    ? Math.round((mc.outcome_distribution.escalated / totalOutcomes) * 100)
    : null;
  const meanResponse = mc?.containment_round_stats
    ? `${mc.containment_round_stats.mean.toFixed(1)} (σ ${mc.containment_round_stats.std.toFixed(1)})`
    : null;

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      {report.disclaimer && (
        <p className="text-xs text-pitch-black-400 italic leading-relaxed">
          {report.disclaimer}
        </p>
      )}

      {/* Outcome Distribution */}
      {mc && (
        <Card>
          <CardContent className="p-5">
            <OutcomeDistributionBar distribution={mc.outcome_distribution} />
            {mc.iteration_count && (
              <p className="text-xs text-pitch-black-400 mt-2">
                Based on {mc.iteration_count} simulation variations
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={Shield}
          label="Containment Rate"
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
        <KPICard
          icon={AlertIcon}
          label="Escalation Rate"
          value={escalatedPct !== null ? `${escalatedPct}%` : "—"}
          color={
            escalatedPct !== null
              ? escalatedPct <= 10
                ? "text-verdigris-700"
                : escalatedPct <= 25
                  ? "text-tuscan-sun-700"
                  : "text-burnt-peach-700"
              : ""
          }
        />
        <KPICard
          icon={Clock}
          label="Mean Response"
          value={meanResponse ?? "—"}
          sublabel="rounds"
          color="text-pitch-black-800"
        />
        <KPICard
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

      {/* Two-column: Readiness Gauge + Mini Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            {resilience ? (
              <ReadinessGauge resilience={resilience} />
            ) : (
              <EmptySection label="Readiness scoring not available — run stress tests to generate" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Highest-impact decision callout */}
      {topDivergence && (
        <Card className="border-tuscan-sun-200 bg-tuscan-sun-50">
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
                  Round {topDivergence.round} — <strong>{topDivergence.agent}</strong> made
                  a decision that changed outcomes across{" "}
                  {Math.round(topDivergence.divergence_score * 25)}% of
                  simulations.
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {Object.entries(topDivergence.action_distribution).map(
                    ([action, count]) => (
                      <Badge
                        key={action}
                        variant="outline"
                        className="bg-tuscan-sun-100 border-tuscan-sun-300 text-tuscan-sun-800"
                      >
                        {action}: {count}x
                      </Badge>
                    ),
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stress Test Highlights */}
      {stressResults && stressResults.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <StressTestResults results={stressResults} mode="compact" />
          </CardContent>
        </Card>
      )}

      {/* Priority Actions */}
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
                  className="flex items-start gap-3 p-3 rounded-lg bg-pitch-black-50 border border-pitch-black-100"
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
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-pitch-black-800">
                      {a.action}
                    </p>
                    <div className="flex gap-3 mt-1 text-xs text-pitch-black-500">
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

      {/* Executive Summary */}
      {report.executiveSummary && (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-medium text-pitch-black-600 mb-2">
              Executive Summary
            </p>
            <p className="text-sm text-pitch-black-700 leading-relaxed whitespace-pre-line">
              {report.executiveSummary}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KPICard({
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
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Icon size={14} />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${color ?? ""}`}>
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

function EmptySection({ label }: { label: string }) {
  return (
    <div className="h-40 flex items-center justify-center">
      <p className="text-xs text-pitch-black-400">{label}</p>
    </div>
  );
}
