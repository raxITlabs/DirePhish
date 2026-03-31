"use client";

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
    <div className="bg-card rounded-xl p-5 ring-1 ring-foreground/10">
      <h3 className="text-sm font-medium text-pitch-black-600 mb-4">
        FAIR Loss Estimation
      </h3>
      <div className="space-y-0">
        {rows.map((row, i) => (
          <div key={row.label} className={`flex justify-between items-center py-3 ${i < rows.length - 1 ? "border-b border-pitch-black-100" : ""}`}>
            <div>
              <p className="text-[13px] text-pitch-black-400">{row.label}</p>
              <p className="text-[11px] text-pitch-black-600">{row.sub}</p>
            </div>
            <span className={`text-lg font-semibold ${row.color}`}>
              {formatDollars(row.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
