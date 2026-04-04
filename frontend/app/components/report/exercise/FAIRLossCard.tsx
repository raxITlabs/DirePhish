"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { AsciiSectionHeader, AsciiMetric } from "@/app/components/ascii/DesignSystem";

interface Props {
  estimates: {
    ale: number;
    p10_loss: number;
    p90_loss: number;
    calibration_inputs: Record<string, number>;
  };
}

function formatDollars(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function FAIRLossCard({ estimates }: Props) {
  const rows = [
    { label: "Annualized Loss Expectancy", sub: "Expected yearly cost from this threat", value: estimates.ale, color: "text-burnt-peach-600" },
    { label: "P90 Loss (worst case)", sub: "90th percentile scenario", value: estimates.p90_loss, color: "text-burnt-peach-500" },
    { label: "P10 Loss (best case)", sub: "10th percentile scenario", value: estimates.p10_loss, color: "text-verdigris-600" },
  ];

  return (
    <Card>
      <CardContent>
        <AsciiSectionHeader as="h3" sigil="$">FAIR Loss Estimation</AsciiSectionHeader>
        <div className="space-y-2 mt-4">
          {rows.map((row) => (
            <AsciiMetric
              key={row.label}
              label={row.label}
              value={formatDollars(row.value)}
              valueColor={row.color}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
