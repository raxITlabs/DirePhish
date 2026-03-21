"use client";

import type { Report } from "@/app/types";
import { Button } from "@/app/components/ui/button";

export default function ExportButton({ report }: { report: Report }) {
  const handleExport = () => {
    const md = [
      `# ${report.companyName} — After-Action Report`,
      "",
      `**Scenario:** ${report.scenarioName}`,
      `**Duration:** ${report.duration}`,
      `**Completed:** ${report.completedAt}`,
      "",
      "## Executive Summary",
      report.executiveSummary,
      "",
      "## Communication Analysis",
      report.communicationAnalysis,
      "",
      "## Tensions & Conflicts",
      report.tensions,
      "",
      "## Agent Scores",
      ...report.agentScores.map(
        (s) => `- **${s.name}** (${s.role}): ${s.score}/10`
      ),
      "",
      "## Recommendations",
      ...report.recommendations.map((r) => `- ${r}`),
    ].join("\n");

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${report.simId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      Export Markdown
    </Button>
  );
}
