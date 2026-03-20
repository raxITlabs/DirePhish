export interface Report {
  simId: string;
  status: "generating" | "complete" | "failed";
  companyName: string;
  scenarioName: string;
  completedAt: string;
  duration: string;
  executiveSummary: string;
  timeline: TimelineEntry[];
  communicationAnalysis: string;
  tensions: string;
  agentScores: AgentScore[];
  recommendations: string[];
}

export interface TimelineEntry {
  round: number;
  timestamp: string;
  description: string;
  significance: "normal" | "high" | "critical";
  agent?: string;
}

export interface AgentScore {
  name: string;
  role: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  actionCount: number;
  worldBreakdown: Record<string, number>;
}
