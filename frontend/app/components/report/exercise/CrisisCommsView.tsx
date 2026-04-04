"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Briefcase,
  Wrench,
  Mail,
  Scale,
  Users,
  FileText,
  Copy,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";
import { AsciiSectionHeader, AsciiEmptyState } from "@/app/components/ascii/DesignSystem";
import type { ExerciseReport } from "@/app/actions/report";

interface CrisisComm {
  audience: string;
  audienceLabel: string;
  subject: string;
  body: string;
  tone: string;
  urgency: string;
}

const URGENCY_STYLES: Record<string, string> = {
  immediate: "bg-burnt-peach-100 text-burnt-peach-700",
  high: "bg-tuscan-sun-100 text-tuscan-sun-700",
  time_sensitive: "bg-tuscan-sun-50 text-tuscan-sun-600",
  moderate: "bg-royal-azure-50 text-royal-azure-700",
};

const AUDIENCE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  board_executive: Briefcase,
  technical_team: Wrench,
  customer_notification: Mail,
  regulatory_filing: Scale,
  employee_comms: Users,
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied ? <Check size={12} className="text-verdigris-600" /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function CrisisCommsView({ report }: { report: ExerciseReport }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const comms: CrisisComm[] = report.crisisComms || [];

  if (!comms.length) {
    return (
      <AsciiEmptyState
        title="Crisis communications were not generated"
        description="Run a new pipeline to generate scenario-specific communication drafts."
        sigil="✉"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <AsciiSectionHeader as="h2" sigil="✉">Crisis Communications</AsciiSectionHeader>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Scenario-specific drafts pre-filled with simulation data. Ready to adapt for a real incident.
        </p>
      </div>

      <div className="space-y-3">
        {comms.map((comm) => {
          const isExpanded = expandedId === comm.audience;
          const Icon = AUDIENCE_ICONS[comm.audience] || FileText;
          return (
            <Card key={comm.audience} corners={false}>
              {/* Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : comm.audience)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/20 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {comm.audienceLabel}
                    </span>
                    <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${URGENCY_STYLES[comm.urgency] || "bg-muted text-muted-foreground"}`}>
                      {comm.urgency?.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {comm.subject}
                  </p>
                </div>
                <span className="text-primary font-mono select-none shrink-0" aria-hidden="true">
                  {isExpanded ? "▼" : "▶"}
                </span>
              </button>

              {/* Body */}
              {isExpanded && (
                <div className="border-t border-border/20">
                  {/* Subject + Copy */}
                  <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Subject</span>
                      <p className="text-sm font-semibold text-foreground mt-0.5">{comm.subject}</p>
                    </div>
                    <CopyButton text={`Subject: ${comm.subject}\n\n${comm.body}`} />
                  </div>

                  {/* Markdown body */}
                  <div className="mx-4 mb-3 rounded-lg border border-border/30 bg-muted/10 overflow-hidden">
                    <div className="px-4 py-3 prose prose-sm prose-pitch-black max-w-none text-foreground/80 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm [&_p]:leading-relaxed [&_li]:leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {comm.body}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-4 pb-3 flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                    <span>Tone: {comm.tone?.replace("_", " ")}</span>
                    <span className="text-border">|</span>
                    <span>Generated from simulation data</span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
