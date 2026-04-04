"use client";

import { AsciiMetric } from "@/app/components/ascii/DesignSystem";
import type { WhatIfScenario } from "@/app/actions/report";

interface Props {
  scenarios: WhatIfScenario[];
}

export default function WhatIfTimeline({ scenarios }: Props) {
  if (!scenarios || scenarios.length === 0) return null;

  return (
    <div className="space-y-3">
      {scenarios.map((s, i) => {
        const isNegative = s.direction === "negative";
        return (
          <div
            key={i}
            className={`rounded-xl p-4 border border-dashed ${
              isNegative
                ? "border-burnt-peach-200 bg-burnt-peach-50/50"
                : "border-verdigris-200 bg-verdigris-50/50"
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-sm ${isNegative ? "text-burnt-peach-600" : "text-verdigris-600"}`}>
                {isNegative ? "↓" : "↑"}
              </span>
              <p className="text-xs text-pitch-black-600 leading-snug">
                {s.scenario}
              </p>
            </div>

            <div className="space-y-1 mt-1">
              <AsciiMetric
                label="Containment"
                value={s.containment_delta}
                valueColor={isNegative ? "text-destructive" : "text-verdigris-600"}
              />
              <AsciiMetric
                label="Rounds"
                value={`${s.rounds_delta > 0 ? "+" : ""}${s.rounds_delta}`}
                valueColor={isNegative ? "text-destructive" : "text-verdigris-600"}
              />
              <AsciiMetric
                label="Exposure"
                value={s.exposure_delta}
                valueColor={isNegative ? "text-destructive" : "text-verdigris-600"}
              />
            </div>

            <p className="text-[10px] font-mono text-muted-foreground mt-2">
              {s.source === "counterfactual" ? "Counterfactual data" : "Modeled estimate"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
