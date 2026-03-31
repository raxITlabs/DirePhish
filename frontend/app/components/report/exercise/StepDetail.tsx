"use client";

import type { AttackPathStep } from "@/app/actions/report";
import EvidenceChip from "./EvidenceChip";
import ResponseActionCard from "./ResponseActionCard";
import WhatIfTimeline from "./WhatIfTimeline";
import RegulatoryTimeline from "./RegulatoryTimeline";
import StepRiskMini from "./StepRiskMini";

interface StepDetailProps {
  step: AttackPathStep;
}

export default function StepDetail({ step }: StepDetailProps) {
  if (step.error) {
    return (
      <div className="bg-burnt-peach-50 border border-burnt-peach-200 rounded-xl p-6">
        <p className="text-burnt-peach-700 font-medium">
          Step {step.step_index + 1} generation failed
        </p>
        <p className="text-sm text-burnt-peach-500 mt-1">{step.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step Header */}
      <div>
        <div className="inline-flex items-center gap-2 bg-royal-azure-50 px-3 py-1 rounded text-xs text-royal-azure-700 font-medium mb-2">
          MITRE ATT&CK · {step.technique_id} · {step.tactic}
        </div>
        <h2 className="text-base font-semibold text-pitch-black-800 leading-snug">
          {step.description}
        </h2>
      </div>

      {/* Evidence Chips */}
      <div className="flex flex-wrap gap-2">
        <EvidenceChip
          label={`Contained in ${step.evidence.containment_rate}`}
          type={step.evidence.containment_rate.includes("0/") ? "danger" : "success"}
          isInferred={step.evidence.is_inferred}
        />
        {step.evidence.avg_detection_round > 0 && (
          <EvidenceChip
            label={`Avg detection: Round ${step.evidence.avg_detection_round}`}
            type="warning"
            isInferred={step.evidence.is_inferred}
          />
        )}
        {step.evidence.systems_affected > 0 && (
          <EvidenceChip
            label={`${step.evidence.systems_affected} systems affected`}
            type="info"
            isInferred={step.evidence.is_inferred}
          />
        )}
        {step.evidence.divergence_pct > 0 && (
          <EvidenceChip
            label={`${step.evidence.divergence_pct}% divergence`}
            type="danger"
            isInferred={step.evidence.is_inferred}
          />
        )}
      </div>

      {/* Response Actions */}
      {step.response_actions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-pitch-black-600 mb-3 pb-2 border-b border-pitch-black-100">
            Response Actions — Ranked by Simulation Evidence
          </h3>
          <div className="space-y-3">
            {step.response_actions.map((action, i) => (
              <ResponseActionCard key={i} action={action} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Two-column: Team Performance + What-If + Risk + Regulatory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Column */}
        <div className="space-y-5">
          {/* Team Performance */}
          {Object.keys(step.team_performance).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-pitch-black-600 mb-3 pb-2 border-b border-pitch-black-100">
                Team Performance at This Step
              </h3>
              <div className="space-y-2">
                {Object.entries(step.team_performance).map(
                  ([team, score]) => {
                    // Scores can be 0-1 floats or 0-100 integers
                    const pct = score <= 1 ? score * 100 : score;
                    const displayScore = score <= 1 ? (score * 100).toFixed(0) : Math.round(score);
                    return (
                      <div
                        key={team}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-xs text-pitch-black-600 truncate min-w-0 flex-1">
                          {team}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="w-24 h-1.5 bg-pitch-black-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                pct >= 70
                                  ? "bg-verdigris-500"
                                  : pct >= 40
                                    ? "bg-tuscan-sun-500"
                                    : "bg-burnt-peach-500"
                              }`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`text-xs font-mono font-semibold w-8 text-right ${
                              pct >= 70
                                ? "text-verdigris-600"
                                : pct >= 40
                                  ? "text-tuscan-sun-600"
                                  : "text-burnt-peach-600"
                            }`}
                          >
                            {displayScore}%
                          </span>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )}

          {/* Step Risk */}
          <StepRiskMini
            score={step.risk_at_step.score}
            description={step.risk_at_step.description}
            fairIncrement={step.risk_at_step.fair_increment}
            isInferred={step.risk_at_step.is_inferred}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          {/* What-If Timelines */}
          {step.what_if.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-pitch-black-600 mb-3 pb-2 border-b border-pitch-black-100">
                What-If: Alternate Timelines
              </h3>
              <WhatIfTimeline scenarios={step.what_if} />
            </div>
          )}

          {/* Regulatory Timeline */}
          {step.regulatory_timeline.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-pitch-black-600 mb-3 pb-2 border-b border-pitch-black-100">
                Regulatory Timeline
              </h3>
              <RegulatoryTimeline items={step.regulatory_timeline} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
