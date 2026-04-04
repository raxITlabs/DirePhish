"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getExerciseReport, type ExerciseReport } from "@/app/actions/report";
import SegmentedControl, {
  type ReportView,
} from "@/app/components/report/exercise/SegmentedControl";
import BoardView from "@/app/components/report/exercise/BoardView";
import CISOView from "@/app/components/report/exercise/CISOView";
import SecurityTeamView from "@/app/components/report/exercise/SecurityTeamView";
import PlaybookView from "@/app/components/report/exercise/PlaybookView";
import RiskScoreView from "@/app/components/report/exercise/RiskScoreView";
import PlaybookFirstLayout from "@/app/components/report/exercise/PlaybookFirstLayout";
import ExportButton from "@/app/components/report/exercise/ExportButton";
import { Skeleton } from "@/app/components/ui/skeleton";
import { AlertTriangle, Home } from "lucide-react";
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner";
import { Card, CardContent } from "@/app/components/ui/card";
import Link from "next/link";

export default function ExerciseReportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialView = (searchParams.get("view") as ReportView) || "board";
  const [view, setView] = useState<ReportView>(initialView);
  const [report, setReport] = useState<ExerciseReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleViewChange = useCallback(
    (v: ReportView) => {
      setView(v);
      const url = new URL(window.location.href);
      url.searchParams.set("view", v);
      router.replace(url.pathname + url.search, { scroll: false });
    },
    [router],
  );

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
            <AlertTriangle className="text-burnt-peach-500 shrink-0" size={20} />
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
          <AsciiSpinner className="text-lg text-muted-foreground" />
          <div>
            <p className="font-medium">Generating Exercise Report</p>
            <p className="text-sm text-muted-foreground">
              Analyzing simulations, aggregating team performance, running root
              cause analysis, and generating incident response playbook\u2026
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

  // Use PlaybookFirstLayout when attack-path playbook data exists
  const hasAttackPathPlaybook =
    report.attackPathPlaybook && report.attackPathPlaybook.length > 0;

  if (hasAttackPathPlaybook) {
    return <PlaybookFirstLayout report={report} projectId={projectId} />;
  }

  // Fallback: legacy tab layout for reports without attack-path playbook
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center justify-center w-8 h-8 rounded-md bg-pitch-black-100 hover:bg-pitch-black-200 transition-colors"
          >
            <Home size={16} className="text-pitch-black-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">
              {report.companyName || "Exercise"} — Exercise Report
            </h1>
            {report.generatedAt && (
              <p className="text-xs text-muted-foreground">
                {new Date(report.generatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
        </div>
        <SegmentedControl value={view} onChange={handleViewChange} />
      </div>

      {/* View content */}
      {view === "board" && <BoardView report={report} />}
      {view === "ciso" && <CISOView report={report} />}
      {view === "security" && <SecurityTeamView report={report} />}
      {view === "playbook" && <PlaybookView report={report} />}
      {view === "risk-score" && <RiskScoreView report={report} projectId={projectId} />}
    </div>
  );
}
