"use client";

import { useCallback } from "react";
import type { ExerciseReport, AttackPathStep } from "@/app/actions/report";

interface ExportButtonProps {
  report: ExerciseReport;
}

function generateMarkdown(report: ExerciseReport): string {
  const steps = report.attackPathPlaybook ?? [];
  const company = report.companyName ?? "Exercise";
  const date = report.generatedAt
    ? new Date(report.generatedAt).toLocaleDateString()
    : "";

  let md = `# ${company} — Attack Path Playbook\n\nGenerated: ${date}\nPowered by DirePhish\n\n`;

  if (report.methodology?.attackPaths?.[0]) {
    const ap = report.methodology.attackPaths[0];
    md += `## Attack Path: ${ap.title}\nThreat: ${ap.threatName}\n\n`;
  }

  md += `---\n\n`;

  for (const step of steps) {
    md += `## Step ${step.step_index + 1}: ${step.tactic} (${step.technique_id})\n\n`;
    md += `${step.description}\n\n`;

    if (step.evidence) {
      md += `**Evidence:** Containment rate: ${step.evidence.containment_rate}`;
      if (step.evidence.avg_detection_round > 0) {
        md += ` | Avg detection: Round ${step.evidence.avg_detection_round}`;
      }
      if (step.evidence.systems_affected > 0) {
        md += ` | ${step.evidence.systems_affected} systems affected`;
      }
      md += `\n\n`;
    }

    if (step.response_actions.length > 0) {
      md += `### Response Actions\n\n`;
      for (const action of step.response_actions) {
        md += `#### ${action.priority.toUpperCase()}: ${action.title}\n\n`;
        md += `${action.description}\n\n`;
        if (action.commands.length > 0) {
          md += "```\n";
          for (const cmd of action.commands) {
            md += `${cmd}\n`;
          }
          md += "```\n\n";
        }
        md += `- **Owner:** ${action.owner}\n`;
        md += `- **SLA:** ${action.sla}\n`;
        if (action.regulatory_refs.length > 0) {
          md += `- **Regulatory:** ${action.regulatory_refs.join(", ")}\n`;
        }
        md += `\n`;
      }
    }

    if (step.what_if.length > 0) {
      md += `### What-If Scenarios\n\n`;
      for (const wi of step.what_if) {
        md += `- **${wi.scenario}**: Containment ${wi.containment_delta}, ${wi.rounds_delta > 0 ? "+" : ""}${wi.rounds_delta} rounds, ${wi.exposure_delta} exposure _(${wi.source})_\n`;
      }
      md += `\n`;
    }

    if (step.regulatory_timeline.length > 0) {
      md += `### Regulatory Timeline\n\n`;
      for (const rt of step.regulatory_timeline) {
        md += `- **${rt.time}** — ${rt.action}\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

export default function ExportButton({ report }: ExportButtonProps) {
  const handlePrintPDF = useCallback(() => {
    window.print();
  }, []);

  const handleExportMarkdown = useCallback(() => {
    const md = generateMarkdown(report);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `playbook-${report.projectId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  return (
    <div className="flex gap-2">
      <button
        onClick={handleExportMarkdown}
        className="px-3 py-1.5 text-xs font-medium rounded-md border border-pitch-black-200 text-pitch-black-500 hover:bg-pitch-black-50 transition-colors print:hidden"
      >
        Markdown
      </button>
      <button
        onClick={handlePrintPDF}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-tuscan-sun-500 text-white hover:bg-tuscan-sun-600 transition-colors print:hidden"
      >
        Export PDF
      </button>
    </div>
  );
}
