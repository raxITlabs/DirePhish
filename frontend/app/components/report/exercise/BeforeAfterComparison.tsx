"use client";

import { useState } from "react";
import type { ExerciseReport } from "@/app/actions/report";

interface Props {
  projectId: string;
  currentScore: NonNullable<ExerciseReport["riskScore"]>;
}

export default function BeforeAfterComparison({ projectId, currentScore }: Props) {
  // This component only renders if there's a historical score to compare against.
  // For V1, we show a placeholder explaining how comparison works.
  // Full comparison requires calling GET /risk-score/compare?baseline=<id>

  const [hasBaseline] = useState(false); // Will be implemented with history API

  if (!hasBaseline) {
    return (
      <div className="bg-pitch-black-100 rounded-xl p-5 border border-dashed border-pitch-black-300">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pitch-black-500 mb-2">
          Before / After Comparison
        </h3>
        <p className="text-[12px] text-pitch-black-500">
          Run DirePhish again after remediation to see your risk score improvement.
          The comparison will show score delta, dimension changes, and annualized loss reduction.
        </p>
      </div>
    );
  }

  // When comparison data is available, this renders:
  // Two score blocks side by side with an arrow, plus delta summary
  return null;
}
