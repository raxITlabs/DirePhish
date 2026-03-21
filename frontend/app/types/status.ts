export interface SimulationStatus {
  simId: string;
  status: "starting" | "running" | "completed" | "stopped" | "failed";
  currentRound: number;
  totalRounds: number;
  actionCount: number;
  recentActions: AgentAction[];
  pressures: ActivePressureState[];
  graphPush?: { pushing: boolean; version: number };
}

export interface AgentAction {
  round: number;
  timestamp: string;
  simulationId: string;
  agent: string;
  role: string;
  world: string;
  action: string;
  args: Record<string, unknown>;
  result: { success: boolean; action: string; agentId: string } | null;
}

export interface ActivePressureState {
  name: string;
  type: string;
  affectsRoles: string[];
  remainingHours?: number;
  value?: number;
  unit?: string;
  severity: string;
  triggered: boolean;
}
