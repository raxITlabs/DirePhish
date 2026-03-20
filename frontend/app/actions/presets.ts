"use server";

import { fetchApi } from "@/app/lib/api";
import type { Preset, SimulationConfig, PressureConfig } from "@/app/types";

export async function getPresets(): Promise<{ data: Preset[] } | { error: string }> {
  return fetchApi<Preset[]>("/api/crucible/presets");
}

export async function uploadCustomConfig(
  jsonText: string
): Promise<{ data: { configId: string } } | { error: string }> {
  return fetchApi<{ configId: string }>("/api/crucible/configs/upload", {
    method: "POST",
    body: JSON.stringify({ config: jsonText }),
  });
}

export async function getPresetConfig(
  presetId: string
): Promise<{ data: SimulationConfig } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(`/api/crucible/presets/${presetId}`);
  if ("error" in result) return result;

  const d = result.data;
  return {
    data: {
      companyName: (d.company_name as string) || "",
      scenario: (d.scenario as string) || "",
      totalRounds: (d.total_rounds as number) || 5,
      hoursPerRound: (d.hours_per_round as number) || 1.0,
      agents: ((d.agent_profiles as Array<Record<string, string>>) || []).map((a) => ({
        name: a.name || "",
        role: a.role || "",
        persona: a.persona || "",
      })),
      worlds: ((d.worlds as Array<Record<string, string>>) || []).map((w) => ({
        type: w.type || "",
        name: w.name || "",
      })),
      pressures: ((d.pressures as Array<Record<string, unknown>>) || []).map((p) => ({
        name: (p.name as string) || "",
        type: p.type as PressureConfig["type"],
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
      })),
    },
  };
}
