"use client";

import { useRef, useEffect } from "react";
import { AsciiDivider } from "@/app/components/ascii/DesignSystem";
import MetricsBar from "./MetricsBar";
import ToolCallEntry from "./ToolCallEntry";
import type { AgentLogEntry, ReportProgress, ReportStatus } from "@/app/types";

interface WorkflowTimelineProps {
  entries: AgentLogEntry[];
  progress: ReportProgress | null;
  status: ReportStatus;
}

export default function WorkflowTimeline({
  entries,
  progress,
  status,
}: WorkflowTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const toolCallCount = entries.filter((e) => e.action === "tool_call").length;
  const elapsed =
    entries.length > 0 ? entries[entries.length - 1].elapsed_seconds : 0;
  const sectionsCompleted = progress?.completed_sections?.length ?? 0;
  const totalSections = progress
    ? Math.max(
        progress.completed_sections?.length ?? 0,
        progress.current_section ? sectionsCompleted + 1 : sectionsCompleted
      )
    : 0;

  // Group entries by section_index to insert separators
  let lastSectionIndex: number | undefined;

  return (
    <div className="flex flex-col h-full">
      <MetricsBar
        sectionsCompleted={sectionsCompleted}
        totalSections={totalSections}
        elapsedSeconds={elapsed}
        toolCallCount={toolCallCount}
        status={status}
      />
      <AsciiDivider variant="dots" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1">
        {entries.map((entry, i) => {
          const showSeparator =
            entry.section_index !== undefined &&
            entry.section_index !== lastSectionIndex &&
            lastSectionIndex !== undefined;
          lastSectionIndex = entry.section_index ?? lastSectionIndex;
          return (
            <div key={i}>
              {showSeparator && <AsciiDivider variant="dashed" />}
              <ToolCallEntry entry={entry} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
