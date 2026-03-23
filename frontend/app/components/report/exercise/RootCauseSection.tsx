"use client";

import type { ExerciseReport } from "@/app/actions/report";
import FiveWhysTree from "./FiveWhysTree";

interface RootCauseSectionProps {
  rootCauses: NonNullable<ExerciseReport["rootCauseAnalysis"]>;
}

export default function RootCauseSection({ rootCauses }: RootCauseSectionProps) {
  return (
    <section id="root-causes" className="space-y-6">
      <h2 className="text-lg font-semibold">Root Cause Analysis</h2>
      <p className="text-sm text-muted-foreground">
        Using the 5 Whys technique to trace predicted surface-level gaps to their organizational root causes.
      </p>
      <FiveWhysTree rootCauses={rootCauses} />
    </section>
  );
}
