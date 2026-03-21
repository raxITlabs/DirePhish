"use client";

import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";
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

function statusBadge(status: ReportStatus) {
  switch (status) {
    case "PLANNING":
      return <Badge variant="secondary">Planning</Badge>;
    case "GENERATING":
      return (
        <Badge variant="default" className="animate-pulse">
          Generating
        </Badge>
      );
    case "COMPLETED":
      return <Badge variant="outline">Completed</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}

export default function MetricsBar({
  sectionsCompleted,
  totalSections,
  elapsedSeconds,
  toolCallCount,
  status,
}: MetricsBarProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      {statusBadge(status)}

      <Separator orientation="vertical" className="h-4" />

      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Sections</span>
        <span className="text-sm font-semibold font-mono">
          {sectionsCompleted}/{totalSections}
        </span>
      </div>

      <Separator orientation="vertical" className="h-4" />

      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Elapsed</span>
        <span className="text-sm font-semibold font-mono">
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>

      <Separator orientation="vertical" className="h-4" />

      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Tool Calls</span>
        <span className="text-sm font-semibold font-mono">{toolCallCount}</span>
      </div>

      <Separator orientation="vertical" className="h-4" />

      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Progress</span>
        <span className="text-sm font-semibold font-mono">
          {totalSections > 0
            ? Math.round((sectionsCompleted / totalSections) * 100)
            : 0}
          %
        </span>
      </div>
    </div>
  );
}
