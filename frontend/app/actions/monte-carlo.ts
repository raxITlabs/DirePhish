"use server";

import { fetchApi } from "@/app/lib/api";
import type {
  SimulationConfig,
  MonteCarloMode,
  MonteCarloEstimate,
  MonteCarloBatchStatus,
  IterationResult,
  BatchAggregation,
  DecisionPoint,
  SimulationBranch,
  ResilienceScore,
} from "@/app/types";

export async function estimateMonteCarloCost(
  config: SimulationConfig,
  mode: MonteCarloMode
): Promise<{ data: MonteCarloEstimate } | { error: string }> {
  const payload = {
    company_name: config.companyName,
    scenario: config.scenario,
    total_rounds: config.totalRounds,
    hours_per_round: config.hoursPerRound,
    agent_profiles: config.agents.map((a) => ({
      name: a.name,
      role: a.role,
      persona: a.persona,
    })),
    worlds: config.worlds.map((w) => ({ type: w.type, name: w.name })),
    mode,
  };
  const result = await fetchApi<Record<string, unknown>>("/api/crucible/monte-carlo/estimate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      mode: d.mode as MonteCarloMode,
      iterations: d.iterations as number,
      maxWorkers: d.max_workers as number,
      perSimCalls: d.per_sim_calls as number,
      perSimCostUsd: d.per_sim_cost_usd as number,
      totalEstimatedCostUsd: d.total_estimated_cost_usd as number,
      model: d.model as string,
      numAgents: d.num_agents as number,
      numWorlds: d.num_worlds as number,
      totalRounds: d.total_rounds as number,
    },
  };
}

export async function launchMonteCarloBatch(
  projectId: string,
  config: SimulationConfig,
  mode: MonteCarloMode,
  costLimitUsd: number
): Promise<{ data: { batchId: string } } | { error: string }> {
  const payload = {
    project_id: projectId,
    company_name: config.companyName,
    scenario: config.scenario,
    total_rounds: config.totalRounds,
    hours_per_round: config.hoursPerRound,
    agent_profiles: config.agents.map((a) => ({
      name: a.name,
      role: a.role,
      persona: a.persona,
      stress_profile: a.stressProfile,
      incident_memory: a.incidentMemory,
      decision_bias: a.decisionBias,
    })),
    worlds: config.worlds.map((w) => ({ type: w.type, name: w.name })),
    pressures: config.pressures.map((p) => ({
      name: p.name,
      type: p.type,
      affects_roles: p.affectsRoles,
      hours: p.hours,
      hours_until: p.hoursUntil,
      value: p.value,
      unit: p.unit,
      triggered_by: p.triggeredBy,
      severity_at_50pct: p.severityAt50pct,
      severity_at_25pct: p.severityAt25pct,
    })),
    scheduled_events: config.scheduledEvents.map((e) => ({
      round: e.round,
      description: e.description,
      kill_chain_step: e.killChainStep,
      condition: e.condition ? {
        unless: e.condition.unless,
        keywords: e.condition.keywords,
        target_systems: e.condition.targetSystems,
        alternative: e.condition.alternative,
      } : undefined,
    })),
    scenario_id: config.scenarioId,
    attack_path: config.attackPath ? {
      kill_chain: config.attackPath.killChain.map((k) => ({
        step: k.step,
        tactic: k.tactic,
        technique: k.technique,
        target: k.target,
        description: k.description,
      })),
    } : undefined,
    cascading_effects: config.cascadingEffects ? {
      first_order: config.cascadingEffects.firstOrder,
      second_order: config.cascadingEffects.secondOrder,
      third_order: config.cascadingEffects.thirdOrder,
    } : undefined,
    threat_actor_profile: config.threatActorProfile,
    mode,
    cost_limit_usd: costLimitUsd,
  };
  const result = await fetchApi<Record<string, unknown>>("/api/crucible/monte-carlo/launch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if ("error" in result) return result;
  return { data: { batchId: result.data.batch_id as string } };
}

export async function getMonteCarloBatchStatus(
  batchId: string
): Promise<{ data: MonteCarloBatchStatus } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(`/api/crucible/monte-carlo/${batchId}/status`);
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      batchId: (d.batch_id as string) || batchId,
      projectId: d.project_id as string,
      mode: d.mode as MonteCarloMode,
      status: d.status as MonteCarloBatchStatus["status"],
      iterationsTotal: d.iterations_total as number,
      iterationsCompleted: d.iterations_completed as number,
      iterationsFailed: d.iterations_failed as number,
      costSoFar: d.cost_so_far as number,
      costLimit: d.cost_limit as number,
      progressPct: d.progress_pct as number,
      startedAt: d.started_at as string,
      completedAt: d.completed_at as string | undefined,
      error: d.error as string | undefined,
    },
  };
}

export async function getMonteCarloBatchResults(
  batchId: string
): Promise<{ data: { iterations: IterationResult[]; aggregation: BatchAggregation } } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(`/api/crucible/monte-carlo/${batchId}/results`);
  if ("error" in result) return result;
  const d = result.data;
  const rawIterations = (d.iterations as Array<Record<string, unknown>>) || [];
  const rawAgg = (d.aggregation as Record<string, unknown>) || {};
  const rawContainment = (rawAgg.containment_round_stats as Record<string, unknown>) || {};
  const rawCost = (rawAgg.cost_summary as Record<string, unknown>) || {};
  const rawDivergence = (rawAgg.decision_divergence_points as Array<Record<string, unknown>>) || [];
  return {
    data: {
      iterations: rawIterations.map((it) => ({
        iterationId: it.iteration_id as string,
        seed: it.seed as number,
        totalRounds: it.total_rounds as number,
        totalActions: it.total_actions as number,
        costUsd: it.cost_usd as number,
        variationDescription: it.variation_description as string,
        completedAt: it.completed_at as string,
        outputDir: it.output_dir as string,
      })),
      aggregation: {
        outcomeDistribution: (rawAgg.outcome_distribution as Record<string, number>) || {},
        containmentRoundStats: {
          mean: rawContainment.mean as number,
          median: rawContainment.median as number,
          std: rawContainment.std as number,
          min: rawContainment.min as number,
          max: rawContainment.max as number,
          histogram: (rawContainment.histogram as Record<string, number>) || {},
        },
        decisionDivergencePoints: rawDivergence.map((dp) => ({
          round: dp.round as number,
          agent: dp.agent as string,
          divergenceScore: dp.divergence_score as number,
          actionDistribution: (dp.action_distribution as Record<string, number>) || {},
        })),
        agentConsistency: (rawAgg.agent_consistency as Record<string, number>) || {},
        costSummary: {
          totalUsd: rawCost.total_usd as number,
          averageUsd: rawCost.average_usd as number,
          minUsd: rawCost.min_usd as number,
          maxUsd: rawCost.max_usd as number,
        },
        costExtrapolation: rawAgg.cost_extrapolation as Record<string, number> | undefined,
      },
    },
  };
}

export async function getMonteCarloBatchCosts(
  batchId: string
): Promise<{ data: { totalUsd: number; perIteration: number[]; costLimit: number } } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(`/api/crucible/monte-carlo/${batchId}/costs`);
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      totalUsd: d.total_usd as number,
      perIteration: (d.per_iteration as number[]) || [],
      costLimit: d.cost_limit as number,
    },
  };
}

export async function stopMonteCarloBatch(
  batchId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(`/api/crucible/monte-carlo/${batchId}/stop`, {
    method: "POST",
  });
}

export async function getDecisionPoints(
  simId: string
): Promise<{ data: DecisionPoint[] } | { error: string }> {
  const result = await fetchApi<Array<Record<string, unknown>>>(`/api/crucible/simulations/${simId}/decision-points`, {
    method: "POST",
  });
  if ("error" in result) return result;
  return {
    data: result.data.map((dp) => ({
      round: dp.round as number,
      agent: dp.agent as string,
      actionTaken: dp.action_taken as string,
      alternative: dp.alternative as string,
      potentialImpact: dp.potential_impact as string,
      criticality: dp.criticality as "high" | "medium",
      suggestedModification: {
        type: (dp.suggested_modification as Record<string, unknown>).type as DecisionPoint["suggestedModification"]["type"],
        details: (dp.suggested_modification as Record<string, unknown>).details as Record<string, unknown>,
      },
    })),
  };
}

export async function getCheckpoints(
  simId: string
): Promise<{ data: { round: number; path: string }[] } | { error: string }> {
  const result = await fetchApi<Array<Record<string, unknown>>>(`/api/crucible/simulations/${simId}/checkpoints`);
  if ("error" in result) return result;
  return {
    data: result.data.map((cp) => ({
      round: cp.round as number,
      path: cp.path as string,
    })),
  };
}

export async function forkSimulation(
  simId: string,
  forkRound: number,
  modifications: Record<string, unknown>
): Promise<{ data: { branchId: string } } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(`/api/crucible/simulations/${simId}/fork`, {
    method: "POST",
    body: JSON.stringify({ fork_round: forkRound, modifications }),
  });
  if ("error" in result) return result;
  return { data: { branchId: result.data.branch_id as string } };
}

export async function getBranches(
  simId: string
): Promise<{ data: SimulationBranch[] } | { error: string }> {
  const result = await fetchApi<Array<Record<string, unknown>>>(`/api/crucible/simulations/${simId}/branches`);
  if ("error" in result) return result;
  return {
    data: result.data.map((b) => ({
      branchId: b.branch_id as string,
      parentSimId: b.parent_sim_id as string,
      forkRound: b.fork_round as number,
      modifications: (b.modifications as Record<string, unknown>) || {},
      status: b.status as string,
      outcome: b.outcome as string | undefined,
      containmentRound: b.containment_round as number | undefined,
    })),
  };
}

export async function launchStressTest(
  projectId: string,
  config: SimulationConfig
): Promise<{ data: ResilienceScore } | { error: string }> {
  const payload = {
    company_name: config.companyName,
    scenario: config.scenario,
    total_rounds: config.totalRounds,
    hours_per_round: config.hoursPerRound,
    agent_profiles: config.agents.map((a) => ({
      name: a.name,
      role: a.role,
      persona: a.persona,
    })),
    worlds: config.worlds.map((w) => ({ type: w.type, name: w.name })),
    pressures: config.pressures.map((p) => ({
      name: p.name,
      type: p.type,
      affects_roles: p.affectsRoles,
    })),
    scheduled_events: config.scheduledEvents.map((e) => ({
      round: e.round,
      description: e.description,
    })),
  };
  const result = await fetchApi<Record<string, unknown>>(`/api/crucible/projects/${projectId}/stress-test`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      overall: d.overall as number,
      dimensions: (d.dimensions as Record<string, number>) || {},
      robustnessIndex: d.robustness_index as number,
      weakestLink: d.weakest_link as string,
      failureModes: (d.failure_modes as string[]) || [],
    },
  };
}
