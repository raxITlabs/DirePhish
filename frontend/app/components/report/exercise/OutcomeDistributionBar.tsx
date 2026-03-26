"use client";

interface OutcomeDistributionBarProps {
  distribution: {
    contained_early: number;
    contained_late: number;
    not_contained: number;
    escalated: number;
  };
}

const SEGMENTS = [
  { key: "contained_early" as const, label: "Contained Early", color: "bg-verdigris-500", textColor: "text-verdigris-700", dot: "bg-verdigris-500" },
  { key: "contained_late" as const, label: "Contained Late", color: "bg-tuscan-sun-500", textColor: "text-tuscan-sun-700", dot: "bg-tuscan-sun-500" },
  { key: "not_contained" as const, label: "Not Contained", color: "bg-sandy-brown-500", textColor: "text-sandy-brown-700", dot: "bg-sandy-brown-500" },
  { key: "escalated" as const, label: "Escalated", color: "bg-burnt-peach-500", textColor: "text-burnt-peach-700", dot: "bg-burnt-peach-500" },
];

export default function OutcomeDistributionBar({ distribution }: OutcomeDistributionBarProps) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-pitch-black-600">Outcome Distribution</p>

      {/* Bar */}
      <div className="flex h-10 rounded-lg overflow-hidden">
        {SEGMENTS.map((seg) => {
          const count = distribution[seg.key];
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg.key}
              className={`${seg.color} flex items-center justify-center transition-all duration-500`}
              style={{ width: `${pct}%` }}
            >
              {pct > 10 && (
                <span className="text-xs font-bold text-white">
                  {Math.round(pct)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

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
