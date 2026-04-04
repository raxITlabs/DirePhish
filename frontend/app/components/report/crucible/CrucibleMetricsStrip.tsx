"use client";

import { AsciiMetricCard } from "@/app/components/ascii/DesignSystem";
import type { CrucibleReport } from "@/app/actions/report";

interface CrucibleMetricsStripProps {
  agentScores?: CrucibleReport["agentScores"];
  timeline?: CrucibleReport["timeline"];
  totalCostUsd?: number;
}

export default function CrucibleMetricsStrip({
  agentScores,
  timeline,
  totalCostUsd,
}: CrucibleMetricsStripProps) {
  const agentCount = agentScores?.length ?? 0;
  const rounds = timeline && timeline.length > 0
    ? Math.max(...timeline.map((t) => t.round))
    : 0;
  const totalActions = agentScores?.reduce((sum, a) => sum + a.actionCount, 0) ?? 0;
  const avgScore = agentCount > 0
    ? (agentScores!.reduce((sum, a) => sum + a.score, 0) / agentCount).toFixed(1)
    : "—";

  function scoreColor(score: string): string {
    const n = parseFloat(score);
    if (isNaN(n)) return "text-muted-foreground";
    if (n >= 7) return "text-verdigris-700";
    if (n >= 5) return "text-tuscan-sun-700";
    return "text-burnt-peach-700";
  }

  const costDisplay = totalCostUsd !== undefined
    ? `$${totalCostUsd < 0.01 ? totalCostUsd.toFixed(4) : totalCostUsd.toFixed(2)}`
    : "—";

  const metrics = [
    { label: "Agents", value: String(agentCount), icon: "●" },
    { label: "Rounds", value: String(rounds), icon: "◆" },
    { label: "Total Actions", value: String(totalActions), icon: "⚡" },
    { label: "Avg Score", value: avgScore, icon: "▲", valueColor: scoreColor(avgScore) },
    { label: "Est. Cost", value: costDisplay, icon: "$" },
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
