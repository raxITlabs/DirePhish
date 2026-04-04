"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { AsciiSectionHeader } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";
import OutcomeDistributionBar from "./OutcomeDistributionBar";
import ReadinessGauge from "./ReadinessGauge";
import StressTestResults from "./StressTestResults";
import HeatmapChart from "./HeatmapChart";
import FiveWhysTree from "./FiveWhysTree";

interface CISOViewProps {
  report: ExerciseReport;
}

export default function CISOView({ report }: CISOViewProps) {
  const mc = report.monteCarloStats;
  const resilience = report.resilience;
  const stressResults = report.stressTestResults;
  const cfComparison = report.counterfactualComparison;
  const actions = report.conclusions?.actionItems?.slice(0, 5) ?? [];
  const divergencePoints = mc?.decision_divergence_points ?? [];

  return (
    <div className="space-y-6">
      {/* Outcome Distribution */}
      {mc && (
        <Card>
          <CardContent className="p-5">
            <OutcomeDistributionBar distribution={mc.outcome_distribution} />
          </CardContent>
        </Card>
      )}

      {/* Decision Divergence Table */}
      {divergencePoints.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <AsciiSectionHeader as="h3" sigil="↕">Decision Divergence Analysis</AsciiSectionHeader>
            <p className="text-xs text-pitch-black-400">
              Decisions with highest outcome impact across Monte Carlo variations
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-pitch-black-100">
                    <th className="text-left py-2 px-3 text-xs font-medium text-pitch-black-500">Round</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-pitch-black-500">Agent</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-pitch-black-500">Divergence</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-pitch-black-500">Action Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {divergencePoints.map((dp, i) => (
                    <tr key={i} className="border-b border-pitch-black-50">
                      <td className="py-2 px-3 font-mono">{dp.round}</td>
                      <td className="py-2 px-3">{dp.agent}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-pitch-black-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-tuscan-sun-500"
                              style={{ width: `${Math.min((dp.divergence_score / 4) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-pitch-black-500">
                            {dp.divergence_score.toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {Object.entries(dp.action_distribution).map(([action, count]) => (
                            <Badge
                              key={action}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {action}: {count}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Performance Heatmap */}
      {report.teamPerformance?.heatmapData && report.teamPerformance.heatmapData.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <AsciiSectionHeader as="h3" sigil="▣">Team Performance Heatmap</AsciiSectionHeader>
            <HeatmapChart data={report.teamPerformance.heatmapData} />
          </CardContent>
        </Card>
      )}

      {/* Agent Consistency */}
      {mc?.agent_consistency && Object.keys(mc.agent_consistency).length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <AsciiSectionHeader as="h3" sigil="●">Agent Consistency</AsciiSectionHeader>
            <p className="text-xs text-pitch-black-400">
              Predictability of agent decisions across Monte Carlo variations (higher = more consistent)
            </p>
            <div className="space-y-2">
              {Object.entries(mc.agent_consistency)
                .sort(([, a], [, b]) => b - a)
                .map(([agent, score]) => {
                  const pct = Math.round(score * 100);
                  const color =
                    pct >= 70
                      ? "bg-verdigris-500"
                      : pct >= 40
                        ? "bg-tuscan-sun-500"
                        : "bg-burnt-peach-500";
                  return (
                    <div key={agent} className="flex items-center gap-3">
                      <span className="text-xs text-pitch-black-600 w-32 truncate shrink-0">
                        {agent}
                      </span>
                      <div className="flex-1 h-2 bg-pitch-black-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-pitch-black-500 w-10 text-right">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Readiness Gauge */}
      {resilience && (
        <Card>
          <CardContent className="p-5">
            <ReadinessGauge resilience={resilience} />
          </CardContent>
        </Card>
      )}

      {/* Root Cause Analysis */}
      {report.rootCauseAnalysis && report.rootCauseAnalysis.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <AsciiSectionHeader as="h3" sigil="├">Root Cause Analysis (5 Whys)</AsciiSectionHeader>
            <FiveWhysTree rootCauses={report.rootCauseAnalysis} />
          </CardContent>
        </Card>
      )}

      {/* Full Stress Test Results */}
      {stressResults && stressResults.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <StressTestResults results={stressResults} mode="full" />
          </CardContent>
        </Card>
      )}

      {/* Counterfactual Comparison */}
      {cfComparison && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <AsciiSectionHeader as="h3" sigil="↔">Counterfactual Comparison</AsciiSectionHeader>
            <p className="text-xs text-pitch-black-400">
              Original vs. alternate timeline outcomes
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Original */}
              <div className="p-3 rounded-xl bg-royal-azure-50 ring-1 ring-royal-azure-200">
                <p className="text-xs font-medium text-royal-azure-700 mb-1">Original</p>
                <p className="text-sm font-mono text-royal-azure-900">
                  {cfComparison.original.containment_round !== null
                    ? `Contained at round ${cfComparison.original.containment_round}`
                    : "Not contained"}
                </p>
                <p className="text-xs text-royal-azure-500">
                  {cfComparison.original.total_actions} actions
                </p>
              </div>

              {/* Branches */}
              {cfComparison.branches.map((branch, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-tuscan-sun-50 ring-1 ring-tuscan-sun-200"
                >
                  <p className="text-xs font-medium text-tuscan-sun-700 mb-1">
                    Branch {i + 1}
                  </p>
                  <p className="text-sm font-mono text-tuscan-sun-900">
                    {branch.containment_round !== null
                      ? `Contained at round ${branch.containment_round}`
                      : "Not contained"}
                  </p>
                  <p className="text-xs text-tuscan-sun-500">
                    {branch.total_actions} actions
                  </p>
                </div>
              ))}
            </div>

            {cfComparison.divergence_summary && (
              <p className="text-sm text-pitch-black-700 leading-relaxed mt-2">
                {cfComparison.divergence_summary}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Priority Actions */}
      {actions.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <AsciiSectionHeader as="h3" sigil="»">Priority Actions</AsciiSectionHeader>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl bg-pitch-black-50 ring-1 ring-foreground/10"
                >
                  <span
                    className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      a.investmentLevel === "High"
                        ? "bg-burnt-peach-500"
                        : a.investmentLevel === "Medium"
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
                    <p className="text-xs text-pitch-black-500 mt-0.5">
                      {a.predictedRiskReduction}
                    </p>
                    <div className="flex gap-3 mt-1 text-xs text-pitch-black-500">
                      <span>{a.suggestedOwner}</span>
                      <span>{a.suggestedTimeline}</span>
                      <Badge
                        variant={
                          a.investmentLevel === "High"
                            ? "destructive"
                            : a.investmentLevel === "Medium"
                              ? "warning"
                              : "success"
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
            <AsciiSectionHeader as="h3" sigil="§">Executive Summary</AsciiSectionHeader>
            <p className="text-sm text-pitch-black-700 leading-relaxed whitespace-pre-line">
              {report.executiveSummary}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
