"use client";

import { AsciiStatus, AsciiMetric, AsciiDivider } from "@/app/components/ascii/DesignSystem";
import type { ReportStatus } from "@/app/types";

interface MetricsBarProps {
  sectionsCompleted: number;
  totalSections: number;
  elapsedSeconds: number;
  toolCallCount: number;
  status: ReportStatus;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STATUS_MAP: Record<string, "pending" | "running" | "complete" | "failed"> = {
  PLANNING: "running",
  GENERATING: "running",
  COMPLETED: "complete",
  FAILED: "failed",
};

export default function MetricsBar({
  sectionsCompleted,
  totalSections,
  elapsedSeconds,
  toolCallCount,
  status,
}: MetricsBarProps) {
  const progress = totalSections > 0
    ? Math.round((sectionsCompleted / totalSections) * 100)
    : 0;

  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-center gap-4">
        <AsciiStatus
          status={STATUS_MAP[status] ?? "pending"}
          label={status === "PLANNING" ? "Planning" : undefined}
        />
        <span className="font-mono text-muted-foreground/30 select-none" aria-hidden="true">│</span>
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
          <AsciiMetric label="Sections" value={`${sectionsCompleted}/${totalSections}`} />
          <AsciiMetric label="Elapsed" value={formatElapsed(elapsedSeconds)} />
          <AsciiMetric label="Tool Calls" value={String(toolCallCount)} />
          <AsciiMetric label="Progress" value={`${progress}%`} />
        </div>
      </div>
      <AsciiDivider variant="dots" />
    </div>
  );
}
