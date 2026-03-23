"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { ExerciseReport } from "@/app/actions/report";

interface ConclusionsSectionProps {
  conclusions: NonNullable<ExerciseReport["conclusions"]>;
  hideHeadline?: boolean;
}

function severityVariant(severity: string) {
  switch (severity) {
    case "critical":
      return "destructive" as const;
    case "high":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function severityColor(severity: string) {
  switch (severity) {
    case "critical":
      return "border-burnt-peach-300 bg-burnt-peach-50";
    case "high":
      return "border-sandy-brown-300 bg-sandy-brown-50";
    default:
      return "border-tuscan-sun-300 bg-tuscan-sun-50";
  }
}

function investmentColor(level: string) {
  switch (level) {
    case "High":
      return "bg-burnt-peach-100 text-burnt-peach-700";
    case "Medium":
      return "bg-tuscan-sun-100 text-tuscan-sun-700";
    default:
      return "bg-verdigris-100 text-verdigris-700";
  }
}

export default function ConclusionsSection({ conclusions, hideHeadline }: ConclusionsSectionProps) {
  // Use actionItems if available, fall back to legacy priorityRecommendations
  const actionItems = conclusions.actionItems;
  const legacyRecs = conclusions.priorityRecommendations;

  return (
    <section id="conclusions" className="space-y-6">
      {/* Headline — hidden when exec summary already covers it */}
      {!hideHeadline && (
        <Card className="border-2">
          <CardContent className="p-6">
            <p className="text-lg font-medium leading-relaxed">
              {conclusions.headline}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Key Findings */}
      {conclusions.keyFindings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle size={14} />
            Key Findings
          </h3>
          <div className="space-y-3">
            {conclusions.keyFindings.map((finding) => (
              <Card
                key={finding.id}
                className={`border ${severityColor(finding.severity)}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Badge variant={severityVariant(finding.severity)} className="shrink-0 mt-0.5">
                      {finding.severity}
                    </Badge>
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-medium">{finding.finding}</p>

                      {/* Business Impact */}
                      {finding.businessImpact && (
                        <p className="text-xs text-burnt-peach-700 font-medium">
                          Predicted Impact: {finding.businessImpact}
                        </p>
                      )}

                      {/* Regulatory Exposure */}
                      {finding.regulatoryExposure && (
                        <p className="text-xs text-muted-foreground">
                          Regulatory: {finding.regulatoryExposure}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {finding.scenariosAffected.length > 0 && (
                          <span>Scenarios: {finding.scenariosAffected.join(", ")}</span>
                        )}
                        {finding.evidenceRef && (
                          <button
                            onClick={() => {
                              const appendix = document.getElementById("appendix");
                              appendix?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="text-royal-azure-600 hover:text-royal-azure-700 underline underline-offset-2"
                          >
                            {finding.evidenceRef}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Action Items Table (new) */}
      {actionItems && actionItems.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recommended Actions
          </h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-medium text-muted-foreground w-8">#</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Predicted Risk Reduction</th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-32">Owner</th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-24">Timeline</th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-24">Investment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionItems.map((item) => (
                      <tr key={item.priority} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-3 font-bold text-muted-foreground">{item.priority}</td>
                        <td className="p-3 font-medium">{item.action}</td>
                        <td className="p-3 text-xs text-muted-foreground">{item.predictedRiskReduction}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {item.suggestedOwner}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs">{item.suggestedTimeline}</td>
                        <td className="p-3">
                          <Badge className={`text-xs ${investmentColor(item.investmentLevel)}`}>
                            {item.investmentLevel}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          {actionItems[0]?.addressesFindings?.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowRight size={10} />
              Each action maps to specific findings above
            </p>
          )}
        </div>
      )}

      {/* Legacy recommendations fallback */}
      {!actionItems?.length && legacyRecs && legacyRecs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Priority Recommendations
          </h3>
          <div className="space-y-2">
            {legacyRecs.map((rec) => (
              <Card key={rec.priority}>
                <CardContent className="p-4 flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {rec.priority}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{rec.recommendation}</p>
                    <Badge variant="outline" className="text-xs">{rec.impact} impact</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
