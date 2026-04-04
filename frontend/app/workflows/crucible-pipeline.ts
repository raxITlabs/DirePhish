/**
 * Crucible Pipeline Workflow — orchestrates the entire predictive simulation pipeline.
 *
 * Flow: research → threat analysis → auto-select scenarios → config expansion →
 *       launch sims → generate reports → comparative report
 *
 * Uses Vercel WDK for durable execution. Each step calls Flask API endpoints.
 * Backend resumes hooks when phases complete (no polling).
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

interface PhaseResult {
  status: string;
  error?: string;
  project_id?: string;
  graph_id?: string;
  sim_id?: string;
  batch_id?: string;
  iterations_completed?: number;
  iterations_failed?: number;
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

// ============================================================
// THE PIPELINE WORKFLOW
// ============================================================

// Pipeline mode configuration — controls simulation depth across the entire pipeline.
// test: fast dev (~25 min, 3 MC iterations)
// quick: demo (~40 min, 10 MC iterations)
// standard: client engagement (~75 min, 50 MC iterations)
// deep: full assessment (~120+ min, 100 MC iterations)
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

    const researchHook = createHook<PhaseResult>({
      token: `research-done-${Date.now()}`,
    });

    const createResult = await flaskApi<{ projectId: string }>(
      "/api/crucible/projects",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          company_url: input.companyUrl,
          user_context: input.userContext || "",
          callback_token: researchHook.token,
        }),
      },
    );
    projectId = createResult.projectId;

    await emitProgress("research", "running", "Researching company...", `Project: ${projectId}`);

    const researchResult = await researchHook;
    if (researchResult.status === "failed") {
      throw new Error(`Research failed: ${researchResult.error || "unknown"}`);
    }

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
    const dossierHook = createHook<DossierConfirmation>({
      token: `dossier-confirm-${projectId}`,
    });

    await emitProgress(
      "dossier_review", "running",
      "Waiting for dossier confirmation...",
      JSON.stringify({ hookToken: dossierHook.token, projectId }),
    );

    const confirmation = await dossierHook;

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

    const threatHook = createHook<PhaseResult>({
      token: `threats-done-${projectId}`,
    });

    await flaskApi<{ status: string }>(
      `/api/crucible/projects/${projectId}/analyze-threats`,
      { method: "POST", body: JSON.stringify({ callback_token: threatHook.token }) },
    );

    await emitProgress("threat_analysis", "running", "Mapping vulnerabilities...");
    const threatResult = await threatHook;
    if (threatResult.status === "failed") {
      throw new Error(`Threat analysis failed: ${threatResult.error || "unknown"}`);
    }

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

    const configHook = createHook<PhaseResult>({
      token: `configs-done-${projectId}`,
    });

    await flaskApi<{ status: string }>(
      `/api/crucible/projects/${projectId}/generate-configs`,
      { method: "POST", body: JSON.stringify({ scenario_ids: selectedIds, mode: pipelineMode, callback_token: configHook.token }) },
    );

    const configResult = await configHook;
    if (configResult.status === "failed") {
      throw new Error(`Config expansion failed: ${configResult.error || "unknown"}`);
    }

    stageDurations.config_expansion = Date.now() - stageStart;
    await emitProgress("config_expansion", "completed", "Configs generated",
      `${selectedIds.length} scenario configs ready`, stageDurations.config_expansion);

    // ─── STEP 6: Launch simulations ───
    stageStart = Date.now();
    await emitProgress("simulations", "running", "Launching simulations...");

    // Get configs to know sim IDs for hook tokens
    const configs = await flaskApi<Array<{ simulation_id: string }>>(
      `/api/crucible/projects/${projectId}/configs`,
    );
    const expectedSimIds = (configs || []).map(c => c.simulation_id);

    // Create hooks for each sim before launching
    const simHooks: Array<{ simId: string; hook: ReturnType<typeof createHook<PhaseResult>> }> = [];
    const callbackTokens: Record<string, string> = {};
    for (const simId of expectedSimIds) {
      const hook = createHook<PhaseResult>({ token: `sim-done-${simId}` });
      simHooks.push({ simId, hook });
      callbackTokens[simId] = hook.token;
    }

    const launchResult = await flaskApi<{ sim_ids: string[] }>(
      `/api/crucible/projects/${projectId}/launch`,
      { method: "POST", body: JSON.stringify({ callback_tokens: callbackTokens }) },
    );
    simIds = launchResult.sim_ids;

    await emitProgress("simulations", "running",
      `Running ${simIds.length} simulations...`, simIds.join(", "));

    // Await each sim sequentially (deterministic for WDK replay)
    for (let i = 0; i < simHooks.length; i++) {
      const { simId, hook } = simHooks[i];
      await emitProgress("simulations", "running",
        `Simulation ${i + 1}/${simHooks.length} running...`, simId);
      const result = await hook;
      if (result.status === "failed") {
        throw new Error(`Simulation ${simId} failed: ${result.error || ""}`);
      }
      await emitProgress("simulations", "running",
        `Simulation ${i + 1}/${simHooks.length} complete`, simId);
    }

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
    try {
      // Get config from first sim for MC reuse
      const simConfig = await flaskApi<Record<string, unknown>>(
        `/api/crucible/simulations/${simIds[0]}/config`,
      );

      const mcHook = createHook<PhaseResult>({
        token: `mc-done-${projectId}`,
      });

      const mcLaunch = await flaskApi<{ batchId: string }>(
        "/api/crucible/monte-carlo/launch",
        { method: "POST", body: JSON.stringify({
          project_id: projectId,
          config: simConfig,
          mode: mcMode,
          cost_limit_usd: mcCostLimit,
          skip_gating: true,
          callback_token: mcHook.token,
        })},
      );
      mcBatchId = mcLaunch.batchId;

      await emitProgress("monte_carlo", "running",
        `Stress testing — re-running with variations...`,
        JSON.stringify({
          batchId: mcBatchId,
          scenarioTitle: scenarioTitles[0] || "scenario"
        }));

      const mcResult = await mcHook;
      console.log(`[PIPELINE] MC hook resumed for ${mcBatchId}, status=${mcResult.status}`);

      if (mcResult.status === "failed" || mcResult.status === "cost_exceeded") {
        throw new Error(`Monte Carlo ${mcResult.status}: ${mcResult.error || ""}`);
      }

      stageDurations.monte_carlo = Date.now() - stageStart;
      await emitProgress("monte_carlo", "completed",
        "Stress testing complete",
        JSON.stringify({ batchId: mcBatchId, iterations: mcResult.iterations_completed }),
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

      // Fork and launch sequentially with hooks
      for (const decision of topDecisions) {
        try {
          // Create hook before forking so we can pass the token
          const branchToken = `sim-done-cf-${simIds[0]}-r${decision.round}`;
          const branchHook = createHook<PhaseResult>({
            token: branchToken,
          });
          const fork = await flaskApi<{ branch_id: string; sim_id?: string }>(
            `/api/crucible/simulations/${simIds[0]}/fork`,
            { method: "POST", body: JSON.stringify({
              fork_round: decision.round,
              modifications: decision.suggested_modification || {},
              callback_token: branchToken,
            })},
          );
          if (fork.sim_id) {
            await emitProgress("counterfactual", "running",
              `Testing alternate timeline from round ${decision.round}...`,
              JSON.stringify({ forkSimId: fork.sim_id, forkAgent: decision.agent, forkRound: decision.round }));
            branchIds.push(fork.sim_id);
            console.log(`[PIPELINE] Counterfactual: waiting for branch sim ${fork.sim_id}...`);
            const branchResult = await branchHook;
            if (branchResult.status === "failed") {
              console.warn(`[PIPELINE] Branch sim ${fork.sim_id} failed: ${branchResult.error}`);
            }
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
      const reportHook = createHook<PhaseResult>({
        token: `report-done-${projectId}`,
      });

      await flaskApi<{ status: string }>(
        `/api/crucible/projects/${projectId}/exercise-report`,
        {
          method: "POST",
          body: JSON.stringify({
            batch_id: mcBatchId || undefined,
            branch_ids: branchIds.length > 0 ? branchIds : undefined,
            callback_token: reportHook.token,
          }),
        },
      );

      const reportResult = await reportHook;
      if (reportResult.status === "failed") {
        throw new Error(`Exercise report failed: ${reportResult.error || "unknown"}`);
      }

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
