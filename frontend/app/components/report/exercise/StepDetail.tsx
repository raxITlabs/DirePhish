"use client";

import { useState } from "react";
import type { AttackPathStep } from "@/app/actions/report";
import EvidenceChip from "./EvidenceChip";
import ResponseActionCard from "./ResponseActionCard";
import WhatIfTimeline from "./WhatIfTimeline";
import RegulatoryTimeline from "./RegulatoryTimeline";
import StepRiskMini from "./StepRiskMini";

function formatTactic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const TEAM_LIMIT = 5;

interface StepDetailProps {
  step: AttackPathStep;
}

export default function StepDetail({ step }: StepDetailProps) {
  const [showAllTeams, setShowAllTeams] = useState(false);

  if (step.error) {
    return (
      <div className="rounded-lg bg-burnt-peach-50 border border-burnt-peach-200 p-4">
        <p className="text-sm font-medium text-burnt-peach-700">
          Step {step.step_index + 1} generation failed
        </p>
        <p className="text-xs text-burnt-peach-500 mt-1">{step.error}</p>
      </div>
    );
  }

  const teamEntries = Object.entries(step.team_performance).sort(
    ([, a], [, b]) => b - a,
  );
  const visibleTeams = showAllTeams
    ? teamEntries
    : teamEntries.slice(0, TEAM_LIMIT);
  const hiddenCount = teamEntries.length - TEAM_LIMIT;

  return (
    <div className="space-y-4">
      {/* Step Header */}
      <div className="rounded-lg border border-border/40 bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 bg-royal-azure-50 border border-royal-azure-200 px-2.5 py-0.5 rounded-md text-[10px] text-royal-azure-700 font-mono font-medium">
            {step.technique_id}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            {formatTactic(step.tactic)}
          </span>
        </div>
        <p className="text-sm font-medium text-foreground leading-relaxed mb-3">
          {step.description}
        </p>
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
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
            Response Actions
          </p>
          <div className="space-y-2">
            {step.response_actions.map((action, i) => (
              <ResponseActionCard key={i} action={action} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Metrics Grid — full width, tight cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Team Performance */}
        {teamEntries.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-card p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
              Team Performance
            </p>
            <div className="space-y-2.5">
              {visibleTeams.map(([team, score]) => {
                const pct = score <= 1 ? score * 100 : score;
                const displayScore =
                  score <= 1
                    ? (score * 100).toFixed(0)
                    : Math.round(score);
                return (
                  <div key={team} className="flex items-center gap-2">
                    <span className="text-xs text-foreground/70 truncate min-w-0 w-32">
                      {team}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
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
                      className={`text-xs font-mono font-semibold w-9 text-right shrink-0 ${
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
                className="mt-2 text-xs text-royal-azure-600 hover:text-royal-azure-700 font-medium"
              >
                Show all {teamEntries.length} agents
              </button>
            )}
            {showAllTeams && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllTeams(false)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground font-medium"
              >
                Show less
              </button>
            )}
          </div>
        )}

        {/* Step Risk */}
        <StepRiskMini
          score={step.risk_at_step.score}
          description={step.risk_at_step.description}
          fairIncrement={step.risk_at_step.fair_increment}
        />
      </div>

      {/* What-If + Regulatory — full width when they have content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {step.what_if.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-card p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
              What-If: Alternate Timelines
            </p>
            <WhatIfTimeline scenarios={step.what_if} />
          </div>
        )}

        {step.regulatory_timeline.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-card p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
              Regulatory Timeline
            </p>
            <RegulatoryTimeline items={step.regulatory_timeline} />
          </div>
        )}
      </div>
    </div>
  );
}
