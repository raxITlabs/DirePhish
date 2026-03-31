"use client";

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

            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className={`text-lg font-bold ${isNegative ? "text-burnt-peach-600" : "text-verdigris-600"}`}>
                  {s.containment_delta}
                </p>
                <p className="text-[10px] text-pitch-black-400 uppercase tracking-wider">
                  Containment
                </p>
              </div>
              <div>
                <p className={`text-lg font-bold ${isNegative ? "text-burnt-peach-600" : "text-verdigris-600"}`}>
                  {s.rounds_delta > 0 ? "+" : ""}{s.rounds_delta}
                </p>
                <p className="text-[10px] text-pitch-black-400 uppercase tracking-wider">
                  Rounds
                </p>
              </div>
              <div>
                <p className={`text-lg font-bold ${isNegative ? "text-burnt-peach-600" : "text-verdigris-600"}`}>
                  {s.exposure_delta}
                </p>
                <p className="text-[10px] text-pitch-black-400 uppercase tracking-wider">
                  Exposure
                </p>
              </div>
            </div>

            <p className="text-[10px] text-pitch-black-400 mt-2">
              {s.source === "counterfactual" ? "Counterfactual data" : "Modeled estimate"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
