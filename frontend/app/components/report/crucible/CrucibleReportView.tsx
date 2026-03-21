"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Download, MessageSquare, Swords } from "lucide-react";
import type { CrucibleReport } from "@/app/actions/report";
import { getSimulationCosts } from "@/app/actions/report";
import CrucibleHeroCard from "./CrucibleHeroCard";
import CrucibleMetricsStrip from "./CrucibleMetricsStrip";
import CrucibleTimeline from "./CrucibleTimeline";
import CrucibleAgentGrid from "./CrucibleAgentCard";
import CrucibleRecommendations from "./CrucibleRecommendations";

interface CrucibleReportViewProps {
  report: CrucibleReport;
}

function buildMarkdownExport(report: CrucibleReport): string {
  const lines: string[] = [];
  lines.push(`# ${report.companyName || "Simulation"} — ${report.scenarioName || "After-Action Report"}`);
  lines.push("");
  if (report.completedAt) {
    lines.push(`**Completed:** ${new Date(report.completedAt).toLocaleDateString()}`);
  }
  if (report.duration) lines.push(`**Duration:** ${report.duration}`);
  lines.push("");

  if (report.executiveSummary) {
    lines.push("## Executive Summary\n");
    lines.push(report.executiveSummary);
    lines.push("");
  }

  if (report.timeline && report.timeline.length > 0) {
    lines.push("## Event Timeline\n");
    for (const event of report.timeline) {
      lines.push(`- **Round ${event.round}** — ${event.agent}: ${event.description} (${event.significance})`);
    }
    lines.push("");
  }

  if (report.agentScores && report.agentScores.length > 0) {
    lines.push("## Agent Performance\n");
    for (const agent of report.agentScores) {
      lines.push(`### ${agent.name} (${agent.role}) — Score: ${agent.score}/10\n`);
      if (agent.strengths.length) lines.push(`**Strengths:** ${agent.strengths.join(", ")}`);
      if (agent.weaknesses.length) lines.push(`**Weaknesses:** ${agent.weaknesses.join(", ")}`);
      lines.push(`**Actions:** ${agent.actionCount}\n`);
    }
  }

  if (report.recommendations && report.recommendations.length > 0) {
    lines.push("## Recommendations\n");
    report.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push("");
  }

  if (report.communicationAnalysis) {
    lines.push("## Communication Analysis\n");
    lines.push(report.communicationAnalysis);
    lines.push("");
  }

  if (report.tensions) {
    lines.push("## Tensions & Conflicts\n");
    lines.push(report.tensions);
    lines.push("");
  }

  return lines.join("\n");
}

export default function CrucibleReportView({ report }: CrucibleReportViewProps) {
  const [totalCostUsd, setTotalCostUsd] = useState<number | undefined>();

  useEffect(() => {
    getSimulationCosts(report.simId).then((result) => {
      if ("data" in result) {
        setTotalCostUsd(result.data.total_cost_usd);
      }
    });
  }, [report.simId]);

  const handleDownload = useCallback(() => {
    const md = buildMarkdownExport(report);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.companyName || "report"}-${report.simId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [report]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      {/* Hero + Download */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <CrucibleHeroCard
            companyName={report.companyName}
            scenarioName={report.scenarioName}
            completedAt={report.completedAt}
            duration={report.duration}
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload} className="shrink-0 mt-2">
          <Download size={14} className="mr-1" />
          Download Report
        </Button>
      </div>

      {/* Metrics */}
      <CrucibleMetricsStrip
        agentScores={report.agentScores}
        timeline={report.timeline}
        totalCostUsd={totalCostUsd}
      />

      {/* Executive Summary */}
      {report.executiveSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Executive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert text-base leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.executiveSummary}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {report.timeline && report.timeline.length > 0 && (
        <CrucibleTimeline events={report.timeline} />
      )}

      {/* Agent Performance */}
      {report.agentScores && report.agentScores.length > 0 && (
        <CrucibleAgentGrid agents={report.agentScores} />
      )}

      {/* Recommendations */}
      {report.recommendations && report.recommendations.length > 0 && (
        <CrucibleRecommendations recommendations={report.recommendations} />
      )}

      {/* Communication Analysis */}
      {report.communicationAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare size={18} />
              Communication Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.communicationAnalysis}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tensions */}
      {report.tensions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Swords size={18} />
              Tensions &amp; Conflicts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.tensions}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
