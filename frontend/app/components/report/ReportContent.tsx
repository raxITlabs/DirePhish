"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Download } from "lucide-react";
import ReportSection from "./ReportSection";
import { getReportDownloadUrl } from "@/app/actions/report";
import type {
  ReportOutline,
  ReportSectionData,
  ReportProgress,
} from "@/app/types";

interface ReportContentProps {
  outline: ReportOutline | null;
  sections: ReportSectionData[];
  progress: ReportProgress | null;
  reportId: string | null;
}

export default function ReportContent({
  outline,
  sections,
  progress,
  reportId,
}: ReportContentProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (reportId) {
      getReportDownloadUrl(reportId).then(setDownloadUrl);
    }
  }, [reportId]);

  const allComplete =
    outline &&
    outline.sections.length > 0 &&
    sections.length >= outline.sections.length;

  function getSectionStatus(
    sectionTitle: string,
    sectionIndex: number
  ): "pending" | "generating" | "complete" {
    const match = sections.find((s) => s.section_index === sectionIndex);
    if (match && match.content) return "complete";
    if (progress?.current_section === sectionTitle) return "generating";
    return "pending";
  }

  if (!outline) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="space-y-3 mt-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-xl">{outline.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {outline.summary}
              </p>
            </div>
            {reportId && (
              <Badge variant="outline" className="font-mono text-xs shrink-0">
                {reportId.slice(0, 8)}
              </Badge>
            )}
          </div>
        </CardHeader>
        {allComplete && reportId && downloadUrl && (
          <CardContent>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <Download size={14} className="mr-1" />
                Download Report
              </Button>
            </a>
          </CardContent>
        )}
      </Card>

      <div className="space-y-2">
        {outline.sections.map((sec, i) => {
          const idx = i + 1;
          const status = getSectionStatus(sec.title, idx);
          const matched = sections.find((s) => s.section_index === idx);
          return (
            <ReportSection
              key={idx}
              index={idx}
              title={sec.title}
              content={matched?.content ?? ""}
              status={status}
              defaultOpen={status !== "pending"}
            />
          );
        })}
      </div>
    </div>
  );
}
