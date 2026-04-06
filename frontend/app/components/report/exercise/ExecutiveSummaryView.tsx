"use client";

import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";
import { AsciiSectionHeader, AsciiMetric, AsciiProgressBar } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";

interface Props {
  report: ExerciseReport;
}

function formatDollars(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function dimLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function buildMarkdown(report: ExerciseReport): string {
  const rs = report.riskScore;
  const mc = report.monteCarloStats;
  const actions = report.conclusions?.actionItems ?? [];
  const rootCauses = report.rootCauseAnalysis ?? [];
  const cf = report.counterfactualComparison;

  const totalOutcomes = mc ? Object.values(mc.outcome_distribution).reduce((a, b) => a + b, 0) : 0;
  const containedPct = mc && totalOutcomes > 0
    ? Math.round(((mc.outcome_distribution.contained_early + mc.outcome_distribution.contained_late) / totalOutcomes) * 100)
    : null;

  const lines: string[] = [];
  lines.push(`# Exercise Report — ${report.companyName || "Organization"}`);
  lines.push(`*Generated ${report.generatedAt ? new Date(report.generatedAt).toLocaleDateString() : "N/A"}*`);
  lines.push("");

  if (report.executiveSummary) {
    lines.push("## Executive Summary");
    lines.push("");
    lines.push(report.executiveSummary);
    lines.push("");
  }

  lines.push("## Key Metrics");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  if (rs) lines.push(`| Risk Score | ${rs.composite_score.toFixed(0)}/100 (${rs.interpretation?.label || ""}) |`);
  if (rs?.fair_estimates) lines.push(`| Annual Exposure (ALE) | ${formatDollars(rs.fair_estimates.ale)} |`);
  if (rs?.fair_estimates) lines.push(`| Loss Range | ${formatDollars(rs.fair_estimates.p10_loss)} to ${formatDollars(rs.fair_estimates.p90_loss)} |`);
  if (containedPct !== null) lines.push(`| Containment Rate | ${containedPct}% across ${mc?.iteration_count} variations |`);
  lines.push("");

  if (rs?.dimensions) {
    lines.push("## Score Dimensions");
    lines.push("");
    for (const [key, value] of Object.entries(rs.dimensions)) {
      lines.push(`- **${dimLabel(key)}**: ${(value as number).toFixed(0)}%`);
    }
    lines.push("");
  }

  if (actions.length > 0) {
    lines.push("## Priority Actions");
    lines.push("");
    actions.forEach((a, i) => {
      lines.push(`${i + 1}. **${a.action}** — ${a.suggestedOwner}, ${a.suggestedTimeline}`);
    });
    lines.push("");
  }

  if (rootCauses.length > 0) {
    lines.push("## Root Causes");
    lines.push("");
    rootCauses.forEach(rc => {
      lines.push(`- **${rc.issue}** (${rc.severity})`);
      if (rc.rootCause) lines.push(`  Root cause: ${rc.rootCause}`);
    });
    lines.push("");
  }

  if (cf) {
    lines.push("## What-If Comparison");
    lines.push("");
    lines.push(`- Original: ${cf.original.containment_round ?? "—"} rounds, ${cf.original.total_actions} actions`);
    cf.branches.forEach((b, i) => {
      lines.push(`- Alternate ${i + 1}: ${b.containment_round ?? "—"} rounds, ${b.total_actions} actions`);
    });
    if (cf.divergence_summary) lines.push(`\n${cf.divergence_summary}`);
    lines.push("");
  }

  if (report.disclaimer) {
    lines.push("---");
    lines.push(`*${report.disclaimer}*`);
  }

  return lines.join("\n");
}

function CopyMarkdownButton({ report }: { report: ExerciseReport }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(buildMarkdown(report));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono text-foreground/60 hover:text-foreground hover:bg-muted/50 border border-border/30 transition-colors"
    >
      {copied ? <Check size={13} className="text-verdigris-600" /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy as Markdown"}
    </button>
  );
}

function DownloadMarkdownButton({ report }: { report: ExerciseReport }) {
  return (
    <button
      onClick={() => {
        const md = buildMarkdown(report);
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${report.companyName || "exercise"}-report.md`;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono text-foreground/60 hover:text-foreground hover:bg-muted/50 border border-border/30 transition-colors"
    >
      <Download size={13} />
      Download .md
    </button>
  );
}

export default function ExecutiveSummaryView({ report }: Props) {
  const mc = report.monteCarloStats;
  const actions = report.conclusions?.actionItems ?? [];
  const rootCauses = report.rootCauseAnalysis ?? [];
  const cf = report.counterfactualComparison;
  const rs = report.riskScore;

  const totalOutcomes = mc
    ? Object.values(mc.outcome_distribution).reduce((a, b) => a + b, 0)
    : 0;
  const containedPct =
    mc && totalOutcomes > 0
      ? Math.round(
          ((mc.outcome_distribution.contained_early +
            mc.outcome_distribution.contained_late) /
            totalOutcomes) *
            100,
        )
      : null;

  const dims = rs?.dimensions ? Object.entries(rs.dimensions) as [string, number][] : [];
  const sortedDims = [...dims].sort((a, b) => a[1] - b[1]);
  const topDims = sortedDims.length > 3 ? [sortedDims[0], sortedDims[1], sortedDims[sortedDims.length - 1]] : sortedDims;

  return (
    <div className="space-y-2">
      {/* Row 1: Summary + Metrics sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-2 items-stretch">
        {/* Left: Executive Summary */}
        {report.executiveSummary && (
          <Card className="h-full">
            <CardContent className="py-2.5">
              <div className="flex items-center justify-between">
                <AsciiSectionHeader as="h3" sigil="§">Executive Summary</AsciiSectionHeader>
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton report={report} />
                  <DownloadMarkdownButton report={report} />
                </div>
              </div>
              <div className="text-sm text-foreground leading-relaxed space-y-2">
                {report.executiveSummary.split("\n").filter(Boolean).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Right: Metrics + Dimensions — single card, fills height */}
        <Card className="h-full">
          <CardContent className="py-2.5 flex flex-col h-full">
            <div>
              <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider">Risk Score</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className={`text-xl font-bold font-mono ${
                  rs ? (rs.composite_score >= 70 ? "text-verdigris-600" : rs.composite_score >= 40 ? "text-foreground" : "text-burnt-peach-600") : "text-foreground"
                }`}>
                  {rs ? (
                    <>
                      <span className="text-sm mr-1" aria-hidden="true">{rs.composite_score >= 70 ? "▼" : rs.composite_score >= 40 ? "─" : "▲"}</span>
                      {rs.composite_score.toFixed(0)}
                    </>
                  ) : "—"}
                  <span className="text-sm font-normal text-foreground/40">/100</span>
                </p>
                {rs?.interpretation && (
                  <span className="text-xs text-foreground/60">{rs.interpretation.label}</span>
                )}
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider">Annual Exposure</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className="text-xl font-bold font-mono text-foreground">
                  {rs?.fair_estimates ? formatDollars(rs.fair_estimates.ale) : "—"}
                </p>
                {rs?.fair_estimates && (
                  <span className="text-xs text-foreground/60">
                    {formatDollars(rs.fair_estimates.p10_loss)} to {formatDollars(rs.fair_estimates.p90_loss)}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xs font-mono text-foreground/50 uppercase tracking-wider">Containment</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className={`text-xl font-bold font-mono ${
                  containedPct !== null ? (containedPct >= 70 ? "text-verdigris-600" : "text-burnt-peach-600") : "text-foreground"
                }`}>
                  {containedPct !== null ? `${containedPct}%` : "—"}
                </p>
                <span className="text-xs text-foreground/60">
                  {mc ? `across ${mc.iteration_count} variations` : ""}
                </span>
              </div>
            </div>

            {/* Key Dimensions — pushed to bottom */}
            {topDims.length > 0 && (
              <div className="mt-auto pt-3 border-t border-border/20">
                <AsciiSectionHeader as="h4" sigil="▣">Key Dimensions</AsciiSectionHeader>
                <div className="space-y-1.5 mt-2">
                  {topDims.map(([key, value]) => {
                    const barColor = value >= 70 ? "text-verdigris-500" : value >= 40 ? "text-tuscan-sun-500" : "text-burnt-peach-500";
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground w-36">{dimLabel(key)}</span>
                        <AsciiProgressBar value={value} max={100} width={12} color={barColor} label={`${dimLabel(key)}: ${value.toFixed(0)}%`} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Cost Drivers + Priority Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-stretch">
        {/* Cost breakdown card */}
        {rs?.fair_estimates && rs.fair_estimates.ale > 0 && (
          <Card>
            <CardContent className="py-2.5">
              <AsciiSectionHeader as="h4" sigil="$">What Drives This Cost</AsciiSectionHeader>
              <div className="space-y-2">
                <CostLine label="Team response time" detail={`${rs.fair_estimates.calibration_inputs?.team_size || 8} responders pulled from normal work`} />
                <CostLine label="Business disruption" detail="Systems isolated, deployments frozen during incident" />
                <CostLine label="IR mobilization" detail={`${Math.round((rs.fair_estimates.calibration_inputs?.incident_response_retainer || 250000) * 0.1 / 1000)}K of retainer activated`} />
                <CostLine label="Post-incident work" detail="Forensics, policy updates, lessons learned" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Priority Actions card */}
        {actions.length > 0 && (
          <Card>
            <CardContent className="py-2.5">
              <AsciiSectionHeader as="h4" sigil="»">Priority Actions</AsciiSectionHeader>
              <div className="space-y-2">
                {actions.slice(0, 3).map((a, i) => (
                  <div key={i} className="flex items-start gap-3 py-1">
                    <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground/70 shrink-0 mt-0.5">
                      {a.priority}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground">{a.action}</p>
                      <p className="text-[10px] text-foreground/60 mt-0.5">
                        {a.suggestedOwner} · {a.suggestedTimeline}
                      </p>
                    </div>
                  </div>
                ))}
                {actions.length > 3 && (
                  <p className="text-xs text-foreground/50 pl-8">
                    +{actions.length - 3} more in full report
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Row 3: Root Causes + Counterfactual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-stretch">
        {/* Root Causes card */}
        {rootCauses.length > 0 && (
          <Card>
            <CardContent className="py-2.5">
              <AsciiSectionHeader as="h4" sigil="├">Root Causes</AsciiSectionHeader>
              <div className="space-y-2">
                {rootCauses.slice(0, 3).map((rc, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 py-0.5">
                    <p className="text-xs text-foreground flex-1">{rc.issue}</p>
                    <span className={`text-xs font-mono shrink-0 ${
                      rc.severity === "critical" ? "text-burnt-peach-600 font-semibold" : "text-foreground/60"
                    }`}>
                      {rc.severity}
                    </span>
                  </div>
                ))}
                {rootCauses.length > 3 && (
                  <p className="text-xs text-foreground/50">
                    +{rootCauses.length - 3} more in full report
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Counterfactual card */}
        {cf && (
          <Card>
            <CardContent className="py-2.5">
              <AsciiSectionHeader as="h4" sigil="↕">What-If Comparison</AsciiSectionHeader>
              <div className="flex items-baseline gap-4 text-xs">
                <span className="text-foreground">
                  Original: <strong>{cf.original.containment_round ?? "—"} rounds</strong>, {cf.original.total_actions} actions
                </span>
                {cf.branches.map((branch, i) => (
                  <span key={i} className="text-foreground/70">
                    Alternate {i + 1}: <strong>{branch.containment_round ?? "—"} rounds</strong>, {branch.total_actions} actions
                  </span>
                ))}
              </div>
              {cf.divergence_summary && (
                <p className="text-[11px] text-foreground/60 mt-1.5 leading-relaxed">
                  {cf.divergence_summary}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CostLine({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-foreground/80 font-medium">{label}</span>
      <span className="text-xs text-foreground/60">{detail}</span>
    </div>
  );
}
