export type PipelineRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface PipelineRun {
  runId: string;
  status: PipelineRunStatus;
  companyUrl?: string;
  companyName?: string;
  projectId?: string;
  createdAt: string;
  completedAt?: string;
}
