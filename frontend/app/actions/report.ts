"use server";

import { fetchApi } from "@/app/lib/api";
import type {
  GenerateReportResponse,
  ReportProgress,
  ReportSectionsResponse,
  FullReport,
  AgentLogResponse,
  ConsoleLogResponse,
  ChatResponse,
  ReportCheckResponse,
} from "@/app/types";

export async function checkReport(
  simulationId: string
): Promise<{ data: ReportCheckResponse } | { error: string }> {
  return fetchApi<ReportCheckResponse>(`/api/report/check/${simulationId}`);
}

export async function generateReport(
  simulationId: string,
  forceRegenerate = false
): Promise<{ data: GenerateReportResponse } | { error: string }> {
  // Crucible projects use the crucible report endpoint
  if (simulationId.startsWith("proj_")) {
    return generateCrucibleReport(simulationId);
  }
  return fetchApi<GenerateReportResponse>("/api/report/generate", {
    method: "POST",
    body: JSON.stringify({
      simulation_id: simulationId,
      force_regenerate: forceRegenerate,
    }),
  });
}

// --- Crucible report helpers ---

export async function generateCrucibleReport(
  simId: string
): Promise<{ data: GenerateReportResponse } | { error: string }> {
  const result = await fetchApi<{ status: string }>(
    `/api/crucible/simulations/${simId}/report`,
    { method: "POST" }
  );
  if ("error" in result) return result;
  return {
    data: {
      simulation_id: simId,
      report_id: simId, // crucible uses simId as the report key
      task_id: "",
      status: result.data.status === "complete" ? "completed" : "generating",
      message: "",
      already_generated: result.data.status === "complete",
    },
  };
}

export async function getCrucibleReport(
  simId: string
): Promise<{ data: CrucibleReport } | { error: string }> {
  return fetchApi<CrucibleReport>(
    `/api/crucible/simulations/${simId}/report`
  );
}

export interface CrucibleReport {
  simId: string;
  status: string;
  companyName?: string;
  scenarioName?: string;
  completedAt?: string;
  duration?: string;
  executiveSummary?: string;
  timeline?: Array<{
    round: number;
    timestamp: string;
    description: string;
    significance: string;
    agent: string;
  }>;
  communicationAnalysis?: string;
  tensions?: string;
  agentScores?: Array<{
    name: string;
    role: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    actionCount: number;
    worldBreakdown: Record<string, number>;
  }>;
  recommendations?: string[];
  error?: string;
}

export async function getGenerateStatus(
  taskId?: string,
  simulationId?: string
): Promise<{ data: { status: string; progress: number; message: string; report_id?: string } } | { error: string }> {
  return fetchApi("/api/report/generate/status", {
    method: "POST",
    body: JSON.stringify({
      task_id: taskId,
      simulation_id: simulationId,
    }),
  });
}

export async function getReportProgress(
  reportId: string
): Promise<{ data: ReportProgress } | { error: string }> {
  return fetchApi<ReportProgress>(`/api/report/${reportId}/progress`);
}

export async function getReportSections(
  reportId: string
): Promise<{ data: ReportSectionsResponse } | { error: string }> {
  return fetchApi<ReportSectionsResponse>(`/api/report/${reportId}/sections`);
}

export async function getFullReport(
  reportId: string
): Promise<{ data: FullReport } | { error: string }> {
  return fetchApi<FullReport>(`/api/report/${reportId}`);
}

export async function getReportBySimulation(
  simulationId: string
): Promise<{ data: FullReport } | { error: string }> {
  return fetchApi<FullReport>(`/api/report/by-simulation/${simulationId}`);
}

export async function getAgentLog(
  reportId: string,
  fromLine = 0
): Promise<{ data: AgentLogResponse } | { error: string }> {
  return fetchApi<AgentLogResponse>(`/api/report/${reportId}/agent-log?from_line=${fromLine}`);
}

export async function getConsoleLog(
  reportId: string,
  fromLine = 0
): Promise<{ data: ConsoleLogResponse } | { error: string }> {
  return fetchApi<ConsoleLogResponse>(`/api/report/${reportId}/console-log?from_line=${fromLine}`);
}

export async function chatWithReport(
  simulationId: string,
  message: string,
  chatHistory: { role: string; content: string }[] = []
): Promise<{ data: ChatResponse } | { error: string }> {
  return fetchApi<ChatResponse>("/api/report/chat", {
    method: "POST",
    body: JSON.stringify({
      simulation_id: simulationId,
      message,
      chat_history: chatHistory,
    }),
  });
}

export async function getReportDownloadUrl(reportId: string): Promise<string> {
  const base = process.env.FLASK_API_URL || "http://localhost:5001";
  return `${base}/api/report/${reportId}/download`;
}
