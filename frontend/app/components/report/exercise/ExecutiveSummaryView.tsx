"use client";

import type { ExerciseReport } from "@/app/actions/report";
import BoardView from "./BoardView";
import CISOView from "./CISOView";

interface ExecutiveSummaryViewProps {
  report: ExerciseReport;
}

export default function ExecutiveSummaryView({
  report,
}: ExecutiveSummaryViewProps) {
  return (
    <div className="space-y-6">
      {/* Board-level overview: KPIs, outcome distribution, readiness, exec summary */}
      <BoardView report={report} />

      {/* CISO deep-dive: divergence table, heatmap, root cause, counterfactual */}
      <CISOView report={report} />
    </div>
  );
}
