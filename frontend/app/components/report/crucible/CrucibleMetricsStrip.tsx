"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { Users, Layers, Zap, TrendingUp, DollarSign } from "lucide-react";
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
    if (n >= 7) return "text-green-600";
    if (n >= 5) return "text-yellow-600";
    return "text-red-600";
  }

  const costDisplay = totalCostUsd !== undefined
    ? `$${totalCostUsd < 0.01 ? totalCostUsd.toFixed(4) : totalCostUsd.toFixed(2)}`
    : "—";

  const metrics = [
    { label: "Agents", value: String(agentCount), icon: Users },
    { label: "Rounds", value: String(rounds), icon: Layers },
    { label: "Total Actions", value: String(totalActions), icon: Zap },
    { label: "Avg Score", value: avgScore, icon: TrendingUp, className: scoreColor(avgScore) },
    { label: "Est. Cost", value: costDisplay, icon: DollarSign },
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
