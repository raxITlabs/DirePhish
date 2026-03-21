"use client";

import { useEffect, useState, use } from "react";
import Header from "@/app/components/layout/Header";
import ReportHeader from "@/app/components/report/ReportHeader";
import ReportTimeline from "@/app/components/report/ReportTimeline";
import AgentScoreGrid from "@/app/components/report/AgentScoreGrid";
import ExportButton from "@/app/components/report/ExportButton";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Button } from "@/app/components/ui/button";
import { getReport } from "@/app/actions/report";
import type { Report } from "@/app/types";

export default function ReportPage({
  params,
}: {
  params: Promise<{ simId: string }>;
}) {
  const { simId } = use(params);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await getReport(simId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setReport(result.data);
    };
    load();
  }, [simId]);

  // Poll while generating
  useEffect(() => {
    if (!report || report.status !== "generating") return;
    const interval = setInterval(async () => {
      const result = await getReport(simId);
      if ("data" in result) setReport(result.data);
    }, 5000);
    return () => clearInterval(interval);
  }, [report?.status, simId]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {report?.status === "generating" && (
          <div className="py-20 space-y-4 max-w-sm mx-auto">
            <Skeleton className="h-5 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <p className="text-sm text-muted-foreground text-center mt-4">
              The AI is analyzing {report.simId} simulation data.
            </p>
          </div>
        )}

        {report?.status === "complete" && (
          <>
            <div className="flex justify-end mb-4">
              <ExportButton report={report} />
            </div>

            <ReportHeader report={report} />

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Executive Summary</h2>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                {report.executiveSummary}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Timeline</h2>
              <ReportTimeline entries={report.timeline} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Communication Effectiveness</h2>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                {report.communicationAnalysis}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Tensions & Conflicts</h2>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                {report.tensions}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Agent Scorecards</h2>
              <AgentScoreGrid scores={report.agentScores} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Recommendations</h2>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                {report.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          </>
        )}

        {report?.status === "failed" && (
          <div className="text-center py-20">
            <Alert variant="destructive" className="max-w-sm mx-auto mb-4">
              <AlertDescription>Report generation failed</AlertDescription>
            </Alert>
            <Button
              variant="link"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
