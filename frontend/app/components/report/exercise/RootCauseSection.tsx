"use client";

import { AsciiSectionHeader } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";
import FiveWhysTree from "./FiveWhysTree";

interface RootCauseSectionProps {
  rootCauses: NonNullable<ExerciseReport["rootCauseAnalysis"]>;
}

export default function RootCauseSection({ rootCauses }: RootCauseSectionProps) {
  return (
    <section id="root-causes" className="space-y-6">
      <AsciiSectionHeader as="h2" sigil="├">Root Cause Analysis</AsciiSectionHeader>
      <p className="text-sm text-muted-foreground">
        Using the 5 Whys technique to trace predicted surface-level gaps to their organizational root causes.
      </p>
      <FiveWhysTree rootCauses={rootCauses} />
    </section>
  );
}
