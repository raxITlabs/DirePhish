"use client";

import { useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Search,
  Globe,
  Zap,
  Users,
  ClipboardList,
  FileText,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { AgentLogEntry } from "@/app/types";

interface ToolCallEntryProps {
  entry: AgentLogEntry;
}

function getIcon(entry: AgentLogEntry) {
  const size = 16;
  switch (entry.action) {
    case "planning_start":
    case "planning_complete":
      return <ClipboardList size={size} />;
    case "section_start":
    case "section_complete":
      return <FileText size={size} />;
    case "tool_call":
    case "tool_result": {
      const toolName = entry.details?.tool_name as string | undefined;
      switch (toolName) {
        case "insight_forge":
          return <Search size={size} />;
        case "panorama_search":
          return <Globe size={size} />;
        case "quick_search":
          return <Zap size={size} />;
        case "interview_agents":
          return <Users size={size} />;
        default:
          return <Search size={size} />;
      }
    }
    case "llm_response":
      return <Bot size={size} />;
    case "report_start":
    case "report_complete":
      return <CheckCircle size={size} />;
    default:
      return <Search size={size} />;
  }
}

function getDescription(entry: AgentLogEntry): string {
  switch (entry.action) {
    case "report_start":
      return "Report generation started";
    case "planning_start":
      return "Planning outline...";
    case "planning_complete":
      return "Outline complete";
    case "section_start":
      return `Generating: ${entry.section_title ?? "Unknown section"}`;
    case "section_complete":
      return `Section ${entry.section_index ?? "?"} complete`;
    case "tool_call":
      return `Calling ${(entry.details?.tool_name as string) ?? "tool"}`;
    case "tool_result":
      return `${(entry.details?.tool_name as string) ?? "tool"} returned`;
    case "llm_response":
      return "LLM generating content";
    case "report_complete":
      return "Report complete";
    default:
      return entry.action;
  }
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ToolCallEntry({ entry }: ToolCallEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    (entry.action === "tool_call" || entry.action === "tool_result") &&
    entry.details &&
    Object.keys(entry.details).length > 0;

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground shrink-0">{getIcon(entry)}</span>
        <span className="font-mono text-xs text-muted-foreground shrink-0">
          {formatElapsed(entry.elapsed_seconds)}
        </span>
        <span className="text-sm truncate">{getDescription(entry)}</span>
        {entry.section_index !== undefined && (
          <Badge variant="outline" className="text-xs shrink-0">
            S{entry.section_index}
          </Badge>
        )}
        {hasDetails && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </Button>
        )}
      </div>
      {expanded && hasDetails && (
        <pre className="font-mono text-xs max-h-40 overflow-y-auto bg-muted p-2 rounded ml-6">
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      )}
    </div>
  );
}
