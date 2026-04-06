"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { AsciiSectionHeader, AsciiEmptyState } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";
import KillChainFlow from "./KillChainFlow";

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
    <div className="space-y-2">
      {/* Kill Chain Flow */}
      {killChain.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <KillChainFlow killChain={killChain} threatName={threatName} />
          </CardContent>
        </Card>
      )}

      {/* Systems Affected + IOCs side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-stretch">
        <Card>
          <CardContent className="p-3 space-y-2">
            <AsciiSectionHeader as="h3" sigil="◆">Systems Affected</AsciiSectionHeader>
            {worlds.length > 0 ? (
              <div className="space-y-1.5">
                {worlds.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg bg-pitch-black-50 ring-1 ring-foreground/10"
                  >
                    <div>
                      <p className="text-xs font-medium text-pitch-black-800">
                        {w.name}
                      </p>
                      <p className="text-[10px] text-pitch-black-500">
                        {w.type} — {w.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-pitch-black-400">
                        {w.actionCount} actions
                      </span>
                      <Badge
                        variant={
                          w.actionCount > 15
                            ? "destructive"
                            : w.actionCount > 5
                              ? "warning"
                              : "success"
                        }
                      >
                        {w.actionCount > 15 ? "Critical" : w.actionCount > 5 ? "Active" : "Low"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AsciiEmptyState title="No system data available" sigil="○" />
            )}
          </CardContent>
        </Card>

        {/* Simulated IOCs */}
        {iocs.length > 0 && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <AsciiSectionHeader as="h3" sigil="⚑">Simulated IOCs</AsciiSectionHeader>
              <p className="text-[10px] text-pitch-black-400">
                Based on attacker actions observed during simulation
              </p>
              <div className="space-y-1.5">
                {iocs.map((ioc, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-lg bg-pitch-black-50 ring-1 ring-foreground/10 flex items-start gap-2"
                  >
                    <Badge variant="destructive" className="text-[9px] shrink-0">
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
      </div>

      {/* Timeline + Remediation side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-stretch">
        {/* Incident Timeline */}
        {timeline.length > 0 && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <AsciiSectionHeader as="h3" sigil="│">Incident Timeline</AsciiSectionHeader>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(EVENT_COLORS).map(([key, config]) => (
                  <div key={key} className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                    <span className="text-[9px] text-pitch-black-500">{config.label}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-0">
                {timeline.map((entry, i) => {
                  const type = classifyTimelineEntry(entry);
                  const colors = EVENT_COLORS[type] || EVENT_COLORS.defender;
                  return (
                    <div key={i} className="flex items-start gap-2 py-1.5 border-l-2 border-pitch-black-100 pl-3 relative">
                      <span className={`absolute -left-[4px] top-2.5 w-2 h-2 rounded-full ${colors.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-pitch-black-400">
                            R{entry.round}
                          </span>
                          <span className="text-[11px] font-medium text-pitch-black-600">
                            {entry.agent}
                          </span>
                          {entry.significance === "critical" && (
                            <Badge variant="destructive" className="text-[9px]">
                              Critical
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-pitch-black-600 mt-0.5">
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
            <CardContent className="p-3 space-y-1">
              <AsciiSectionHeader as="h3" sigil="☐">Remediation Checklist</AsciiSectionHeader>
              <div className="space-y-1">
                {actions.map((a, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-lg bg-pitch-black-50 ring-1 ring-foreground/10 cursor-pointer hover:bg-pitch-black-100/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-pitch-black-300 text-royal-azure-600 focus:ring-royal-azure-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-pitch-black-800">{a.action}</p>
                      <div className="flex gap-2 mt-0.5 text-[10px] text-pitch-black-500">
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
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
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
