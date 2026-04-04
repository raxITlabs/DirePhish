// frontend/app/report/comparative/[projectId]/page.tsx
"use client";

import { useEffect, useState, use } from "react";
import Header from "@/app/components/layout/Header";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import { Button } from "@/app/components/ui/button";
import { generateComparativeReport, getComparativeReport } from "@/app/actions/report";
import type { ComparativeReportResponse } from "@/app/actions/report";
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner";
import ReactMarkdown from "react-markdown";

export default function ComparativeReportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [report, setReport] = useState<ComparativeReportResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await getComparativeReport(projectId);
      if ("data" in result) {
        setReport(result.data);
        if (result.data.status === "generating") setGenerating(true);
      }
    };
    load();
  }, [projectId]);

  // Poll while generating
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(async () => {
      const result = await getComparativeReport(projectId);
      if ("data" in result && result.data.status === "complete") {
        setReport(result.data);
        setGenerating(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [generating, projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    const result = await generateComparativeReport(projectId);
    if ("error" in result) {
      setError(result.error);
      setGenerating(false);
    }
  };

  const dimensionLabels: Record<string, string> = {
    responseSpeed: "Response Speed",
    containmentEffectiveness: "Containment",
    communicationQuality: "Communication",
    complianceAdherence: "Compliance",
    leadershipDecisiveness: "Leadership",
  };

  return (
    <>
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <Breadcrumbs items={[
          { label: "Home", href: "/" },
          { label: "Comparative Analysis" },
        ]} />

        <h1 className="text-2xl font-bold mb-6">Comparative Analysis</h1>

        {!report?.executiveSummary && !generating && (
          <div className="rounded-lg border p-8 text-center">
            <p className="text-muted-foreground mb-4">
              Generate a comparative analysis across all simulations for this project.
            </p>
            <Button onClick={handleGenerate}>Generate Comparative Report</Button>
          </div>
        )}

        {generating && (
          <div className="rounded-lg border p-6 flex items-center gap-3">
            <AsciiSpinner className="text-primary" />
            <span className="text-sm">Generating comparative analysis\u2026</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {report?.status === "complete" && (
          <div className="space-y-8">
            {/* Executive Summary */}
            {report.executiveSummary && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Executive Summary</h2>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{report.executiveSummary}</ReactMarkdown>
                </div>
              </section>
            )}

            {/* Comparison Matrix */}
            {report.comparisonMatrix && report.comparisonMatrix.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Scenario Comparison</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 border-b font-medium">Scenario</th>
                        {Object.entries(dimensionLabels).map(([key, label]) => (
                          <th key={key} className="text-center p-2 border-b font-medium">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.comparisonMatrix.map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2 font-medium">{row.scenario}</td>
                          {Object.keys(dimensionLabels).map((key) => {
                            const val = row[key as keyof typeof row] as number;
                            const color = val >= 7 ? "text-green-700" : val >= 4 ? "text-yellow-700" : "text-red-700";
                            return (
                              <td key={key} className={`text-center p-2 font-mono font-medium ${color}`}>
                                {val}/10
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Consistent Weaknesses */}
            {report.consistentWeaknesses && report.consistentWeaknesses.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Consistent Weaknesses</h2>
                <p className="text-sm text-muted-foreground mb-2">Issues found across ALL scenarios — structural problems to address.</p>
                <ul className="space-y-2">
                  {report.consistentWeaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-destructive mt-0.5 font-bold">!</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Recommendations */}
            {report.recommendations && report.recommendations.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Priority Recommendations</h2>
                <div className="space-y-3">
                  {report.recommendations.map((rec, i) => (
                    <div key={i} className="rounded-lg border p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">
                          P{rec.priority}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Addresses: {rec.addressesScenarios.join(", ")}
                        </span>
                      </div>
                      <p className="text-sm">{rec.recommendation}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
