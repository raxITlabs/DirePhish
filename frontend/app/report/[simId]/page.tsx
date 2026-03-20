"use client";

import { useEffect, useState, use } from "react";
import Header from "@/app/components/layout/Header";
import ReportHeader from "@/app/components/report/ReportHeader";
import ReportTimeline from "@/app/components/report/ReportTimeline";
import AgentScoreGrid from "@/app/components/report/AgentScoreGrid";
import ExportButton from "@/app/components/report/ExportButton";
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
          <div className="p-4 rounded-lg bg-severity-critical-bg border border-severity-critical-border text-severity-critical-text mb-6">
            {error}
          </div>
        )}

        {report?.status === "generating" && (
          <div className="text-center py-20">
            <div className="text-lg font-medium mb-2">Generating report...</div>
            <div className="text-sm text-text-secondary">
              The AI is analyzing {report.simId} simulation data.
            </div>
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
              <div className="text-sm text-text-secondary whitespace-pre-wrap">
                {report.executiveSummary}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Timeline</h2>
              <ReportTimeline entries={report.timeline} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Communication Effectiveness</h2>
              <div className="text-sm text-text-secondary whitespace-pre-wrap">
                {report.communicationAnalysis}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Tensions & Conflicts</h2>
              <div className="text-sm text-text-secondary whitespace-pre-wrap">
                {report.tensions}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Agent Scorecards</h2>
              <AgentScoreGrid scores={report.agentScores} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Recommendations</h2>
              <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                {report.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          </>
        )}

        {report?.status === "failed" && (
          <div className="text-center py-20">
            <div className="text-lg font-medium text-severity-critical-text mb-2">
              Report generation failed
            </div>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-accent hover:underline"
            >
              Retry
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
