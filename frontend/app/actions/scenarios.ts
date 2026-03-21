// frontend/app/actions/scenarios.ts
"use server";

import { fetchApi } from "@/app/lib/api";
import type { ThreatAnalysisResponse, SimulationConfig, ScenarioVariant } from "@/app/types";

export async function triggerThreatAnalysis(
  projectId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(
    `/api/crucible/projects/${projectId}/analyze-threats`,
    { method: "POST" }
  );
}

export async function getScenarios(
  projectId: string
): Promise<{ data: ThreatAnalysisResponse } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(
    `/api/crucible/projects/${projectId}/scenarios`
  );
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      scenarios: ((d.scenarios as Array<Record<string, unknown>>) || []).map((s) => ({
        id: (s.id as string) || "",
        title: (s.title as string) || "",
        probability: (s.probability as number) || 0,
        severity: (s.severity as string) || "medium",
        summary: (s.summary as string) || "",
        affectedTeams: (s.affected_teams as string[]) || [],
        attackPathId: (s.attack_path_id as string) || "",
        quadrant: (s.quadrant as string) || "",
        evidence: (s.evidence as string[]) || [],
      })),
      uncertaintyAxes: d.uncertainty_axes as ThreatAnalysisResponse["uncertaintyAxes"],
      attackPaths: ((d.attack_paths as Array<Record<string, unknown>>) || []).map((p) => ({
        id: (p.id as string) || "",
        title: (p.title as string) || "",
        killChain: ((p.kill_chain as Array<Record<string, unknown>>) || []).map((k) => ({
          step: (k.step as number) || 0,
          tactic: (k.tactic as string) || "",
          technique: (k.technique as string) || "",
          target: (k.target as string) || "",
          description: (k.description as string) || "",
        })),
        expectedOutcome: (p.expected_outcome as string) || "",
      })),
    },
  };
}

export async function generateConfigs(
  projectId: string,
  scenarioIds: string[]
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(
    `/api/crucible/projects/${projectId}/generate-configs`,
    { method: "POST", body: JSON.stringify({ scenario_ids: scenarioIds }) }
  );
}

export async function getConfigs(
  projectId: string
): Promise<{ data: SimulationConfig[] } | { error: string }> {
  const result = await fetchApi<Array<Record<string, unknown>>>(
    `/api/crucible/projects/${projectId}/configs`
  );
  if ("error" in result) return result;
  // Configs are full SimulationConfig dicts in snake_case
  return {
    data: result.data.map((d) => ({
      simulationId: d.simulation_id as string | undefined,
      projectId: d.project_id as string | undefined,
      companyName: (d.company_name as string) || "",
      scenario: (d.scenario as string) || "",
      totalRounds: (d.total_rounds as number) || 5,
      hoursPerRound: (d.hours_per_round as number) || 1.0,
      scenarioId: d.scenario_id as string | undefined,
      threatActorProfile: d.threat_actor_profile as string | undefined,
      agents: ((d.agent_profiles as Array<Record<string, unknown>>) || []).map((a) => ({
        name: (a.name as string) || "",
        role: (a.role as string) || "",
        persona: (a.persona as string) || "",
        stressProfile: a.stress_profile as { baseline: number; escalationRate: string } | undefined,
        incidentMemory: a.incident_memory as string | undefined,
        decisionBias: a.decision_bias as string | undefined,
      })),
      worlds: ((d.worlds as Array<Record<string, string>>) || []).map((w) => ({
        type: w.type || "",
        name: w.name || "",
      })),
      pressures: ((d.pressures as Array<Record<string, unknown>>) || []).map((p) => ({
        name: (p.name as string) || "",
        type: p.type as "countdown" | "deadline" | "threshold" | "triggered",
        affectsRoles: (p.affects_roles as string[]) || [],
        hours: p.hours as number | undefined,
        hoursUntil: p.hours_until as number | undefined,
        value: p.value as number | undefined,
        unit: p.unit as string | undefined,
        triggeredBy: p.triggered_by as string | undefined,
        severityAt50pct: (p.severity_at_50pct as string) || "high",
        severityAt25pct: (p.severity_at_25pct as string) || "critical",
      })),
      scheduledEvents: ((d.scheduled_events as Array<Record<string, unknown>>) || []).map((e) => ({
        round: (e.round as number) || 0,
        description: (e.description as string) || "",
        killChainStep: e.kill_chain_step as string | undefined,
        condition: e.condition as SimulationConfig["scheduledEvents"][0]["condition"],
      })),
    })),
  };
}

export async function launchScenarios(
  projectId: string
): Promise<{ data: { simIds: string[] } } | { error: string }> {
  const result = await fetchApi<{ sim_ids: string[] }>(
    `/api/crucible/projects/${projectId}/launch`,
    { method: "POST" }
  );
  if ("error" in result) return result;
  return { data: { simIds: result.data.sim_ids } };
}
