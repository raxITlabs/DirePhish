// Report status from backend ReportStatus enum
export type ReportStatus = "PENDING" | "PLANNING" | "GENERATING" | "COMPLETED" | "FAILED";

// POST /api/report/generate response
export interface GenerateReportResponse {
  simulation_id: string;
  report_id: string;
  task_id: string;
  status: string;
  message: string;
  already_generated: boolean;
}

// GET /api/report/{id}/progress response
export interface ReportProgress {
  status: ReportStatus;
  progress: number;
  message: string;
  current_section: string | null;
  completed_sections: string[];
  updated_at: string;
}

// GET /api/report/{id}/sections response
export interface ReportSectionsResponse {
  report_id: string;
  sections: ReportSectionData[];
  total_sections: number;
  is_complete: boolean;
}

export interface ReportSectionData {
  filename: string;
  section_index: number;
  content: string;
}

// GET /api/report/{id} response
export interface FullReport {
  report_id: string;
  simulation_id: string;
  graph_id: string;
  simulation_requirement: string;
  status: ReportStatus;
  outline: ReportOutline | null;
  markdown_content: string;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface ReportOutline {
  title: string;
  summary: string;
  sections: { title: string; content: string }[];
}

// GET /api/report/{id}/agent-log response
export interface AgentLogResponse {
  logs: AgentLogEntry[];
  total_lines: number;
  from_line: number;
  has_more: boolean;
}

export interface AgentLogEntry {
  timestamp: string;
  elapsed_seconds: number;
  report_id: string;
  action: "report_start" | "planning_start" | "planning_complete" | "section_start" | "section_content" | "section_complete" | "tool_call" | "tool_result" | "llm_response" | "report_complete";
  stage: "planning" | "generating" | "completed";
  section_title?: string;
  section_index?: number;
  details: Record<string, unknown>;
}

// GET /api/report/{id}/console-log response
export interface ConsoleLogResponse {
  logs: string[];
  total_lines: number;
  from_line: number;
  has_more: boolean;
}

// POST /api/report/chat response
export interface ChatResponse {
  response: string;
  tool_calls: unknown[];
  sources: unknown[];
}

// Chat message for UI state
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// GET /api/report/check/{simulation_id} response
export interface ReportCheckResponse {
  simulation_id: string;
  has_report: boolean;
  report_status: string | null;
  report_id: string | null;
  interview_unlocked: boolean;
}
