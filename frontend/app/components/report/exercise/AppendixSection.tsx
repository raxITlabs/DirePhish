"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AsciiSectionHeader, AsciiBadge } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";

interface AppendixSectionProps {
  appendix: NonNullable<ExerciseReport["appendix"]>;
}

function CollapsibleScenario({
  detail,
}: {
  detail: NonNullable<ExerciseReport["appendix"]>["scenarioDetails"][number];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card id={`appendix-${detail.scenarioId}`}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="text-sm flex items-center gap-2 font-mono">
          <span className="text-primary select-none" aria-hidden="true">{open ? "▼" : "▶"}</span>
          {detail.title}
          <AsciiBadge variant="muted" bracket="square">
            {detail.timeline.length} events
          </AsciiBadge>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 pt-0">
          {/* Executive Summary */}
          {detail.executiveSummary && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Executive Summary
              </h4>
              <div className="prose prose-sm max-w-none text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detail.executiveSummary}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Timeline */}
          {detail.timeline.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Event Timeline
              </h4>
              <div className="space-y-1">
                {detail.timeline.map((event, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs py-1 border-b border-border/50 last:border-0"
                  >
                    <Badge variant="outline" className="shrink-0 text-xs">
                      R{event.round}
                    </Badge>
                    <span className="text-muted-foreground font-mono shrink-0">
                      {event.agent}
                    </span>
                    <span className="flex-1">{event.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Communication Analysis */}
          {detail.communicationAnalysis && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Communication Analysis
              </h4>
              <div className="prose prose-sm max-w-none text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detail.communicationAnalysis}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Tensions */}
          {detail.tensions && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Tensions & Conflicts
              </h4>
              <div className="prose prose-sm max-w-none text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detail.tensions}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {detail.recommendations && detail.recommendations.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Recommendations
              </h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                {detail.recommendations.map((rec, i) => (
                  <li key={i} className="text-muted-foreground">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function AppendixSection({ appendix }: AppendixSectionProps) {
  return (
    <section id="appendix" className="space-y-6">
      <AsciiSectionHeader as="h2" sigil="┌">Appendix</AsciiSectionHeader>

      {/* Consistent Weaknesses */}
      {appendix.crossScenarioComparison.consistentWeaknesses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Consistent Weaknesses Across Scenarios</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside text-sm space-y-2">
              {appendix.crossScenarioComparison.consistentWeaknesses.map(
                (w, i) => (
                  <li key={i} className="text-muted-foreground">
                    {w}
                  </li>
                )
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Per-scenario findings (strengths/weaknesses/notable moments) */}
      {appendix.crossScenarioComparison.scenarioFindings?.some(
        (f) => f.strengths.length > 0 || f.weaknesses.length > 0 || f.notableMoments.length > 0
      ) && (
        <div className="space-y-3">
          <AsciiSectionHeader as="h3" sigil="◇">Scenario Comparison</AsciiSectionHeader>
          {appendix.crossScenarioComparison.scenarioFindings.map((finding, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-sm">{finding.scenario}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {finding.strengths.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Strengths
                    </h4>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {finding.strengths.map((s, j) => (
                        <li key={j} className="text-muted-foreground">{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {finding.weaknesses.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Weaknesses
                    </h4>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {finding.weaknesses.map((w, j) => (
                        <li key={j} className="text-muted-foreground">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {finding.notableMoments.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Notable Moments
                    </h4>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {finding.notableMoments.map((m, j) => (
                        <li key={j} className="text-muted-foreground">{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Per-scenario details (collapsible) */}
      <div className="space-y-3">
        <AsciiSectionHeader as="h3" sigil="»">Scenario Details</AsciiSectionHeader>
        {appendix.scenarioDetails.map((detail) => (
          <CollapsibleScenario
            key={detail.scenarioId}
            detail={detail}
          />
        ))}
      </div>
    </section>
  );
}
