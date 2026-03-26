"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import type { ExerciseReport } from "@/app/actions/report";
import KillChainFlow from "./KillChainFlow";
import MiniGraph from "./MiniGraph";

interface SecurityTeamViewProps {
  report: ExerciseReport;
}

const EVENT_COLORS: Record<string, { dot: string; bg: string; label: string }> = {
  inject: { dot: "bg-tuscan-sun-500", bg: "bg-tuscan-sun-50", label: "Inject" },
  threat_actor: { dot: "bg-burnt-peach-500", bg: "bg-burnt-peach-50", label: "Attacker" },
  arbiter: { dot: "bg-verdigris-500", bg: "bg-verdigris-50", label: "Arbiter" },
  defender: { dot: "bg-royal-azure-500", bg: "bg-royal-azure-50", label: "Defender" },
};

function classifyTimelineEntry(entry: { agent: string; significance: string }): string {
  const agent = entry.agent?.toLowerCase() || "";
  if (agent.includes("inject") || agent === "system") return "inject";
  if (agent.includes("arbiter")) return "arbiter";
  if (agent.includes("threat") || agent.includes("attacker")) return "threat_actor";
  return "defender";
}

export default function SecurityTeamView({ report }: SecurityTeamViewProps) {
  const attackPaths = report.methodology?.attackPaths ?? [];
  const killChain = attackPaths[0]?.killChain ?? [];
  const threatName = attackPaths[0]?.threatName;
  const timeline = report.appendix?.scenarioDetails?.[0]?.timeline ?? [];
  const actions = report.conclusions?.actionItems ?? [];

  // Extract systems from methodology
  const worlds = report.methodology?.worldsPerScenario?.[0]?.worlds ?? [];

  // Simulated IOCs from attack path
  const iocs = extractIOCs(report);

  return (
    <div className="space-y-6">
      {/* Kill Chain Flow */}
      {killChain.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <KillChainFlow killChain={killChain} threatName={threatName} />
          </CardContent>
        </Card>
      )}

      {/* Two-column: Systems + Attack Surface Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Systems Affected */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-pitch-black-600">
              Systems Affected
            </p>
            {worlds.length > 0 ? (
              <div className="space-y-2">
                {worlds.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-pitch-black-50 border border-pitch-black-100"
                  >
                    <div>
                      <p className="text-sm font-medium text-pitch-black-800">
                        {w.name}
                      </p>
                      <p className="text-xs text-pitch-black-500">
                        {w.type} — {w.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-pitch-black-400">
                        {w.actionCount} actions
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          w.actionCount > 15
                            ? "bg-burnt-peach-50 text-burnt-peach-700 border-burnt-peach-200"
                            : w.actionCount > 5
                              ? "bg-tuscan-sun-50 text-tuscan-sun-700 border-tuscan-sun-200"
                              : "bg-verdigris-50 text-verdigris-700 border-verdigris-200"
                        }
                      >
                        {w.actionCount > 15 ? "Critical" : w.actionCount > 5 ? "Active" : "Low"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-pitch-black-400">No system data available</p>
            )}
          </CardContent>
        </Card>

        {/* Attack Surface Graph */}
        <Card>
          <CardContent className="p-5">
            <MiniGraph projectId={report.projectId} highlightAttackPath />
          </CardContent>
        </Card>
      </div>

      {/* Indicators of Compromise */}
      {iocs.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-pitch-black-600">
              Simulated Indicators of Compromise
            </p>
            <p className="text-xs text-pitch-black-400">
              Based on attacker actions observed during simulation
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {iocs.map((ioc, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-pitch-black-50 border border-pitch-black-100"
                >
                  <Badge variant="outline" className="text-[10px] mb-1.5 bg-burnt-peach-50 text-burnt-peach-700 border-burnt-peach-200">
                    {ioc.type}
                  </Badge>
                  <p className="text-xs text-pitch-black-700 font-mono">
                    {ioc.indicator}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Incident Timeline */}
      {timeline.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-pitch-black-600">
              Incident Timeline
            </p>
            <div className="flex gap-3 mb-2">
              {Object.entries(EVENT_COLORS).map(([key, config]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                  <span className="text-[10px] text-pitch-black-500">{config.label}</span>
                </div>
              ))}
            </div>
            <div className="space-y-0">
              {timeline.map((entry, i) => {
                const type = classifyTimelineEntry(entry);
                const colors = EVENT_COLORS[type] || EVENT_COLORS.defender;
                return (
                  <div key={i} className="flex items-start gap-3 py-2 border-l-2 border-pitch-black-100 pl-4 relative">
                    <span className={`absolute -left-[5px] top-3 w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-pitch-black-400">
                          R{entry.round}
                        </span>
                        <span className="text-xs font-medium text-pitch-black-600">
                          {entry.agent}
                        </span>
                        {entry.significance === "critical" && (
                          <Badge variant="outline" className="text-[9px] bg-burnt-peach-50 text-burnt-peach-700 border-burnt-peach-200">
                            Critical
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-pitch-black-600 mt-0.5">
                        {entry.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remediation Checklist */}
      {actions.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-pitch-black-600">
              Remediation Checklist
            </p>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <label
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-pitch-black-50 border border-pitch-black-100 cursor-pointer hover:bg-pitch-black-100/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-pitch-black-300 text-royal-azure-600 focus:ring-royal-azure-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-pitch-black-800">{a.action}</p>
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
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface IOC {
  type: string;
  indicator: string;
}

function extractIOCs(report: ExerciseReport): IOC[] {
  const iocs: IOC[] = [];
  const killChain = report.methodology?.attackPaths?.[0]?.killChain ?? [];

  for (const step of killChain) {
    const tactic = step.tactic?.toLowerCase() || "";
    if (tactic.includes("initial_access") || tactic.includes("credential")) {
      iocs.push({ type: "IAM", indicator: `Suspicious authentication to ${step.target}` });
    }
    if (tactic.includes("lateral") || tactic.includes("discovery")) {
      iocs.push({ type: "Network", indicator: `Anomalous traffic to ${step.target}` });
    }
    if (tactic.includes("exfiltration") || tactic.includes("collection")) {
      iocs.push({ type: "Data Access", indicator: `Unusual data access pattern on ${step.target}` });
    }
    if (tactic.includes("execution") || tactic.includes("persistence")) {
      iocs.push({ type: "Endpoint", indicator: `Suspicious process on ${step.target}` });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return iocs.filter((ioc) => {
    const key = `${ioc.type}:${ioc.indicator}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
