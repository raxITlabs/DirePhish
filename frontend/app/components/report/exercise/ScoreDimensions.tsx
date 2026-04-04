"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { AsciiSectionHeader, AsciiProgressBar } from "@/app/components/ascii/DesignSystem";

interface Props {
  dimensions: {
    detection_speed: number;
    containment_effectiveness: number;
    communication_quality: number;
    decision_consistency: number;
    compliance_adherence: number;
    escalation_resistance: number;
  };
}

const LABELS: Record<string, string> = {
  detection_speed: "Detection Speed",
  containment_effectiveness: "Containment Effectiveness",
  communication_quality: "Communication Quality",
  decision_consistency: "Decision Consistency",
  compliance_adherence: "Compliance Adherence",
  escalation_resistance: "Escalation Resistance",
};

function barColor(score: number): string {
  if (score >= 70) return "text-verdigris-500";
  if (score >= 40) return "text-tuscan-sun-500";
  return "text-burnt-peach-500";
}

export default function ScoreDimensions({ dimensions }: Props) {
  const entries = Object.entries(dimensions) as [string, number][];

  return (
    <Card>
      <CardContent>
        <AsciiSectionHeader as="h3" sigil="▣">Score Dimensions</AsciiSectionHeader>
        <div className="space-y-3 mt-4">
          {entries.map(([key, score]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground w-48 shrink-0">{LABELS[key] ?? key}</span>
              <AsciiProgressBar value={score} max={100} width={16} color={barColor(score)} label={`${LABELS[key] ?? key}: ${Math.round(score)}%`} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
