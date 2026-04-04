"use client";

import { useState } from "react";
import { Card, CardContent } from "@/app/components/ui/card";
import { AsciiSectionHeader, AsciiEmptyState } from "@/app/components/ascii/DesignSystem";
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
      <Card className="border border-dashed border-border/40">
        <CardContent>
          <AsciiSectionHeader as="h3" sigil="↔">Before / After Comparison</AsciiSectionHeader>
          <AsciiEmptyState
            title="No baseline available"
            description="Run DirePhish again after remediation to see your risk score improvement. The comparison will show score delta, dimension changes, and annualized loss reduction."
            sigil="↔"
          />
        </CardContent>
      </Card>
    );
  }

  // When comparison data is available, this renders:
  // Two score blocks side by side with an arrow, plus delta summary
  return null;
}
