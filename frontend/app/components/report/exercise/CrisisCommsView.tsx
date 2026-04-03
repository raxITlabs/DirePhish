"use client";

import { useState } from "react";
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

const AUDIENCE_ICONS: Record<string, string> = {
  board_executive: "📋",
  technical_team: "🔧",
  customer_notification: "📨",
  regulatory_filing: "⚖️",
  employee_comms: "👥",
};

export default function CrisisCommsView({ report }: { report: ExerciseReport }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const comms: CrisisComm[] = report.crisisComms || [];

  if (!comms.length) {
    return (
      <div className="rounded-lg border border-border/40 bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Crisis communications were not generated for this report.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Run a new pipeline to generate scenario-specific communication drafts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Crisis Communications</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Scenario-specific drafts pre-filled with simulation data. Ready to adapt for a real incident.
        </p>
      </div>

      <div className="space-y-3">
        {comms.map((comm) => {
          const isExpanded = expandedId === comm.audience;
          return (
            <div
              key={comm.audience}
              className="rounded-lg border border-border/40 bg-card overflow-hidden"
            >
              {/* Header — always visible */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : comm.audience)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/20 transition-colors"
              >
                <span className="text-lg shrink-0">
                  {AUDIENCE_ICONS[comm.audience] || "📄"}
                </span>
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
                <span className="text-muted-foreground/40 text-sm shrink-0">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </button>

              {/* Body — expandable */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border/20">
                  <div className="mt-3 mb-2">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Subject</span>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{comm.subject}</p>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-4 text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono">
                    {comm.body}
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[10px] font-mono text-muted-foreground">
                    <span>Tone: {comm.tone?.replace("_", " ")}</span>
                    <span className="text-border">·</span>
                    <span>Generated from simulation data</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
