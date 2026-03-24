export type MonteCarloMode = "test" | "quick" | "standard" | "deep";

export interface MonteCarloEstimate {
  mode: MonteCarloMode;
  iterations: number;
  maxWorkers: number;
  perSimCalls: number;
  perSimCostUsd: number;
  totalEstimatedCostUsd: number;
  model: string;
  numAgents: number;
  numWorlds: number;
  totalRounds: number;
}

export interface MonteCarloBatchStatus {
  batchId: string;
  projectId: string;
  mode: MonteCarloMode;
  status: "pending" | "running" | "completed" | "failed" | "cost_exceeded" | "stopped";
  iterationsTotal: number;
  iterationsCompleted: number;
  iterationsFailed: number;
  costSoFar: number;
  costLimit: number;
  progressPct: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface IterationResult {
  iterationId: string;
  seed: number;
  totalRounds: number;
  totalActions: number;
  costUsd: number;
  variationDescription: string;
  completedAt: string;
  outputDir: string;
}

export interface BatchAggregation {
  outcomeDistribution: Record<string, number>;
  containmentRoundStats: {
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    histogram: Record<string, number>;
  };
  decisionDivergencePoints: DivergencePoint[];
  agentConsistency: Record<string, number>;
  costSummary: {
    totalUsd: number;
    averageUsd: number;
    minUsd: number;
    maxUsd: number;
  };
  costExtrapolation?: Record<string, number>;
}

export interface DivergencePoint {
  round: number;
  agent: string;
  divergenceScore: number;
  actionDistribution: Record<string, number>;
}

export interface DecisionPoint {
  round: number;
  agent: string;
  actionTaken: string;
  alternative: string;
  potentialImpact: string;
  criticality: "high" | "medium";
  suggestedModification: {
    type: "agent_override" | "inject_event" | "remove_action";
    details: Record<string, unknown>;
  };
}

export interface SimulationBranch {
  branchId: string;
  parentSimId: string;
  forkRound: number;
  modifications: Record<string, unknown>;
  status: string;
  outcome?: string;
  containmentRound?: number;
}

export interface StressTestConfig {
  mutationStrategy?: string;
  sampleCount?: number;
}

export interface ResilienceScore {
  overall: number;
  dimensions: Record<string, number>;
  robustnessIndex: number;
  weakestLink: string;
  failureModes: string[];
}

export const MODE_CONFIG: Record<MonteCarloMode, { iterations: number; workers: number; label: string; description: string }> = {
  test: { iterations: 3, workers: 1, label: "Test", description: "3 sequential runs — verify config, measure cost" },
  quick: { iterations: 10, workers: 2, label: "Quick", description: "10 runs — fast statistical signal" },
  standard: { iterations: 50, workers: 3, label: "Standard", description: "50 runs — production analysis" },
  deep: { iterations: 100, workers: 3, label: "Deep", description: "100+ runs — maximum confidence" },
};
