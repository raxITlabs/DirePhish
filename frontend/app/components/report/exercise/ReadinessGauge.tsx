"use client";

import { AsciiProgressBar } from "@/app/components/ascii/DesignSystem";

interface ReadinessGaugeProps {
  resilience: {
    overall: number;
    dimensions: {
      detection_speed: number;
      containment_speed: number;
      communication_quality: number;
      compliance_adherence: number;
    };
    robustness_index: number;
    weakest_link: string;
    failure_modes: string[];
  };
}

const DIMENSIONS = [
  { key: "detection_speed" as const, label: "Detection" },
  { key: "containment_speed" as const, label: "Containment" },
  { key: "communication_quality" as const, label: "Communication" },
  { key: "compliance_adherence" as const, label: "Compliance" },
];

function scoreColor(score: number) {
  if (score >= 70) return { ring: "stroke-verdigris-500", text: "text-verdigris-700", bar: "bg-verdigris-500" };
  if (score >= 40) return { ring: "stroke-tuscan-sun-500", text: "text-tuscan-sun-700", bar: "bg-tuscan-sun-500" };
  return { ring: "stroke-burnt-peach-500", text: "text-burnt-peach-700", bar: "bg-burnt-peach-500" };
}

export default function ReadinessGauge({ resilience }: ReadinessGaugeProps) {
  const { overall, dimensions, weakest_link } = resilience;
  const colors = scoreColor(overall);

  // SVG ring params
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (overall / 100) * circumference;

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
        <span className="text-primary select-none" aria-hidden="true">{"§ "}</span>
        Readiness Score
      </p>

      {/* Ring */}
      <div className="flex items-center gap-6">
        <div className="relative w-36 h-36 shrink-0">
          <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              strokeWidth="10"
              className="stroke-pitch-black-100"
            />
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              className={`${colors.ring} transition-all duration-1000`}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${colors.text}`}>
              {Math.round(overall)}
            </span>
            <span className="text-[10px] text-pitch-black-400 uppercase tracking-wider">
              / 100
            </span>
          </div>
        </div>

        {/* Dimension bars */}
        <div className="flex-1 space-y-2.5">
          {DIMENSIONS.map((dim) => {
            const score = dimensions[dim.key];
            const dimColors = scoreColor(score);
            const isWeakest = weakest_link === dim.key;
            return (
              <div key={dim.key} className="space-y-0.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-mono ${isWeakest ? "font-bold text-destructive" : "text-muted-foreground"}`}>
                    {dim.label}
                    {isWeakest && " (weakest)"}
                  </span>
                </div>
                <AsciiProgressBar
                  value={score}
                  max={100}
                  width={16}
                  color={dimColors.ring.replace("stroke-", "text-")}
                  label={`${dim.label}: ${Math.round(score)}%`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
