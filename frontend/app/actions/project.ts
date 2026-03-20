// frontend/app/actions/project.ts
"use server";

import { fetchApi, fetchMultipart } from "@/app/lib/api";
import type {
  Project,
  CompanyDossier,
  GraphData,
  SimulationConfig,
} from "@/app/types";

export async function createProject(
  formData: FormData
): Promise<{ data: { projectId: string } } | { error: string }> {
  return fetchMultipart<{ projectId: string }>(
    "/api/crucible/projects",
    formData
  );
}

export async function getProjectStatus(
  projectId: string
): Promise<{ data: Project } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(
    `/api/crucible/projects/${projectId}/status`
  );
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      projectId: (d.project_id as string) || projectId,
      companyUrl: (d.company_url as string) || "",
      userContext: d.user_context as string | undefined,
      uploadedFiles: (d.uploaded_files as string[]) || [],
      status: d.status as Project["status"],
      progress: (d.progress as number) || 0,
      progressMessage: (d.progress_message as string) || "",
      errorMessage: d.error_message as string | undefined,
      graphId: d.graph_id as string | undefined,
      simId: d.sim_id as string | undefined,
      createdAt: (d.created_at as string) || "",
    },
  };
}

export async function getDossier(
  projectId: string
): Promise<{ data: CompanyDossier } | { error: string }> {
  return fetchApi<CompanyDossier>(`/api/crucible/projects/${projectId}/dossier`);
}

export async function updateDossier(
  projectId: string,
  dossier: CompanyDossier
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(
    `/api/crucible/projects/${projectId}/dossier`,
    {
      method: "PUT",
      body: JSON.stringify(dossier),
    }
  );
}

export async function getProjectGraph(
  projectId: string
): Promise<{ data: GraphData } | { error: string }> {
  return fetchApi<GraphData>(`/api/crucible/projects/${projectId}/graph`);
}

export async function triggerConfigGeneration(
  projectId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(
    `/api/crucible/projects/${projectId}/generate-config`,
    { method: "POST" }
  );
}

export async function getProjectConfig(
  projectId: string
): Promise<{ data: SimulationConfig } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(
    `/api/crucible/projects/${projectId}/config`
  );
  if ("error" in result) return result;
  // The config from the backend is already in SimulationConfig shape (snake_case)
  // Reuse the same transformation as getPresetConfig
  const d = result.data;
  return {
    data: {
      simulationId: d.simulation_id as string | undefined,
      companyName: (d.company_name as string) || "",
      scenario: (d.scenario as string) || "",
      totalRounds: (d.total_rounds as number) || 5,
      hoursPerRound: (d.hours_per_round as number) || 1.0,
      agents: ((d.agent_profiles as Array<Record<string, string>>) || []).map(
        (a) => ({
          name: a.name || "",
          role: a.role || "",
          persona: a.persona || "",
        })
      ),
      worlds: ((d.worlds as Array<Record<string, string>>) || []).map((w) => ({
        type: w.type || "",
        name: w.name || "",
      })),
      pressures: ((d.pressures as Array<Record<string, unknown>>) || []).map(
        (p) => ({
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
        })
      ),
      scheduledEvents: (
        (d.scheduled_events as Array<Record<string, unknown>>) || []
      ).map((e) => ({
        round: (e.round as number) || 0,
        description: (e.description as string) || "",
      })),
    },
  };
}

export async function linkSimToProject(
  projectId: string,
  simId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(`/api/crucible/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ sim_id: simId }),
  });
}
