"use client";

import { useState } from "react";
import type { AttackPathStep } from "@/app/actions/report";
import EvidenceChip from "./EvidenceChip";
import ResponseActionCard from "./ResponseActionCard";
import WhatIfTimeline from "./WhatIfTimeline";
import RegulatoryTimeline from "./RegulatoryTimeline";
import StepRiskMini from "./StepRiskMini";

const TEAM_LIMIT = 5;

interface StepDetailProps {
  step: AttackPathStep;
}

export default function StepDetail({ step }: StepDetailProps) {
  const [showAllTeams, setShowAllTeams] = useState(false);

  if (step.error) {
    return (
      <div className="rounded-xl bg-burnt-peach-50 border border-burnt-peach-200 p-5">
        <p className="text-sm font-medium text-burnt-peach-700">
          Step {step.step_index + 1} generation failed
        </p>
        <p className="text-xs text-burnt-peach-500 mt-1">{step.error}</p>
      </div>
    );
  }

  // Sort teams by score descending, limit to top 5 unless expanded
  const teamEntries = Object.entries(step.team_performance).sort(
    ([, a], [, b]) => b - a,
  );
  const visibleTeams = showAllTeams
    ? teamEntries
    : teamEntries.slice(0, TEAM_LIMIT);
  const hiddenCount = teamEntries.length - TEAM_LIMIT;

  return (
    <div className="space-y-5">
      {/* Step Header Card */}
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-5">
        <div className="inline-flex items-center gap-2 bg-royal-azure-50 border border-royal-azure-200 px-3 py-1 rounded-full text-[11px] text-royal-azure-700 font-medium mb-3">
          MITRE ATT&CK · {step.technique_id} · {step.tactic}
        </div>
        <h2 className="text-base font-semibold text-pitch-black-800 leading-snug mb-3">
          {step.description}
        </h2>

        {/* Evidence Chips */}
        <div className="flex flex-wrap gap-1.5">
          <EvidenceChip
            label={`Contained in ${step.evidence.containment_rate}`}
            type={step.evidence.containment_rate.includes("0/") ? "danger" : "success"}
          />
          {step.evidence.avg_detection_round > 0 && (
            <EvidenceChip
              label={`Avg detection: Round ${step.evidence.avg_detection_round}`}
              type="warning"
            />
          )}
          {step.evidence.systems_affected > 0 && (
            <EvidenceChip
              label={`${step.evidence.systems_affected} systems affected`}
              type="info"
            />
          )}
          {step.evidence.divergence_pct > 0 && (
            <EvidenceChip
              label={`${step.evidence.divergence_pct}% divergence`}
              type="danger"
            />
          )}
        </div>
      </div>

      {/* Response Actions */}
      {step.response_actions.length > 0 && (
        <div>
          <p className="text-sm font-medium text-pitch-black-600 mb-3">
            Response Actions — Ranked by Simulation Evidence
          </p>
          <div className="space-y-3">
            {step.response_actions.map((action, i) => (
              <ResponseActionCard key={i} action={action} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Team Performance Card */}
          {teamEntries.length > 0 && (
            <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-5">
              <p className="text-sm font-medium text-pitch-black-600 mb-4">
                Team Performance at This Step
              </p>
              <div className="space-y-3">
                {visibleTeams.map(([team, score]) => {
                  const pct = score <= 1 ? score * 100 : score;
                  const displayScore =
                    score <= 1
                      ? (score * 100).toFixed(0)
                      : Math.round(score);
                  return (
                    <div key={team} className="flex items-center gap-3">
                      <span className="text-xs text-pitch-black-600 truncate min-w-0 w-36">
                        {team}
                      </span>
                      <div className="flex-1 h-1.5 bg-pitch-black-100 rounded-full overflow-hidden">
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
                        className={`text-xs font-mono font-semibold w-10 text-right shrink-0 ${
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
                  );
                })}
              </div>
              {hiddenCount > 0 && !showAllTeams && (
                <button
                  onClick={() => setShowAllTeams(true)}
                  className="mt-3 text-xs text-royal-azure-600 hover:text-royal-azure-700 font-medium"
                >
                  Show all {teamEntries.length} agents
                </button>
              )}
              {showAllTeams && hiddenCount > 0 && (
                <button
                  onClick={() => setShowAllTeams(false)}
                  className="mt-3 text-xs text-pitch-black-400 hover:text-pitch-black-600 font-medium"
                >
                  Show less
                </button>
              )}
            </div>
          )}

          {/* Step Risk Card */}
          <StepRiskMini
            score={step.risk_at_step.score}
            description={step.risk_at_step.description}
            fairIncrement={step.risk_at_step.fair_increment}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* What-If Card */}
          {step.what_if.length > 0 && (
            <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-5">
              <p className="text-sm font-medium text-pitch-black-600 mb-3">
                What-If: Alternate Timelines
              </p>
              <WhatIfTimeline scenarios={step.what_if} />
            </div>
          )}

          {/* Regulatory Timeline Card */}
          {step.regulatory_timeline.length > 0 && (
            <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-5">
              <p className="text-sm font-medium text-pitch-black-600 mb-3">
                Regulatory Timeline
              </p>
              <RegulatoryTimeline items={step.regulatory_timeline} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
