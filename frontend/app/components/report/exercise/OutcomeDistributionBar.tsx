"use client";

import { AsciiSectionHeader, AsciiDistributionBar } from "@/app/components/ascii/DesignSystem";

interface OutcomeDistributionBarProps {
  distribution: {
    contained_early: number;
    contained_late: number;
    not_contained: number;
    escalated: number;
  };
}

const SEGMENTS = [
  { key: "contained_early" as const, label: "Contained Early", color: "text-verdigris-600", textColor: "text-verdigris-700", dot: "bg-verdigris-500" },
  { key: "contained_late" as const, label: "Contained Late", color: "text-tuscan-sun-600", textColor: "text-tuscan-sun-700", dot: "bg-tuscan-sun-500" },
  { key: "not_contained" as const, label: "Not Contained", color: "text-sandy-brown-600", textColor: "text-sandy-brown-700", dot: "bg-sandy-brown-500" },
  { key: "escalated" as const, label: "Escalated", color: "text-burnt-peach-600", textColor: "text-burnt-peach-700", dot: "bg-burnt-peach-500" },
];

export default function OutcomeDistributionBar({ distribution }: OutcomeDistributionBarProps) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-3">
      <AsciiSectionHeader as="h3" sigil="§">Outcome Distribution</AsciiSectionHeader>

      {/* Bar */}
      <AsciiDistributionBar
        segments={SEGMENTS.map((seg) => ({
          value: distribution[seg.key],
          color: seg.color,
          label: seg.label,
        }))}
        width={50}
        ariaLabel="Outcome distribution"
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {SEGMENTS.map((seg) => {
          const count = distribution[seg.key];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={seg.key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${seg.dot}`} />
              <span className="text-xs text-pitch-black-600">
                {seg.label}
              </span>
              <span className={`text-xs font-semibold ${seg.textColor}`}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
