/**
 * Crucible Pipeline Workflow — orchestrates the entire predictive simulation pipeline.
 *
 * Flow: research → threat analysis → auto-select scenarios → config expansion →
 *       launch sims → generate reports → comparative report
 *
 * Uses Vercel WDK for durable execution. Each step calls Flask API endpoints.
 * Progress streamed via getWritable() inside step functions (WDK requirement).
 */
import { getWritable, createHook } from "workflow";

const API_BASE = process.env.FLASK_API_URL || "http://localhost:5001";

// --- Types ---

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface PipelineUpdate {
  step: string;
  status: StepStatus;
  message: string;
  detail?: string;
  timestamp: string;
  durationMs?: number;
}

interface ScenarioInfo {
  id: string;
  title: string;
  probability: number;
  severity: string;
  summary: string;
}

interface DossierConfirmation {
  confirmed: boolean;
  scenarioOverrides?: string[];
}

// --- Step: write progress (must be "use step" for getWritable) ---

async function emitProgress(
  step: string,
  status: StepStatus,
  message: string,
  detail?: string,
  durationMs?: number,
) {
  "use step";
  const writable = getWritable<PipelineUpdate>({ namespace: "pipeline" });
  const writer = writable.getWriter();
  await writer.write({
    step,
    status,
    message,
    detail,
    timestamp: new Date().toISOString(),
    durationMs,
  });
  writer.releaseLock();
}

// --- Step: close progress stream ---

async function closeProgress() {
  "use step";
  const writable = getWritable<PipelineUpdate>({ namespace: "pipeline" });
  await writable.close();
}

// --- Step: call Flask API ---

async function flaskApi<T>(path: string, options?: RequestInit): Promise<T> {
  "use step";
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error || `Flask API error: HTTP ${res.status}`);
  }
  return json.data as T;
}

// --- Step: poll Flask until condition met ---

async function pollStatus(
  projectId: string,
  targetStatuses: string[],
  failStatuses: string[] = ["failed"],
): Promise<Record<string, unknown>> {
  "use step";
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`${API_BASE}/api/crucible/projects/${projectId}/status`);
    const json = await res.json();
    const status = json.data?.status as string;
    if (targetStatuses.includes(status)) return json.data;
    if (failStatuses.includes(status)) {
      throw new Error(`Pipeline failed: ${json.data?.error_message || status}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error("Pipeline timed out waiting for status: " + targetStatuses.join(", "));
}

// --- Step: poll simulation status ---

async function pollSimulation(simId: string): Promise<void> {
  "use step";
  for (let i = 0; i < 180; i++) {
    const res = await fetch(`${API_BASE}/api/crucible/simulations/${simId}/status`);
    const json = await res.json();
    const status = json.data?.status as string;
    if (status === "completed") return;
    if (status === "failed") throw new Error(`Simulation ${simId} failed`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Simulation ${simId} timed out`);
}

// --- Step: poll report ---

async function pollReport(simId: string): Promise<void> {
  "use step";
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${API_BASE}/api/crucible/simulations/${simId}/report`);
    const json = await res.json();
    if (json.data?.status === "complete") return;
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Report for ${simId} timed out`);
}

// --- Step: poll comparative report ---

async function pollComparativeReport(projectId: string): Promise<void> {
  "use step";
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${API_BASE}/api/crucible/projects/${projectId}/comparative-report`);
    const json = await res.json();
    if (json.data?.status === "complete") return;
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error("Comparative report timed out");
}

// ============================================================
// THE PIPELINE WORKFLOW
// ============================================================

export async function cruciblePipeline(input: {
  companyUrl: string;
  userContext?: string;
}) {
  "use workflow";

  let projectId = "";
  let simIds: string[] = [];

  try {
    // ─── STEP 1: Create project & start research ───
    await emitProgress("research", "running", "Starting company research...");

    const createResult = await flaskApi<{ projectId: string }>(
      "/api/crucible/projects",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          company_url: input.companyUrl,
          user_context: input.userContext || "",
        }),
      },
    );
    projectId = createResult.projectId;

    await emitProgress("research", "running", "Researching company...", `Project: ${projectId}`);

    // Poll until research completes (which auto-chains to analyzing_threats)
    await pollStatus(projectId, [
      "research_complete",
      "analyzing_threats",
      "scenarios_ready",
    ]);

    await emitProgress("research", "completed", "Research complete");

    // ─── STEP 2: Wait for dossier confirmation ───
    const hook = createHook<DossierConfirmation>({
      token: `dossier-confirm-${projectId}`,
    });

    await emitProgress(
      "dossier_review", "running",
      "Waiting for dossier confirmation...",
      JSON.stringify({ hookToken: hook.token, projectId }),
    );

    const confirmation = await hook;

    if (!confirmation.confirmed) {
      await emitProgress("dossier_review", "failed", "Dossier rejected by user");
      await closeProgress();
      return { projectId, status: "cancelled" };
    }

    await emitProgress("dossier_review", "completed", "Dossier confirmed");

    // ─── STEP 3: Threat analysis ───
    await emitProgress("threat_analysis", "running", "Analyzing threats...");

    // Check if threat analysis already started (auto-chained from research)
    const currentStatus = await flaskApi<Record<string, unknown>>(
      `/api/crucible/projects/${projectId}/status`,
    );
    const status = currentStatus.status as string;

    if (!["analyzing_threats", "scenarios_ready"].includes(status)) {
      await flaskApi<{ status: string }>(
        `/api/crucible/projects/${projectId}/analyze-threats`,
        { method: "POST" },
      );
    }

    if (status !== "scenarios_ready") {
      await emitProgress("threat_analysis", "running", "Mapping vulnerabilities...");
      await pollStatus(projectId, ["scenarios_ready"]);
    }

    await emitProgress("threat_analysis", "completed", "Threat analysis complete");

    // ─── STEP 4: Auto-select scenarios ───
    await emitProgress("scenario_selection", "running", "Selecting scenarios...");

    const scenarioData = await flaskApi<{
      scenarios: ScenarioInfo[];
    }>(`/api/crucible/projects/${projectId}/scenarios`);

    const scenarios = scenarioData.scenarios || [];

    let selectedIds: string[];
    if (confirmation.scenarioOverrides && confirmation.scenarioOverrides.length > 0) {
      selectedIds = confirmation.scenarioOverrides;
    } else {
      const sorted = [...scenarios].sort((a, b) => b.probability - a.probability);
      selectedIds = sorted.slice(0, 2).map(s => s.id);
    }

    const selectedTitles = scenarios
      .filter(s => selectedIds.includes(s.id))
      .map(s => `${s.title} (${Math.round(s.probability * 100)}%)`)
      .join(", ");

    await emitProgress(
      "scenario_selection", "completed",
      `Selected ${selectedIds.length} scenarios`,
      selectedTitles,
    );

    // ─── STEP 5: Config expansion ───
    await emitProgress("config_expansion", "running", "Generating simulation configs...");

    await flaskApi<{ status: string }>(
      `/api/crucible/projects/${projectId}/generate-configs`,
      { method: "POST", body: JSON.stringify({ scenario_ids: selectedIds }) },
    );

    await pollStatus(projectId, ["configs_ready"]);

    await emitProgress("config_expansion", "completed", "Configs generated",
      `${selectedIds.length} scenario configs ready`);

    // ─── STEP 6: Launch simulations ───
    await emitProgress("simulations", "running", "Launching simulations...");

    const launchResult = await flaskApi<{ sim_ids: string[] }>(
      `/api/crucible/projects/${projectId}/launch`,
      { method: "POST" },
    );
    simIds = launchResult.sim_ids;

    await emitProgress("simulations", "running",
      `Running ${simIds.length} simulations...`, simIds.join(", "));

    for (let i = 0; i < simIds.length; i++) {
      await emitProgress("simulations", "running",
        `Simulation ${i + 1}/${simIds.length} running...`, simIds[i]);
      await pollSimulation(simIds[i]);
    }

    await emitProgress("simulations", "completed",
      `All ${simIds.length} simulations complete`);

    // ─── STEP 7: Generate reports ───
    await emitProgress("reports", "running", "Generating after-action reports...");

    for (let i = 0; i < simIds.length; i++) {
      await flaskApi<{ status: string }>(
        `/api/crucible/simulations/${simIds[i]}/report`,
        { method: "POST" },
      );
      await emitProgress("reports", "running",
        `Report ${i + 1}/${simIds.length} generating...`);
      await pollReport(simIds[i]);
    }

    await emitProgress("reports", "completed", "All reports generated");

    // ─── STEP 8: Comparative report ───
    await emitProgress("comparative", "running", "Generating comparative analysis...");

    await flaskApi<{ status: string }>(
      `/api/crucible/projects/${projectId}/comparative-report`,
      { method: "POST" },
    );

    await pollComparativeReport(projectId);

    await emitProgress("comparative", "completed", "Comparative analysis complete");

    // ─── DONE ───
    await emitProgress("complete", "completed", "Pipeline complete!");

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await emitProgress("error", "failed", errMsg);
  }

  await closeProgress();
  return { projectId, simIds, status: "complete" };
}
