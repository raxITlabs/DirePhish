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
  scenarioId?: string;
  attackPath?: { killChain: KillChainStep[] };
  cascadingEffects?: { firstOrder: string[]; secondOrder: string[]; thirdOrder: string[] };
  threatActorProfile?: string;
}

export interface AgentConfig {
  name: string;
  role: string;
  persona: string;
  stressProfile?: { baseline: number; escalationRate: string };
  incidentMemory?: string;
  decisionBias?: string;
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
  killChainStep?: string;
  condition?: ConditionalInject;
}

export interface KillChainStep {
  step: number;
  tactic: string;
  technique: string;
  target: string;
  description: string;
}

export interface ConditionalInject {
  unless: string;
  keywords: string[];
  targetSystems: string[];
  alternative: string;
}
