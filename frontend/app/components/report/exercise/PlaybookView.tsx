"use client";

import { useState } from "react";
import { Card, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Download } from "lucide-react";
import { AsciiSectionHeader, AsciiEmptyState } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";

interface PlaybookViewProps {
  report: ExerciseReport;
}

interface PlaybookSection {
  number: number;
  title: string;
  color: string;
  badgeBg: string;
  items: { label: string; entries: string[] }[];
}

export default function PlaybookView({ report }: PlaybookViewProps) {
  const playbook = report.playbook;

  if (!playbook) {
    return (
      <AsciiEmptyState
        title="Playbook not available"
        description="Run the full pipeline with Monte Carlo analysis to generate."
        sigil="□"
      />
    );
  }

  const sections: PlaybookSection[] = [
    {
      number: 1,
      title: "Overview",
      color: "border-royal-azure-200",
      badgeBg: "bg-royal-azure-500",
      items: [
        { label: "Incident Type", entries: [playbook.overview.incidentType] },
        { label: "Scope", entries: [playbook.overview.scope] },
        { label: "Regulatory Context", entries: [playbook.overview.regulatoryContext] },
      ],
    },
    {
      number: 2,
      title: "Evidence Acquisition",
      color: "border-royal-azure-200",
      badgeBg: "bg-royal-azure-500",
      items: [
        { label: "Log Sources", entries: playbook.evidenceAcquisition.logSources },
        { label: "AWS-Specific", entries: playbook.evidenceAcquisition.awsSpecific },
        { label: "Chain of Custody", entries: playbook.evidenceAcquisition.chainOfCustody },
        { label: "Data Classification", entries: [playbook.evidenceAcquisition.dataClassification] },
      ],
    },
    {
      number: 3,
      title: "Containment",
      color: "border-tuscan-sun-200",
      badgeBg: "bg-tuscan-sun-500",
      items: [
        { label: "Immediate Actions", entries: playbook.containment.immediateActions },
        { label: "IAM Revocation", entries: playbook.containment.iamRevocation },
        { label: "Network Isolation", entries: playbook.containment.networkIsolation },
        { label: "Service Suspension", entries: playbook.containment.serviceSuspension },
      ],
    },
    {
      number: 4,
      title: "Eradication",
      color: "border-burnt-peach-200",
      badgeBg: "bg-burnt-peach-500",
      items: [
        { label: "Root Cause Removal", entries: playbook.eradication.rootCauseRemoval },
        { label: "Credential Rotation", entries: playbook.eradication.credentialRotation },
        { label: "Patch Requirements", entries: playbook.eradication.patchRequirements },
        { label: "Config Remediation", entries: playbook.eradication.configRemediation },
      ],
    },
    {
      number: 5,
      title: "Recovery",
      color: "border-verdigris-200",
      badgeBg: "bg-verdigris-500",
      items: [
        { label: "Restoration Sequence", entries: playbook.recovery.restorationSequence },
        { label: "Verification Steps", entries: playbook.recovery.verificationSteps },
        { label: "Communication Plan", entries: playbook.recovery.communicationPlan },
        { label: "Regulatory Timeline", entries: playbook.recovery.regulatoryTimeline },
      ],
    },
    {
      number: 6,
      title: "Post-Incident",
      color: "border-verdigris-200",
      badgeBg: "bg-verdigris-500",
      items: [
        { label: "Lessons Learned", entries: playbook.postIncident.lessonsLearned },
        { label: "Policy Updates", entries: playbook.postIncident.policyUpdates },
        { label: "Training Recommendations", entries: playbook.postIncident.trainingRecommendations },
        { label: "Next Exercise", entries: [playbook.postIncident.nextExerciseSchedule] },
      ],
    },
  ];

  const handleExportMarkdown = () => {
    const lines: string[] = [];
    lines.push("# Incident Response Playbook (NIST SP 800-61r2)");
    lines.push(`\n> Generated from ${report.companyName || "Exercise"} simulation on ${report.generatedAt ? new Date(report.generatedAt).toLocaleDateString() : "N/A"}`);
    lines.push("");

    for (const section of sections) {
      lines.push(`\n## Part ${section.number}: ${section.title}\n`);
      for (const item of section.items) {
        lines.push(`### ${item.label}\n`);
        for (const entry of item.entries) {
          lines.push(`- [ ] ${entry}`);
        }
        lines.push("");
      }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `playbook-${report.projectId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <AsciiSectionHeader as="h2" sigil="☐">Incident Response Playbook</AsciiSectionHeader>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            NIST SP 800-61r2 format — scenario-specific procedures
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportMarkdown}>
          <Download size={14} className="mr-1.5" />
          Export Markdown
        </Button>
      </div>

      {/* Sections */}
      {sections.map((section) => (
        <CollapsibleSection key={section.number} section={section} />
      ))}
    </div>
  );
}

function CollapsibleSection({ section }: { section: PlaybookSection }) {
  const [open, setOpen] = useState(true);

  return (
    <Card className={`${section.color}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-pitch-black-50/50 transition-colors rounded-t-lg"
      >
        <span
          className={`w-7 h-7 rounded-full ${section.badgeBg} flex items-center justify-center text-xs font-bold text-white shrink-0`}
        >
          {section.number}
        </span>
        <span className="text-sm font-semibold text-pitch-black-800 flex-1">
          Part {section.number}: {section.title}
        </span>
        <span className="text-primary font-mono select-none" aria-hidden="true">
          {open ? "▼" : "▶"}
        </span>
      </button>

      {open && (
        <CardContent className="pt-0 pb-4 px-4 space-y-4">
          {section.items.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <p className="text-xs font-semibold text-pitch-black-500 uppercase tracking-wider">
                {item.label}
              </p>
              <div className="space-y-1">
                {item.entries.map((entry, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2.5 p-2 rounded-md hover:bg-pitch-black-50 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-pitch-black-300 text-royal-azure-600 focus:ring-royal-azure-500"
                    />
                    <span className="text-sm text-pitch-black-700 leading-relaxed">
                      {entry}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
