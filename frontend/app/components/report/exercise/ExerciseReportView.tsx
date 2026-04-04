"use client";

import { useCallback } from "react";
import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/app/components/ui/button";
import { AsciiSectionHeader, AsciiDivider, AsciiAlert } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";
import ExerciseKPIStrip from "./ExerciseKPIStrip";
import ExerciseTOCSidebar from "./ExerciseTOCSidebar";
import ConclusionsSection from "./ConclusionsSection";
import TeamPerformanceSection from "./TeamPerformanceSection";
import RootCauseSection from "./RootCauseSection";
import MethodologySection from "./MethodologySection";
import AppendixSection from "./AppendixSection";

interface ExerciseReportViewProps {
  report: ExerciseReport;
}

function buildMarkdownExport(report: ExerciseReport): string {
  const lines: string[] = [];
  lines.push(`# ${report.companyName || "Exercise"} — Simulation Exercise Report`);
  lines.push("");

  // Disclaimer
  if (report.disclaimer) {
    lines.push(`> ${report.disclaimer}`);
    lines.push("");
  }

  if (report.generatedAt) {
    lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleDateString()}`);
    lines.push("");
  }

  // Executive Summary
  if (report.executiveSummary) {
    lines.push("## Executive Summary\n");
    lines.push(report.executiveSummary);
    lines.push("");
  }

  // Conclusions
  if (report.conclusions) {
    lines.push("## Conclusions\n");
    lines.push(`> ${report.conclusions.headline}`);
    lines.push("");

    if (report.conclusions.keyFindings.length > 0) {
      lines.push("### Key Findings\n");
      for (const f of report.conclusions.keyFindings) {
        lines.push(`- **[${f.severity.toUpperCase()}]** ${f.finding}`);
        if (f.businessImpact) lines.push(`  - Predicted Impact: ${f.businessImpact}`);
        if (f.regulatoryExposure) lines.push(`  - Regulatory: ${f.regulatoryExposure}`);
        if (f.scenariosAffected.length > 0) lines.push(`  - Scenarios: ${f.scenariosAffected.join(", ")}`);
        if (f.evidenceRef) lines.push(`  - ${f.evidenceRef}`);
      }
      lines.push("");
    }

    // Action table
    const items = report.conclusions.actionItems || report.conclusions.priorityRecommendations;
    if (items && items.length > 0) {
      lines.push("### Recommended Actions\n");
      if (report.conclusions.actionItems) {
        lines.push("| # | Action | Risk Reduction | Owner | Timeline | Investment |");
        lines.push("|---|--------|---------------|-------|----------|------------|");
        for (const a of report.conclusions.actionItems) {
          lines.push(`| ${a.priority} | ${a.action} | ${a.predictedRiskReduction} | ${a.suggestedOwner} | ${a.suggestedTimeline} | ${a.investmentLevel} |`);
        }
      } else if (report.conclusions.priorityRecommendations) {
        for (const r of report.conclusions.priorityRecommendations) {
          lines.push(`${r.priority}. **[${r.impact}]** ${r.recommendation}`);
        }
      }
      lines.push("");
    }
  }

  // Team Performance
  if (report.teamPerformance?.teams.length) {
    lines.push("## Team Performance\n");
    for (const team of report.teamPerformance.teams) {
      const scores = Object.entries(team.scores).map(([k, v]) => `${k}: ${v}/10`).join(", ");
      lines.push(`### ${team.name}\n`);
      lines.push(`Scores: ${scores}`);
      if (team.narrative) lines.push(`\n${team.narrative}`);
      lines.push("");
    }
  }

  // Heatmap (scenario comparison table)
  if (report.teamPerformance?.heatmapData?.length) {
    const hm = report.teamPerformance.heatmapData;
    const scenarios = Array.from(new Set(hm.map((d) => d.scenario)));
    const dims = ["responseSpeed", "containmentEffectiveness", "communicationQuality", "complianceAdherence", "leadershipDecisiveness"];
    const dimLabels = ["Speed", "Containment", "Communication", "Compliance", "Leadership"];
    const scoreMap = new Map(hm.map((d) => [`${d.scenario}::${d.dimension}`, d.score]));

    lines.push("### Scenario Comparison\n");
    lines.push(`| Scenario | ${dimLabels.join(" | ")} |`);
    lines.push(`|----------|${dimLabels.map(() => "---").join("|")}|`);
    for (const s of scenarios) {
      const scores = dims.map((d) => String(scoreMap.get(`${s}::${d}`) ?? "—"));
      lines.push(`| ${s} | ${scores.join(" | ")} |`);
    }
    lines.push("");
  }

  // Root Causes
  if (report.rootCauseAnalysis?.length) {
    lines.push("## Root Cause Analysis\n");
    for (const rc of report.rootCauseAnalysis) {
      lines.push(`### ${rc.issue} [${rc.severity}]\n`);
      if (rc.mitreReference) lines.push(`MITRE: ${rc.mitreReference}\n`);
      if (rc.predictedBusinessImpact) lines.push(`Predicted Impact: ${rc.predictedBusinessImpact}\n`);
      for (const why of rc.fiveWhys) {
        lines.push(`**Why ${why.level}:** ${why.question}`);
        lines.push(`> ${why.answer}\n`);
      }
      lines.push(`**Root Cause:** ${rc.rootCause}\n`);
    }
  }

  // Methodology
  if (report.methodology) {
    lines.push("## Methodology\n");
    lines.push(report.methodology.simulationApproach);
    lines.push("");
    lines.push(`- Scenarios: ${report.methodology.scenarioCount}`);
    lines.push(`- Agents: ${report.methodology.agentCount}`);
    lines.push(`- Total Rounds: ${report.methodology.totalRounds}`);
    lines.push(`- Total Actions: ${report.methodology.totalActions}`);
    lines.push("");

    // Attack paths
    if (report.methodology.attackPaths?.length) {
      lines.push("### Simulated Attack Paths\n");
      for (const path of report.methodology.attackPaths) {
        lines.push(`**${path.title}** (${path.threatName})\n`);
        for (const step of path.killChain) {
          lines.push(`${step.step}. [${step.technique}] ${step.tactic} → ${step.target}: ${step.description}`);
        }
        lines.push("");
      }
    }
  }

  // Cost Summary
  if (report.costs && report.costs.breakdown.length > 0) {
    lines.push("## Cost Summary\n");
    lines.push(`Total exercise cost: $${report.costs.totalUsd.toFixed(2)}\n`);
    lines.push("| Phase | Cost | Input Tokens | Output Tokens |");
    lines.push("|-------|------|-------------|---------------|");
    for (const row of report.costs.breakdown) {
      lines.push(`| ${row.phase} | $${row.usd.toFixed(4)} | ${row.inputTokens.toLocaleString()} | ${row.outputTokens.toLocaleString()} |`);
    }
    lines.push(`| **Total** | **$${report.costs.totalUsd.toFixed(4)}** | **${report.costs.totalInputTokens.toLocaleString()}** | **${report.costs.totalOutputTokens.toLocaleString()}** |`);
    if (report.costs.model) {
      lines.push(`\nModel: ${report.costs.model}`);
    }
    lines.push("");
  }

  // Appendix
  if (report.appendix?.scenarioDetails.length) {
    lines.push("## Appendix — Detailed Scenario Analysis\n");
    for (const detail of report.appendix.scenarioDetails) {
      lines.push(`### ${detail.title}\n`);
      if (detail.executiveSummary) lines.push(detail.executiveSummary + "\n");
      if (detail.communicationAnalysis) {
        lines.push("#### Communication Analysis\n");
        lines.push(detail.communicationAnalysis + "\n");
      }
      if (detail.tensions) {
        lines.push("#### Tensions & Conflicts\n");
        lines.push(detail.tensions + "\n");
      }
    }
  }

  return lines.join("\n");
}

export default function ExerciseReportView({ report }: ExerciseReportViewProps) {
  const tocItems = [
    ...(report.executiveSummary ? [{ id: "executive-summary", label: "Executive Summary" }] : []),
    { id: "conclusions", label: "Conclusions" },
    { id: "team-performance", label: "Team Performance" },
    { id: "root-causes", label: "Root Cause Analysis" },
    { id: "methodology", label: "Methodology" },
    {
      id: "appendix",
      label: "Appendix",
      children:
        report.appendix?.scenarioDetails.map((s) => ({
          id: `appendix-${s.scenarioId}`,
          label: s.title,
        })) ?? [],
    },
  ];

  const handleDownload = useCallback(() => {
    const md = buildMarkdownExport(report);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.companyName || "exercise"}-report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [report]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Sticky KPI Strip */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b pb-4 pt-4 px-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-xl font-bold">
              {report.companyName ?? "Exercise"} — Simulation Exercise Report
            </h1>
            {report.generatedAt && (
              <p className="text-xs text-muted-foreground">
                Generated {new Date(report.generatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download size={14} className="mr-1" />
              Download
            </Button>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-1 rounded-md border border-input bg-background px-3 h-8 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <ArrowLeft size={14} />
              Home
            </Link>
          </div>
        </div>
        <ExerciseKPIStrip report={report} />
      </div>

      {/* Two-column layout */}
      <div className="flex gap-8 px-6 pt-6">
        <aside className="hidden lg:block w-48 shrink-0">
          <ExerciseTOCSidebar items={tocItems} />
        </aside>

        <main className="flex-1 min-w-0 space-y-12 pb-24">
          {/* Disclaimer */}
          {report.disclaimer && (
            <AsciiAlert variant="info" title="Disclaimer">
              {report.disclaimer}
            </AsciiAlert>
          )}

          {/* Executive Summary */}
          {report.executiveSummary && (
            <section id="executive-summary" className="space-y-3">
              <AsciiSectionHeader as="h2">Executive Summary</AsciiSectionHeader>
              <div className="prose prose-sm max-w-none leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {report.executiveSummary}
                </ReactMarkdown>
              </div>
            </section>
          )}

          {report.executiveSummary && report.conclusions && <AsciiDivider variant="dots" />}

          {/* Conclusions (hide headline if exec summary already shown — avoids duplication) */}
          {report.conclusions && (
            <ConclusionsSection
              conclusions={report.conclusions}
              hideHeadline={!!report.executiveSummary}
            />
          )}

          {/* Team Performance */}
          {report.teamPerformance && (
            <>
              <AsciiDivider variant="dots" />
              <TeamPerformanceSection teamPerformance={report.teamPerformance} />
            </>
          )}

          {/* Root Cause Analysis */}
          {report.rootCauseAnalysis && report.rootCauseAnalysis.length > 0 && (
            <>
              <AsciiDivider variant="dots" />
              <RootCauseSection rootCauses={report.rootCauseAnalysis} />
            </>
          )}

          {/* Methodology */}
          {report.methodology && (
            <>
              <AsciiDivider variant="dots" />
              <MethodologySection methodology={report.methodology} costs={report.costs} />
            </>
          )}

          {/* Appendix */}
          {report.appendix && (
            <>
              <AsciiDivider variant="labeled" label="APPENDIX" />
              <AppendixSection appendix={report.appendix} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
