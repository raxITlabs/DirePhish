"use server";

import { fetchApi } from "@/app/lib/api";
import type { SimulationConfig, SimulationStatus, SimulationSummary, AgentAction } from "@/app/types";

export async function listSimulations(): Promise<{ data: SimulationSummary[] } | { error: string }> {
  const result = await fetchApi<{ sim_id: string; status: string; current_round: number; total_rounds: number; action_count: number }[]>("/api/crucible/simulations");
  if ("error" in result) return result;
  return {
    data: result.data.map((s) => ({
      simId: s.sim_id,
      status: s.status,
      currentRound: s.current_round,
      totalRounds: s.total_rounds,
      actionCount: s.action_count,
    })),
  };
}

export async function launchSimulation(
  config: SimulationConfig
): Promise<{ data: { simId: string } } | { error: string }> {
  const payload = {
    simulation_id: config.simulationId,
    project_id: config.projectId,
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
    })),
  };
  return fetchApi<{ simId: string }>("/api/crucible/simulations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSimulationStatus(
  simId: string
): Promise<{ data: SimulationStatus } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(`/api/crucible/simulations/${simId}/status`);
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      simId: (d.sim_id as string) || simId,
      status: d.status as SimulationStatus["status"],
      currentRound: (d.current_round as number) || 0,
      totalRounds: (d.total_rounds as number) || 0,
      actionCount: (d.action_count as number) || 0,
      recentActions: ((d.recent_actions as Array<Record<string, unknown>>) || []).map(transformAction),
      pressures: ((d.pressures as Array<Record<string, unknown>>) || []).map((p) => ({
        name: (p.name as string) || "",
        type: (p.type as string) || "",
        affectsRoles: (p.affects_roles as string[]) || [],
        remainingHours: p.remaining_hours as number | undefined,
        value: p.value as number | undefined,
        unit: p.unit as string | undefined,
        severity: (p.severity as string) || "normal",
        triggered: (p.triggered as boolean) || false,
      })),
      graphPush: d.graph_push
        ? { pushing: (d.graph_push as Record<string, unknown>).pushing as boolean, version: (d.graph_push as Record<string, unknown>).version as number }
        : undefined,
    },
  };
}

export async function getSimulationActions(
  simId: string,
  opts?: { world?: string; fromRound?: number }
): Promise<{ data: AgentAction[] } | { error: string }> {
  const params = new URLSearchParams();
  if (opts?.world) params.set("world", opts.world);
  if (opts?.fromRound !== undefined) params.set("from_round", String(opts.fromRound));
  const qs = params.toString();
  const result = await fetchApi<Array<Record<string, unknown>>>(
    `/api/crucible/simulations/${simId}/actions${qs ? `?${qs}` : ""}`
  );
  if ("error" in result) return result;
  return { data: result.data.map(transformAction) };
}

export async function stopSimulation(
  simId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(`/api/crucible/simulations/${simId}/stop`, {
    method: "POST",
  });
}

function transformAction(a: Record<string, unknown>): AgentAction {
  return {
    round: (a.round as number) || 0,
    timestamp: (a.timestamp as string) || "",
    simulationId: (a.simulation_id as string) || "",
    agent: (a.agent as string) || "",
    role: (a.role as string) || "",
    world: (a.world as string) || "",
    action: (a.action as string) || "",
    args: (a.args as Record<string, unknown>) || {},
    result: a.result as AgentAction["result"],
  };
}
