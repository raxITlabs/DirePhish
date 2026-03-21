"use client";

import { useEffect, useState, useRef, useCallback, use } from "react";
import Header from "@/app/components/layout/Header";
import ReportContent from "@/app/components/report/ReportContent";
import WorkflowTimeline from "@/app/components/report/WorkflowTimeline";
import ConsoleLog from "@/app/components/report/ConsoleLog";
import ReportChat from "@/app/components/report/ReportChat";
import SplitPanel from "@/app/components/shared/SplitPanel";
import ViewToggle, {
  type ViewMode,
} from "@/app/components/simulation/ViewToggle";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { FileText, Loader2 } from "lucide-react";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import {
  checkReport,
  generateReport,
  getReportProgress,
  getReportSections,
  getFullReport,
  getAgentLog,
  getConsoleLog,
  getCrucibleReport,
  type CrucibleReport,
} from "@/app/actions/report";
import type {
  ReportStatus,
  ReportProgress,
  ReportOutline,
  ReportSectionData,
  AgentLogEntry,
} from "@/app/types";

export default function ReportPage({
  params,
}: {
  params: Promise<{ simId: string }>;
}) {
  const { simId } = use(params);

  const [reportId, setReportId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReportStatus>("PENDING");
  const [progress, setProgress] = useState<ReportProgress | null>(null);
  const [outline, setOutline] = useState<ReportOutline | null>(null);
  const [sections, setSections] = useState<ReportSectionData[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [generating, setGenerating] = useState(false);
  const [crucibleReport, setCrucibleReport] = useState<CrucibleReport | null>(null);

  const isCrucible = simId.startsWith("proj_");

  // Use refs to track current lengths for incremental fetching inside intervals
  const agentLogsLenRef = useRef(0);
  const consoleLogsLenRef = useRef(0);

  useEffect(() => {
    agentLogsLenRef.current = agentLogs.length;
  }, [agentLogs]);

  useEffect(() => {
    consoleLogsLenRef.current = consoleLogs.length;
  }, [consoleLogs]);

  // Fetch full report data (outline, sections, logs) for a completed report
  const fetchCompleteReport = useCallback(async (rId: string) => {
    const [reportResult, sectionsResult, agentResult, consoleResult] =
      await Promise.all([
        getFullReport(rId),
        getReportSections(rId),
        getAgentLog(rId, 0),
        getConsoleLog(rId, 0),
      ]);

    if ("data" in reportResult) {
      setOutline(reportResult.data.outline);
    }
    if ("data" in sectionsResult) {
      setSections(sectionsResult.data.sections);
    }
    if ("data" in agentResult) {
      setAgentLogs(agentResult.data.logs);
    }
    if ("data" in consoleResult) {
      setConsoleLogs(consoleResult.data.logs);
    }
  }, []);

  // On mount: check if report exists
  useEffect(() => {
    const init = async () => {
      if (isCrucible) {
        // Crucible: check via GET /api/crucible/simulations/{id}/report
        const result = await getCrucibleReport(simId);
        if ("error" in result) {
          // No report yet — stay in PENDING
          return;
        }
        if (result.data.status === "complete") {
          setCrucibleReport(result.data);
          setReportId(simId);
          setStatus("COMPLETED");
        } else if (result.data.status === "failed") {
          setStatus("FAILED");
          setError(result.data.error || "Report generation failed.");
        } else {
          // Generating
          setReportId(simId);
          setStatus("GENERATING");
        }
        return;
      }

      const result = await checkReport(simId);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      const check = result.data;
      if (check.has_report && check.report_id) {
        setReportId(check.report_id);
        if (check.report_status === "COMPLETED") {
          setStatus("COMPLETED");
          await fetchCompleteReport(check.report_id);
        } else if (check.report_status === "FAILED") {
          setStatus("FAILED");
          setError("Report generation failed.");
        } else {
          // In progress - set status and polling will kick in
          setStatus(
            (check.report_status as ReportStatus) || "GENERATING"
          );
        }
      }
      // If no report, stay in PENDING state showing Generate button
    };
    init();
  }, [simId, isCrucible, fetchCompleteReport]);

  // Handle generate button
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    const result = await generateReport(simId);
    if ("error" in result) {
      setError(result.error);
      setGenerating(false);
      return;
    }
    setReportId(result.data.report_id);
    if (result.data.already_generated) {
      // Crucible report was already complete
      if (isCrucible) {
        const reportResult = await getCrucibleReport(simId);
        if ("data" in reportResult) setCrucibleReport(reportResult.data);
      }
      setStatus("COMPLETED");
    } else {
      setStatus(isCrucible ? "GENERATING" : "PLANNING");
    }
    setGenerating(false);
  };

  // Polling: crucible report (simple poll until complete)
  useEffect(() => {
    if (!isCrucible || !reportId) return;
    if (status === "COMPLETED" || status === "FAILED" || status === "PENDING")
      return;

    const interval = setInterval(async () => {
      const result = await getCrucibleReport(simId);
      if ("data" in result) {
        if (result.data.status === "complete") {
          setCrucibleReport(result.data);
          setStatus("COMPLETED");
        } else if (result.data.status === "failed") {
          setStatus("FAILED");
          setError(result.data.error || "Report generation failed.");
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isCrucible, reportId, simId, status]);

  // Polling: progress (non-crucible only)
  useEffect(() => {
    if (isCrucible || !reportId) return;
    if (status === "COMPLETED" || status === "FAILED" || status === "PENDING")
      return;

    const interval = setInterval(async () => {
      const result = await getReportProgress(reportId);
      if ("data" in result) {
        const p = result.data;
        setProgress(p);
        setStatus(p.status);

        // Once planning is complete, try to fetch the outline
        if (
          p.status === "GENERATING" ||
          p.status === "COMPLETED"
        ) {
          const fullResult = await getFullReport(reportId);
          if ("data" in fullResult && fullResult.data.outline) {
            setOutline(fullResult.data.outline);
          }
        }

        if (p.status === "COMPLETED") {
          await fetchCompleteReport(reportId);
        }
        if (p.status === "FAILED") {
          setError(p.message || "Report generation failed.");
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isCrucible, reportId, status, fetchCompleteReport]);

  // Polling: sections (non-crucible only)
  useEffect(() => {
    if (isCrucible || !reportId) return;
    if (status === "COMPLETED" || status === "FAILED" || status === "PENDING")
      return;

    const interval = setInterval(async () => {
      const result = await getReportSections(reportId);
      if ("data" in result) {
        setSections(result.data.sections);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [reportId, status]);

  // Polling: agent logs (non-crucible only)
  useEffect(() => {
    if (isCrucible || !reportId) return;
    if (status === "COMPLETED" || status === "FAILED" || status === "PENDING")
      return;

    const interval = setInterval(async () => {
      const result = await getAgentLog(reportId, agentLogsLenRef.current);
      if ("data" in result && result.data.logs.length > 0) {
        setAgentLogs((prev) => [...prev, ...result.data.logs]);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [reportId, status]);

  // Polling: console logs (non-crucible only)
  useEffect(() => {
    if (isCrucible || !reportId) return;
    if (status === "COMPLETED" || status === "FAILED" || status === "PENDING")
      return;

    const interval = setInterval(async () => {
      const result = await getConsoleLog(
        reportId,
        consoleLogsLenRef.current
      );
      if ("data" in result && result.data.logs.length > 0) {
        setConsoleLogs((prev) => [...prev, ...result.data.logs]);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [reportId, status]);

  // Convert crucible report to outline + sections format for ReportContent
  useEffect(() => {
    if (!crucibleReport || crucibleReport.status !== "complete") return;

    const sectionEntries: { title: string; content: string }[] = [];
    if (crucibleReport.executiveSummary) {
      sectionEntries.push({ title: "Executive Summary", content: crucibleReport.executiveSummary });
    }
    if (crucibleReport.communicationAnalysis) {
      sectionEntries.push({ title: "Communication Analysis", content: crucibleReport.communicationAnalysis });
    }
    if (crucibleReport.tensions) {
      sectionEntries.push({ title: "Tensions & Conflicts", content: crucibleReport.tensions });
    }
    if (crucibleReport.agentScores && crucibleReport.agentScores.length > 0) {
      const scoresContent = crucibleReport.agentScores.map((a) =>
        `### ${a.name} (${a.role}) — Score: ${a.score}/10\n\n` +
        `**Strengths:** ${a.strengths.join(", ") || "N/A"}\n\n` +
        `**Weaknesses:** ${a.weaknesses.join(", ") || "N/A"}\n\n` +
        `**Actions:** ${a.actionCount}`
      ).join("\n\n---\n\n");
      sectionEntries.push({ title: "Agent Scorecards", content: scoresContent });
    }
    if (crucibleReport.recommendations && crucibleReport.recommendations.length > 0) {
      const recsContent = crucibleReport.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");
      sectionEntries.push({ title: "Recommendations", content: recsContent });
    }

    setOutline({
      title: `${crucibleReport.companyName || "Simulation"} — ${crucibleReport.scenarioName || "After-Action Report"}`,
      summary: `Completed ${crucibleReport.completedAt ? new Date(crucibleReport.completedAt).toLocaleDateString() : ""} · ${crucibleReport.duration || ""}`,
      sections: sectionEntries,
    });

    setSections(sectionEntries.map((s, i) => ({
      filename: "",
      section_index: i + 1,
      content: s.content,
    })));
  }, [crucibleReport]);

  const isActive =
    status === "PLANNING" || status === "GENERATING";
  const isPreGeneration = status === "PENDING" && !reportId;

  const statusVariant =
    status === "FAILED"
      ? "destructive"
      : status === "COMPLETED"
        ? "default"
        : "secondary";

  const reportName = outline?.title ?? `Report for ${simId}`;

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {/* Status bar */}
      <div className="flex flex-col gap-1 px-4 py-2 border-b border-border bg-card">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Report" }, { label: simId }]} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText size={16} className="text-muted-foreground" />
            <span className="font-semibold text-sm truncate max-w-md">
              {reportName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {!isPreGeneration && (
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            )}
            <Badge variant={statusVariant}>{status}</Badge>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <Alert variant="destructive" className="mx-4 mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Pre-generation state */}
      {isPreGeneration && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <FileText
              size={48}
              className="mx-auto text-muted-foreground"
            />
            <h2 className="text-lg font-semibold">
              No report yet for this simulation
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Generate an AI-powered analysis report from the simulation data.
            </p>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              size="lg"
            >
              {generating && (
                <Loader2 size={16} className="mr-2 animate-spin" />
              )}
              Generate Report
            </Button>
          </div>
        </div>
      )}

      {/* Main content: split panel */}
      {!isPreGeneration && (
        <>
          <SplitPanel
            viewMode={viewMode}
            leftPanel={
              <div className="h-full overflow-y-auto p-4">
                <ReportContent
                  outline={outline}
                  sections={sections}
                  progress={progress}
                  reportId={reportId}
                />
              </div>
            }
            rightPanel={
              <div className="flex flex-col h-full">
                <div className="flex-1 min-h-0">
                  <WorkflowTimeline
                    entries={agentLogs}
                    progress={progress}
                    status={status}
                  />
                </div>
                <ConsoleLog lines={consoleLogs} />
              </div>
            }
          />

          {/* Chat at bottom after completion */}
          {status === "COMPLETED" && reportId && (
            <div className="border-t border-border h-64 shrink-0">
              <ReportChat simulationId={simId} reportId={reportId} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
