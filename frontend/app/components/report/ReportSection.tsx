"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { ChevronDown, ChevronRight } from "lucide-react";

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

function statusBadge(status: "pending" | "generating" | "complete") {
  switch (status) {
    case "pending":
      return <Badge variant="outline">Pending</Badge>;
    case "generating":
      return (
        <Badge variant="default" className="animate-pulse">
          Generating...
        </Badge>
      );
    case "complete":
      return <Badge variant="secondary">Done</Badge>;
  }
}

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
    <div className="border border-border rounded-lg">
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between px-4 py-3 h-auto"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="text-xs text-muted-foreground font-mono">
            Section {formatIndex(index)}
          </span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        {statusBadge(status)}
      </Button>

      {open && status === "generating" && (
        <div className="px-4 pb-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
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
