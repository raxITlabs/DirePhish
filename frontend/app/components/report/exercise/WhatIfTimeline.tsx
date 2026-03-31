"use client";

import type { WhatIfScenario } from "@/app/actions/report";

interface Props {
  scenarios: WhatIfScenario[];
}

export default function WhatIfTimeline({ scenarios }: Props) {
  if (scenarios.length === 0) return null;

  return (
    <div className="space-y-3">
      {scenarios.map((s, i) => {
        const isNegative = s.direction === "negative";
        const tintBorder = isNegative
          ? "border-burnt-peach-300/40"
          : "border-verdigris-300/40";
        const tintBg = isNegative
          ? "bg-burnt-peach-900/5"
          : "bg-verdigris-900/5";
        const dirColor = isNegative
          ? "text-burnt-peach-400"
          : "text-verdigris-400";

        return (
          <div
            key={i}
            className={`rounded-xl border border-dashed p-4 ${tintBorder} ${tintBg}`}
          >
            {/* Direction + title */}
            <div className="flex items-start gap-2 mb-3">
              <span className={`text-sm font-semibold ${dirColor}`}>
                {isNegative ? "\u2193" : "\u2191"}
              </span>
              <p className="text-sm font-medium text-pitch-black-700">
                {s.scenario}
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="text-center">
                <p className="text-xs text-pitch-black-400">Containment</p>
                <p className={`text-sm font-semibold ${dirColor}`}>
                  {s.containment_delta}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-pitch-black-400">Rounds</p>
                <p className={`text-sm font-semibold ${dirColor}`}>
                  {s.rounds_delta > 0 ? `+${s.rounds_delta}` : s.rounds_delta}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-pitch-black-400">Exposure</p>
                <p className={`text-sm font-semibold ${dirColor}`}>
                  {s.exposure_delta}
                </p>
              </div>
            </div>

            {/* Source label */}
            <p className="text-xs text-pitch-black-400">
              {s.source === "counterfactual"
                ? "Counterfactual"
                : "Modeled estimate"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
