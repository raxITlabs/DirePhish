"use client";

import { useEffect, useState } from "react";
import { getRiskScore, computeRiskScore, type ExerciseReport } from "@/app/actions/report";
import { Card, CardContent } from "@/app/components/ui/card";
import { Loader2, AlertTriangle, Calculator } from "lucide-react";
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
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <Calculator className="mx-auto text-pitch-black-400" size={32} />
            <div>
              <p className="font-medium text-lg">Risk Score Not Computed</p>
              <p className="text-sm text-muted-foreground mt-1">
                Compute a risk score from your Monte Carlo simulation data.
                Requires at least QUICK mode (10+ iterations).
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-burnt-peach-500 text-sm">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}
            <button
              onClick={handleCompute}
              className="px-6 py-2 bg-royal-azure-600 hover:bg-royal-azure-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Compute Risk Score
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-muted-foreground" size={20} />
          <span className="text-muted-foreground">Computing risk score...</span>
        </div>
      </div>
    );
  }

  if (!riskScore) return null;

  return (
    <div className="space-y-6">
      {/* Methodology badges */}
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-royal-azure-50 text-royal-azure-700 border border-royal-azure-200">FAIR</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-royal-azure-50 text-royal-azure-700 border border-royal-azure-200">ATT&CK</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-royal-azure-50 text-royal-azure-700 border border-royal-azure-200">Monte Carlo</span>
        <span className="text-[11px] text-pitch-black-500 ml-2">
          {riskScore.confidence_flag === "low" ? "⚠ Low confidence" : ""} · {(report.monteCarloStats?.iteration_count ?? 0)} iterations
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
