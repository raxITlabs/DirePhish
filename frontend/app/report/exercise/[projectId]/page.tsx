"use client";

import { use, useEffect, useState } from "react";
import { getExerciseReport, type ExerciseReport } from "@/app/actions/report";
import ExerciseReportView from "@/app/components/report/exercise/ExerciseReportView";
import { Skeleton } from "@/app/components/ui/skeleton";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";

export default function ExerciseReportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [report, setReport] = useState<ExerciseReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    async function poll() {
      const result = await getExerciseReport(projectId);
      if (cancelled) return;

      if ("error" in result) {
        setError(result.error);
        return;
      }

      const data = result.data;
      if (data.status === "complete") {
        setReport(data);
        return;
      }
      if (data.status === "failed") {
        setError(data.error ?? "Report generation failed");
        return;
      }

      // Still generating — poll again
      timeout = setTimeout(poll, 3000);
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-6 flex items-center gap-3">
            <AlertTriangle className="text-red-500 shrink-0" size={20} />
            <div>
              <p className="font-medium">Report Generation Failed</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-muted-foreground" size={20} />
          <div>
            <p className="font-medium">Generating Exercise Report</p>
            <p className="text-sm text-muted-foreground">
              Analyzing simulations, aggregating team performance, and running root cause analysis...
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  return <ExerciseReportView report={report} />;
}
