"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ExerciseReport } from "@/app/actions/report";

interface MethodologySectionProps {
  methodology: NonNullable<ExerciseReport["methodology"]>;
  costs?: ExerciseReport["costs"];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function MethodologySection({ methodology, costs }: MethodologySectionProps) {
  return (
    <section id="methodology" className="space-y-6">
      <h2 className="text-lg font-semibold">Methodology</h2>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {methodology.simulationApproach}
            </ReactMarkdown>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t pt-4">
            <div>
              <p className="text-muted-foreground text-xs">Scenarios</p>
              <p className="font-bold text-lg">{methodology.scenarioCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Agents</p>
              <p className="font-bold text-lg">{methodology.agentCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total Rounds</p>
              <p className="font-bold text-lg">{methodology.totalRounds}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total Actions</p>
              <p className="font-bold text-lg">{methodology.totalActions}</p>
            </div>
          </div>

          {/* Cost Breakdown */}
          {costs && costs.breakdown.length > 0 && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pipeline Cost Breakdown</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-1.5 font-medium">Phase</th>
                      <th className="text-right py-1.5 font-medium">Cost</th>
                      <th className="text-right py-1.5 font-medium">Input Tokens</th>
                      <th className="text-right py-1.5 font-medium">Output Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.breakdown.map((row) => (
                      <tr key={row.phase} className="border-b border-border/50">
                        <td className="py-1.5 text-muted-foreground">{row.phase}</td>
                        <td className="py-1.5 text-right font-mono">${row.usd.toFixed(4)}</td>
                        <td className="py-1.5 text-right font-mono text-muted-foreground">{formatTokens(row.inputTokens)}</td>
                        <td className="py-1.5 text-right font-mono text-muted-foreground">{formatTokens(row.outputTokens)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1.5">Total</td>
                      <td className="py-1.5 text-right font-mono">${costs.totalUsd.toFixed(4)}</td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{formatTokens(costs.totalInputTokens)}</td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{formatTokens(costs.totalOutputTokens)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {costs.model && (
                <p className="text-xs text-muted-foreground">Model: {costs.model}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attack Paths */}
      {methodology.attackPaths && methodology.attackPaths.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Simulated Attack Paths
          </h3>
          {methodology.attackPaths.map((path, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{path.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{path.threatName}</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-0">
                  {path.killChain.map((step, idx) => (
                    <div key={step.step} className="flex items-stretch gap-3">
                      {/* Vertical connector */}
                      <div className="flex flex-col items-center w-6 shrink-0">
                        <div className="w-6 h-6 rounded-full bg-royal-azure-100 text-royal-azure-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {step.step}
                        </div>
                        {idx < path.killChain.length - 1 && (
                          <div className="w-px flex-1 bg-royal-azure-200" />
                        )}
                      </div>
                      {/* Step content */}
                      <div className="pb-4 flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="outline" className="text-xs font-mono bg-royal-azure-50 text-royal-azure-700 border-royal-azure-200">
                            {step.technique}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{step.tactic.replace("_", " ")}</span>
                          {step.target && (
                            <span className="text-xs text-muted-foreground">→ {step.target}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Scenario details are in the Appendix — no need to repeat here */}
    </section>
  );
}
