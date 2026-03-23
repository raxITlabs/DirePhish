"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { Shield, Users, Search, TrendingUp, DollarSign } from "lucide-react";
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
    { label: "Scenarios", value: String(scenarioCount), icon: Shield },
    { label: "Teams Assessed", value: String(teamCount), icon: Users },
    { label: "Root Causes", value: String(rootCauseCount), icon: Search },
    { label: "Readiness", value: `${readiness}/10`, icon: TrendingUp, className: readinessColor },
    { label: "Exercise Cost", value: costDisplay, icon: DollarSign, className: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {metrics.map((m) => (
        <Card key={m.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <m.icon size={14} />
              <span className="text-xs font-medium">{m.label}</span>
            </div>
            <p className={`text-2xl font-bold ${m.className ?? ""}`}>
              {m.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
