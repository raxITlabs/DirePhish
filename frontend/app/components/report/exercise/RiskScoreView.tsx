"use client";

import { useEffect, useState } from "react";
import { getRiskScore, computeRiskScore, type ExerciseReport } from "@/app/actions/report";
import { AsciiBadge, AsciiEmptyState, AsciiAlert } from "@/app/components/ascii/DesignSystem";
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner";
import RiskScoreRing from "./RiskScoreRing";
import FAIRLossCard from "./FAIRLossCard";
import RiskDrivers from "./RiskDrivers";
import ScoreDimensions from "./ScoreDimensions";
import BeforeAfterComparison from "./BeforeAfterComparison";

interface Props {
  report: ExerciseReport;
  projectId: string;
}

export default function RiskScoreView({ report, projectId }: Props) {
  const [riskScore, setRiskScore] = useState(report.riskScore ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Try to load existing risk score on mount
  useEffect(() => {
    if (riskScore) return;
    let cancelled = false;
    async function load() {
      const result = await getRiskScore(projectId);
      if (cancelled) return;
      if ("data" in result && result.data) {
        setRiskScore(result.data);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId, riskScore]);

  async function handleCompute() {
    setLoading(true);
    setError(null);
    const result = await computeRiskScore(projectId);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
    } else if (result.data) {
      setRiskScore(result.data);
    }
  }

  // No risk score yet — show compute prompt
  if (!riskScore && !loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="max-w-md space-y-4">
          <AsciiEmptyState
            title="Risk Score Not Computed"
            description="Compute a risk score from your Monte Carlo simulation data. Requires at least QUICK mode (10+ iterations)."
            sigil="◇"
            action={
              <button
                onClick={handleCompute}
                className="px-6 py-2 bg-royal-azure-600 hover:bg-royal-azure-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Compute Risk Score
              </button>
            }
          />
          {error && (
            <AsciiAlert variant="error">{error}</AsciiAlert>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex items-center gap-3">
          <AsciiSpinner className="text-lg text-muted-foreground" />
          <span className="text-muted-foreground">Computing risk score\u2026</span>
        </div>
      </div>
    );
  }

  if (!riskScore) return null;

  return (
    <div className="space-y-6">
      {/* Methodology badges */}
      <div className="flex items-center gap-2">
        <AsciiBadge variant="default" bracket="square">FAIR</AsciiBadge>
        <AsciiBadge variant="default" bracket="square">ATT&CK</AsciiBadge>
        <AsciiBadge variant="default" bracket="square">Monte Carlo</AsciiBadge>
        <span className="text-[11px] text-muted-foreground ml-2 font-mono">
          {riskScore.confidence_flag === "low" ? <span aria-hidden="true">{"⚠ "}</span> : ""}{riskScore.confidence_flag === "low" ? "Low confidence · " : ""}{(report.monteCarloStats?.iteration_count ?? 0)} iterations
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          <RiskScoreRing
            score={riskScore.composite_score}
            ci={riskScore.confidence_interval}
            interpretation={riskScore.interpretation}
          />
          <FAIRLossCard estimates={riskScore.fair_estimates} />
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <RiskDrivers drivers={riskScore.drivers} />
          <ScoreDimensions dimensions={riskScore.dimensions} />
          <BeforeAfterComparison projectId={projectId} currentScore={riskScore} />
        </div>
      </div>
    </div>
  );
}
