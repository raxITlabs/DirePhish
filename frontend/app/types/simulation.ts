export interface SimulationSummary {
  simId: string;
  status: string;
  currentRound: number;
  totalRounds: number;
  actionCount: number;
}

export interface SimulationConfig {
  simulationId?: string;
  projectId?: string;
  companyName: string;
  scenario: string;
  totalRounds: number;
  hoursPerRound: number;
  agents: AgentConfig[];
  worlds: WorldConfig[];
  pressures: PressureConfig[];
  scheduledEvents: ScheduledEvent[];
}

export interface AgentConfig {
  name: string;
  role: string;
  persona: string;
}

export interface WorldConfig {
  type: string;
  name: string;
}

export interface PressureConfig {
  name: string;
  type: "countdown" | "deadline" | "threshold" | "triggered";
  affectsRoles: string[];
  hours?: number;
  hoursUntil?: number;
  value?: number;
  unit?: string;
  triggeredBy?: string;
  severityAt50pct: string;
  severityAt25pct: string;
}

export interface ScheduledEvent {
  round: number;
  description: string;
}
