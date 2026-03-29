/**
 * Crucible Pipeline Workflow — orchestrates the entire predictive simulation pipeline.
 *
 * Flow: research → threat analysis → auto-select scenarios → config expansion →
 *       launch sims → generate reports → comparative report
 *
 * Uses Vercel WDK for durable execution. Each step calls Flask API endpoints.
 * Progress streamed via getWritable() inside step functions (WDK requirement).
 */
import { getWritable, createHook, sleep } from "workflow";

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

// --- Durable polling ---
//
// Each polling function is split into:
//   1. A "use step" function that does ONE status check (has Node.js/fetch access)
//   2. A loop at the workflow level using sleep() from "workflow" (durable, survives restarts)
//
// Why: setTimeout inside "use step" is ephemeral. If the dev server restarts (Turbopack HMR),
// the setTimeout callback dies but the WDK step stays "running" on disk → permanent deadlock.
// With durable sleep, the WDK persists each sleep and check as separate event log entries,
// so after a restart, the workflow replays completed entries and resumes at the right point.

async function checkProjectStatus(projectId: string): Promise<Record<string, unknown>> {
  "use step";
  const res = await fetch(`${API_BASE}/api/crucible/projects/${projectId}/status`);
  if (!res.ok) console.warn(`[PIPELINE] checkProjectStatus HTTP ${res.status} for ${projectId}`);
  const json = await res.json();
  return json.data as Record<string, unknown>;
}

async function pollStatus(
  projectId: string,
  targetStatuses: string[],
  failStatuses: string[] = ["failed"],
): Promise<Record<string, unknown>> {
  for (let i = 0; i < 120; i++) {
    const data = await checkProjectStatus(projectId);
    const status = data?.status as string;
    if (targetStatuses.includes(status)) return data;
    if (failStatuses.includes(status)) {
      throw new Error(`Pipeline failed: ${(data?.error_message as string) || status}`);
    }
    await sleep("5s");
  }
  throw new Error("Pipeline timed out waiting for status: " + targetStatuses.join(", "));
}

async function checkSimStatus(simId: string): Promise<string> {
  "use step";
  const res = await fetch(`${API_BASE}/api/crucible/simulations/${simId}/status`);
  if (!res.ok) console.warn(`[PIPELINE] checkSimStatus HTTP ${res.status} for ${simId}`);
  const json = await res.json();
  return (json.data?.status as string) || "unknown";
}

async function pollSimulation(simId: string): Promise<void> {
  for (let i = 0; i < 180; i++) {
    const status = await checkSimStatus(simId);
    if (status === "completed") {
      console.log(`[PIPELINE] pollSimulation: ${simId} completed (poll ${i})`);
      return;
    }
    if (status === "failed") throw new Error(`Simulation ${simId} failed`);
    if (status === "unknown") {
      console.warn(`[PIPELINE] pollSimulation: ${simId} status unknown (poll ${i})`);
    }
    await sleep("5s");
  }
  throw new Error(`Simulation ${simId} timed out`);
}

async function checkReportStatus(simId: string): Promise<string> {
  "use step";
  const res = await fetch(`${API_BASE}/api/crucible/simulations/${simId}/report`);
  if (!res.ok) console.warn(`[PIPELINE] checkReportStatus HTTP ${res.status} for ${simId}`);
  const json = await res.json();
  return (json.data?.status as string) || "pending";
}

async function pollReport(simId: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const status = await checkReportStatus(simId);
    if (status === "complete") return;
    await sleep("5s");
  }
  throw new Error(`Report for ${simId} timed out`);
}

async function checkComparativeReportStatus(projectId: string): Promise<string> {
  "use step";
  const res = await fetch(`${API_BASE}/api/crucible/projects/${projectId}/comparative-report`);
  const json = await res.json();
  return (json.data?.status as string) || "pending";
}

async function pollComparativeReport(projectId: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const status = await checkComparativeReportStatus(projectId);
    if (status === "complete") return;
    await sleep("5s");
  }
  throw new Error("Comparative report timed out");
}

async function checkExerciseReportStatus(projectId: string): Promise<{ status: string; error?: string }> {
  "use step";
  const res = await fetch(`${API_BASE}/api/crucible/projects/${projectId}/exercise-report`);
  if (!res.ok) console.warn(`[PIPELINE] checkExerciseReportStatus HTTP ${res.status} for ${projectId}`);
  const json = await res.json();
  return { status: (json.data?.status as string) || "pending", error: json.data?.error };
}

async function pollExerciseReport(projectId: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const result = await checkExerciseReportStatus(projectId);
    if (result.status === "complete") {
      console.log(`[PIPELINE] Exercise report complete (poll ${i})`);
      return;
    }
    if (result.status === "failed") throw new Error(`Exercise report failed: ${result.error || "unknown"}`);
    await sleep("5s");
  }
  throw new Error("Exercise report timed out");
}

interface MCStatusResult {
  status: string;
  error?: string;
  completedIterations: number;
  totalIterations: number;
}

async function checkMCStatus(batchId: string): Promise<MCStatusResult> {
  "use step";
  const res = await fetch(`${API_BASE}/api/crucible/monte-carlo/${batchId}/status`);
  if (!res.ok) console.warn(`[PIPELINE] checkMCStatus HTTP ${res.status} for ${batchId}`);
  const json = await res.json();
  return {
    status: (json.data?.status as string) || "unknown",
    error: json.data?.error,
    completedIterations: (json.data?.completed_iterations as number) || 0,
    totalIterations: (json.data?.total_iterations as number) || 10,
  };
}

async function pollMonteCarlo(batchId: string): Promise<void> {
  let lastReportedIteration = 0;
  for (let i = 0; i < 360; i++) {
    const mc = await checkMCStatus(batchId);
    if (mc.status === "completed") {
      console.log(`[PIPELINE] pollMonteCarlo: batch ${batchId} completed (poll ${i})`);
      return;
    }
    if (["failed", "cost_exceeded", "stopped"].includes(mc.status)) {
      throw new Error(`Monte Carlo batch ${batchId} ${mc.status}: ${mc.error || ""}`);
    }
    if (mc.status === "unknown") {
      console.warn(`[PIPELINE] pollMonteCarlo: batch ${batchId} status unknown (poll ${i})`);
    }
    if (mc.completedIterations > lastReportedIteration) {
      lastReportedIteration = mc.completedIterations;
      const runningIterIndex = mc.completedIterations;
      const currentSimId = `${batchId}_iter_${String(runningIterIndex).padStart(4, '0')}`;
      await emitProgress("monte_carlo", "running",
        `Stress testing — ${mc.completedIterations}/${mc.totalIterations} variation${mc.totalIterations !== 1 ? 's' : ''} complete...`,
        JSON.stringify({ batchId, iterations: mc.totalIterations, completed: mc.completedIterations, currentSimId }));
    }
    await sleep("5s");
  }
  throw new Error(`Monte Carlo batch ${batchId} timed out`);
}

// ============================================================
// THE PIPELINE WORKFLOW
// ============================================================

// Pipeline mode configuration — controls simulation depth across the entire pipeline.
// test: fast dev (~16 min, 3 MC iterations)
// quick: demo (~25 min, 10 MC iterations)
// standard: client engagement (~45 min, 50 MC iterations)
// deep: full assessment (~90+ min, 100 MC iterations)
const PIPELINE_MODES = {
  test:     { scenarios: 1, mcMode: "test",     mcCostLimit: 3,   maxForks: 1 },
  quick:    { scenarios: 1, mcMode: "quick",    mcCostLimit: 25,  maxForks: 2 },
  standard: { scenarios: 2, mcMode: "standard", mcCostLimit: 75,  maxForks: 3 },
  deep:     { scenarios: 3, mcMode: "deep",     mcCostLimit: 200, maxForks: 3 },
} as const;

type PipelineMode = keyof typeof PIPELINE_MODES;

export async function cruciblePipeline(input: {
  companyUrl: string;
  userContext?: string;
  mode?: string;
}) {
  "use workflow";

  const pipelineMode = (input.mode && input.mode in PIPELINE_MODES ? input.mode : "test") as PipelineMode;
  const cfg = PIPELINE_MODES[pipelineMode];

  let projectId = "";
  let simIds: string[] = [];
  let companyName = "";
  let scenarioTitles: string[] = [];
  const workflowStart = Date.now();
  let stageStart = Date.now();
  const stageDurations: Record<string, number> = {};

  try {
    // ─── STEP 1: Create project & start research ───
    stageStart = Date.now();
    await emitProgress("research", "running",
      `Starting company research (${pipelineMode} mode)...`);

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

    stageDurations.research = Date.now() - stageStart;
    await emitProgress("research", "completed", "Research complete", undefined, stageDurations.research);

    // Fetch company name from dossier for display metadata
    try {
      const dossier = await flaskApi<{ company?: { name?: string } }>(
        `/api/crucible/projects/${projectId}/dossier`,
      );
      companyName = dossier?.company?.name || "";
    } catch {
      // Non-critical — fall back to URL-based display
    }

    // ─── STEP 2: Wait for dossier confirmation ───
    stageStart = Date.now();
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
      stageDurations.dossier_review = Date.now() - stageStart;
      await emitProgress("dossier_review", "failed", "Dossier rejected by user", undefined, stageDurations.dossier_review);
      await closeProgress();
      return { projectId, companyName, status: "cancelled", totalDurationMs: Date.now() - workflowStart, stageDurations };
    }

    stageDurations.dossier_review = Date.now() - stageStart;
    await emitProgress("dossier_review", "completed", "Dossier confirmed", undefined, stageDurations.dossier_review);

    // ─── STEP 3: Threat analysis ───
    stageStart = Date.now();
    await emitProgress("threat_analysis", "running", "Analyzing threats...");

    await flaskApi<{ status: string }>(
      `/api/crucible/projects/${projectId}/analyze-threats`,
      { method: "POST" },
    );

    await emitProgress("threat_analysis", "running", "Mapping vulnerabilities...");
    await pollStatus(projectId, ["scenarios_ready"]);

    stageDurations.threat_analysis = Date.now() - stageStart;
    await emitProgress("threat_analysis", "completed", "Threat analysis complete", undefined, stageDurations.threat_analysis);

    // ─── STEP 4: Auto-select scenarios ───
    stageStart = Date.now();
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
      selectedIds = sorted.slice(0, cfg.scenarios).map(s => s.id);
    }

    scenarioTitles = scenarios
      .filter(s => selectedIds.includes(s.id))
      .map(s => s.title);

    const selectedTitles = scenarios
      .filter(s => selectedIds.includes(s.id))
      .map(s => `${s.title} (${Math.round(s.probability * 100)}%)`)
      .join(", ");

    stageDurations.scenario_selection = Date.now() - stageStart;
    await emitProgress(
      "scenario_selection", "completed",
      `Selected ${selectedIds.length} scenarios`,
      selectedTitles,
      stageDurations.scenario_selection,
    );

    // ─── STEP 5: Config expansion ───
    stageStart = Date.now();
    await emitProgress("config_expansion", "running", "Generating simulation configs...");

    await flaskApi<{ status: string }>(
      `/api/crucible/projects/${projectId}/generate-configs`,
      { method: "POST", body: JSON.stringify({ scenario_ids: selectedIds, mode: pipelineMode }) },
    );

    await pollStatus(projectId, ["configs_ready"]);

    stageDurations.config_expansion = Date.now() - stageStart;
    await emitProgress("config_expansion", "completed", "Configs generated",
      `${selectedIds.length} scenario configs ready`, stageDurations.config_expansion);

    // ─── STEP 6: Launch simulations ───
    stageStart = Date.now();
    await emitProgress("simulations", "running", "Launching simulations...");

    const launchResult = await flaskApi<{ sim_ids: string[] }>(
      `/api/crucible/projects/${projectId}/launch`,
      { method: "POST" },
    );
    simIds = launchResult.sim_ids;

    await emitProgress("simulations", "running",
      `Running ${simIds.length} simulations...`, simIds.join(", "));

    await Promise.all(simIds.map((id, i) =>
      (async () => {
        await emitProgress("simulations", "running",
          `Simulation ${i + 1}/${simIds.length} running...`, id);
        await pollSimulation(id);
      })()
    ));

    stageDurations.simulations = Date.now() - stageStart;
    await emitProgress("simulations", "completed",
      `All ${simIds.length} simulations complete`, undefined, stageDurations.simulations);

    // ─── STEP 7: Monte Carlo analysis ───
    const mcMode = cfg.mcMode;
    const mcCostLimit = cfg.mcCostLimit;

    stageStart = Date.now();
    await emitProgress("monte_carlo", "running",
      "Stress testing — re-running with variations...");

    let mcBatchId = "";
    let mcResults: Record<string, unknown> = {};
    try {
      // Get config from first sim for MC reuse
      const simConfig = await flaskApi<Record<string, unknown>>(
        `/api/crucible/simulations/${simIds[0]}/config`,
      );

      const mcLaunch = await flaskApi<{ batchId: string }>(
        "/api/crucible/monte-carlo/launch",
        { method: "POST", body: JSON.stringify({
          project_id: projectId,
          config: simConfig,
          mode: mcMode,
          cost_limit_usd: mcCostLimit,
          skip_gating: true,
        })},
      );
      mcBatchId = mcLaunch.batchId;

      await emitProgress("monte_carlo", "running",
        `Stress testing — re-running with variations...`,
        JSON.stringify({
          batchId: mcBatchId,
          iterations: mcMode,
          completed: 0,
          currentSimId: `${mcBatchId}_iter_0000`,
          scenarioTitle: scenarioTitles[0] || "scenario"
        }));
      await pollMonteCarlo(mcBatchId);
      console.log(`[PIPELINE] pollMonteCarlo returned for ${mcBatchId}, fetching results...`);

      mcResults = await flaskApi<Record<string, unknown>>(
        `/api/crucible/monte-carlo/${mcBatchId}/results`,
      );
      console.log(`[PIPELINE] MC results fetched, emitting completed...`);

      stageDurations.monte_carlo = Date.now() - stageStart;
      await emitProgress("monte_carlo", "completed",
        "Stress testing complete",
        JSON.stringify({ batchId: mcBatchId, iterations: mcMode }),
        stageDurations.monte_carlo);
      console.log(`[PIPELINE] MC completed emitted, moving to counterfactual`);
    } catch (mcError) {
      stageDurations.monte_carlo = Date.now() - stageStart;
      const msg = mcError instanceof Error ? mcError.message : String(mcError);
      console.error(`[PIPELINE] MC failed:`, msg);
      await emitProgress("monte_carlo", "failed",
        `Stress testing failed: ${msg}`, undefined, stageDurations.monte_carlo);
      // Non-fatal — continue pipeline
    }

    // ─── STEP 8: Counterfactual analysis ───
    console.log(`[PIPELINE] Starting counterfactual step`);
    stageStart = Date.now();
    await emitProgress("counterfactual", "running", "Identifying key decision points...");

    let branchIds: string[] = [];
    try {
      // Identify decision points on first sim
      const decisions = await flaskApi<{ decision_points: Array<{
        round: number; agent: string; criticality: string;
        suggested_modification: Record<string, unknown>;
      }> }>(
        `/api/crucible/simulations/${simIds[0]}/decision-points`,
        { method: "POST" },
      );

      const maxForks = cfg.maxForks;
      const topDecisions = (decisions.decision_points || [])
        .filter(d => d.criticality === "high")
        .slice(0, maxForks);

      await emitProgress("counterfactual", "running",
        `Found a critical moment — testing what happens differently...`,
        JSON.stringify({
          decisions: topDecisions.length,
          forkAgent: topDecisions[0]?.agent,
          forkRound: topDecisions[0]?.round,
        }));

      // Fork and launch top 2
      for (const decision of topDecisions) {
        try {
          const fork = await flaskApi<{ branch_id: string; sim_id?: string }>(
            `/api/crucible/simulations/${simIds[0]}/fork`,
            { method: "POST", body: JSON.stringify({
              fork_round: decision.round,
              modifications: decision.suggested_modification || {},
            })},
          );
          if (fork.sim_id) {
            await emitProgress("counterfactual", "running",
              `Testing alternate timeline from round ${decision.round}...`,
              JSON.stringify({ forkSimId: fork.sim_id, forkAgent: decision.agent, forkRound: decision.round }));
            branchIds.push(fork.sim_id);
            console.log(`[PIPELINE] Counterfactual: polling branch sim ${fork.sim_id}...`);
            await pollSimulation(fork.sim_id);
            console.log(`[PIPELINE] Counterfactual: branch sim ${fork.sim_id} done`);
          }
        } catch (forkErr) {
          console.warn(`[PIPELINE] Counterfactual fork error:`, forkErr instanceof Error ? forkErr.message : String(forkErr));
        }
      }

      console.log(`[PIPELINE] Counterfactual: all forks done, emitting completed...`);
      stageDurations.counterfactual = Date.now() - stageStart;
      await emitProgress("counterfactual", "completed",
        `Tested ${topDecisions.length} alternate decisions, ${branchIds.length} branches complete`,
        JSON.stringify({ decisions: topDecisions.length, branches: branchIds.length }),
        stageDurations.counterfactual);
    } catch (cfError) {
      stageDurations.counterfactual = Date.now() - stageStart;
      const msg = cfError instanceof Error ? cfError.message : String(cfError);
      console.error(`[PIPELINE] Counterfactual failed:`, msg);
      await emitProgress("counterfactual", "failed",
        `What-if analysis failed: ${msg}`, undefined, stageDurations.counterfactual);
      // Non-fatal — continue to report
    }

    // ─── STEP 9: Exercise Report (unified) ───
    console.log(`[PIPELINE] Starting exercise report step`);
    stageStart = Date.now();
    await emitProgress("exercise_report", "running", "Generating exercise report...");

    try {
      await flaskApi<{ status: string }>(
        `/api/crucible/projects/${projectId}/exercise-report`,
        {
          method: "POST",
          body: JSON.stringify({
            batch_id: mcBatchId || undefined,
            branch_ids: branchIds.length > 0 ? branchIds : undefined,
          }),
        },
      );
      await pollExerciseReport(projectId);
      stageDurations.exercise_report = Date.now() - stageStart;
      await emitProgress("exercise_report", "completed", "Exercise report complete", undefined, stageDurations.exercise_report);
    } catch (reportError) {
      stageDurations.exercise_report = Date.now() - stageStart;
      const msg = reportError instanceof Error ? reportError.message : String(reportError);
      await emitProgress("exercise_report", "failed",
        `Exercise report failed: ${msg}`, undefined, stageDurations.exercise_report);
      // Non-fatal — pipeline still completes
    }

    // ─── DONE ───
    const totalDurationMs = Date.now() - workflowStart;
    console.log(`[PIPELINE] All steps done, total ${totalDurationMs}ms`);
    await emitProgress("complete", "completed", "Pipeline complete!", undefined, totalDurationMs);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[PIPELINE] Top-level error:`, errMsg);
    await emitProgress("error", "failed", errMsg);
  }

  await closeProgress();
  const totalDurationMs = Date.now() - workflowStart;
  return { projectId, simIds, companyName, scenarioTitles, status: "complete", totalDurationMs, stageDurations };
}
