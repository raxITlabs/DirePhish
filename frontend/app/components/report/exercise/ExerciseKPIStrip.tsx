"use client";

import { AsciiMetricCard } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";

interface ExerciseKPIStripProps {
  report: ExerciseReport;
}

export default function ExerciseKPIStrip({ report }: ExerciseKPIStripProps) {
  const scenarioCount = report.methodology?.scenarioCount ?? 0;
  const teamCount = report.teamPerformance?.teams.length ?? 0;
  const rootCauseCount = report.rootCauseAnalysis?.length ?? 0;

  // Compute overall readiness from average team scores
  const teams = report.teamPerformance?.teams ?? [];
  let readiness = "—";
  let readinessColor = "text-muted-foreground";
  if (teams.length > 0) {
    const allScores = teams.flatMap((t) =>
      Object.values(t.scores)
    );
    const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    readiness = avg.toFixed(1);
    if (avg >= 7) readinessColor = "text-verdigris-700";
    else if (avg >= 5) readinessColor = "text-tuscan-sun-700";
    else readinessColor = "text-burnt-peach-700";
  }

  const costDisplay = report.costs
    ? `$${report.costs.totalUsd.toFixed(2)}`
    : "—";

  const metrics = [
    { label: "Scenarios", value: String(scenarioCount), icon: "◆" },
    { label: "Teams Assessed", value: String(teamCount), icon: "●" },
    { label: "Root Causes", value: String(rootCauseCount), icon: "⚑" },
    { label: "Readiness", value: `${readiness}/10`, icon: "▲", valueColor: readinessColor },
    { label: "Exercise Cost", value: costDisplay, icon: "$", valueColor: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {metrics.map((m) => (
        <AsciiMetricCard
          key={m.label}
          label={m.label}
          value={m.value}
          icon={m.icon}
          valueColor={m.valueColor}
        />
      ))}
    </div>
  );
}
