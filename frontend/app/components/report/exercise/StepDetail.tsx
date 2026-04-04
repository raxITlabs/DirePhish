"use client";

import { useState } from "react";
import type { AttackPathStep } from "@/app/actions/report";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { AsciiSectionHeader, AsciiAlert, AsciiProgressBar } from "@/app/components/ascii/DesignSystem";
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
      <AsciiAlert variant="error" title={`Step ${step.step_index + 1} generation failed`}>
        {step.error}
      </AsciiAlert>
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
      <Card>
        <CardContent>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="default" className="text-[10px] font-mono">
              {step.technique_id}
            </Badge>
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
        </CardContent>
      </Card>

      {/* Response Actions */}
      {step.response_actions.length > 0 && (
        <div>
          <AsciiSectionHeader as="h4" sigil="»">Response Actions</AsciiSectionHeader>
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
          <Card>
            <CardContent>
              <AsciiSectionHeader as="h4" sigil="●">Team Performance</AsciiSectionHeader>
              <div className="space-y-2.5 mt-3">
                {visibleTeams.map(([team, score]) => {
                  const pct = score <= 1 ? score * 100 : score;
                  const barColor = pct >= 70 ? "text-verdigris-500" : pct >= 40 ? "text-tuscan-sun-500" : "text-burnt-peach-500";
                  return (
                    <div key={team} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-foreground/70 truncate min-w-0 w-32">
                        {team}
                      </span>
                      <AsciiProgressBar value={pct} max={100} width={14} color={barColor} label={`${team}: ${Math.round(pct)}%`} />
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
            </CardContent>
          </Card>
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
          <Card>
            <CardContent>
              <AsciiSectionHeader as="h4" sigil="↕">What-If: Alternate Timelines</AsciiSectionHeader>
              <WhatIfTimeline scenarios={step.what_if} />
            </CardContent>
          </Card>
        )}

        {step.regulatory_timeline.length > 0 && (
          <Card>
            <CardContent>
              <AsciiSectionHeader as="h4" sigil="⚖">Regulatory Timeline</AsciiSectionHeader>
              <RegulatoryTimeline items={step.regulatory_timeline} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
