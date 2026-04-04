"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/app/components/ui/button";
import { AsciiStatus, AsciiSkeleton } from "@/app/components/ascii/DesignSystem";

interface ReportSectionProps {
  index: number;
  title: string;
  content: string;
  status: "pending" | "generating" | "complete";
  defaultOpen?: boolean;
}

function formatIndex(n: number): string {
  return n.toString().padStart(2, "0");
}

const STATUS_TO_ASCII = {
  pending: "pending",
  generating: "running",
  complete: "complete",
} as const;

export default function ReportSection({
  index,
  title,
  content,
  status,
  defaultOpen = false,
}: ReportSectionProps) {
  const [open, setOpen] = useState(
    status === "generating" || status === "complete" ? defaultOpen : false
  );

  return (
    <div className="border border-border/20 rounded-lg">
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between px-4 py-3 h-auto"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 font-mono">
          <span className="text-primary select-none text-xs" aria-hidden="true">
            {open ? "▼" : "▶"}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatIndex(index)}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            {title}
          </span>
        </div>
        <AsciiStatus
          status={STATUS_TO_ASCII[status]}
          label={status === "generating" ? "Generating" : undefined}
        />
      </Button>

      {open && status === "generating" && (
        <div className="px-4 pb-4">
          <AsciiSkeleton lines={3} widths={[100, 75, 85]} label="Generating section content..." />
        </div>
      )}

      {open && status === "complete" && content && (
        <div className="px-4 pb-4 text-sm text-muted-foreground prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
