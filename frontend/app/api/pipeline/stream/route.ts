import { getRun } from "workflow/api";

// Cache: collect updates from the WDK stream into an array that grows over time.
// Each poll returns the full history (not a new stream reader), avoiding the
// MaxListenersExceededWarning that crashed Turbopack when getReadable() was
// called on every request.
const runUpdates = new Map<string, { updates: unknown[]; draining: boolean }>();

function ensureDraining(runId: string) {
  let entry = runUpdates.get(runId);
  if (entry) return entry;

  entry = { updates: [], draining: false };
  runUpdates.set(runId, entry);

  // Start a single background drain for this run
  if (!entry.draining) {
    entry.draining = true;
    (async () => {
      try {
        const run = getRun(runId);
        const readable = run.getReadable({ namespace: "pipeline" });
        const reader = readable.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          entry!.updates.push(value);
        }
        reader.releaseLock();
      } catch {
        // stream ended or not available
      }
    })();
  }

  return entry;
}

// ── Replay mode: serve fixture data at 10x speed ─────────────────────────
// When runId starts with "replay_", drip-feed pre-built pipeline updates
// based on elapsed time since the replay started. No WDK, no workflow, no LLM.

const REPLAY_PROJECT_ID = "proj_32ba2039";
const REPLAY_SIM_ID = "proj_32ba2039_scenario_0_sim";
const REPLAY_BATCH_ID = "mc_52b88bb027ff";
const REPLAY_BRANCH_ID = "proj_32ba2039_scenario_0_sim_branch_5299f544";

const replayStarts = new Map<string, number>();

function buildReplayUpdates(): Array<{ step: string; status: string; message: string; detail?: string; timestamp: string; durationMs?: number; delayMs: number }> {
  const updates: Array<{ step: string; status: string; message: string; detail?: string; timestamp: string; durationMs?: number; delayMs: number }> = [];
  let t = 0;
  const ts = () => new Date(Date.now() + t).toISOString();
  const add = (step: string, status: string, message: string, detail?: string, durationMs?: number, delay = 1000) => {
    t += delay;
    updates.push({ step, status, message, detail, timestamp: ts(), durationMs, delayMs: t });
  };

  // Research
  add("research", "running", "Starting company research (quick mode)...", undefined, undefined, 0);
  add("research", "running", "Researching company...", `Project: ${REPLAY_PROJECT_ID}`, undefined, 2000);
  add("research", "completed", "Research complete", undefined, 180000, 3000);

  // Dossier
  add("dossier_review", "running", "Waiting for dossier confirmation...",
    JSON.stringify({ hookToken: "replay-hook", projectId: REPLAY_PROJECT_ID }), undefined, 500);
  add("dossier_review", "completed", "Dossier confirmed", undefined, 52000, 2000);

  // Threat analysis
  add("threat_analysis", "running", "Analyzing threats...", undefined, undefined, 500);
  add("threat_analysis", "completed", "Threat analysis complete", undefined, 35000, 2000);

  // Scenario selection
  add("scenario_selection", "running", "Selecting scenarios...", undefined, undefined, 300);
  add("scenario_selection", "completed", "Selected 1 scenarios",
    "The Silent Model Exfiltration (87%)", 1000, 1000);

  // Config expansion
  add("config_expansion", "running", "Generating simulation configs...", undefined, undefined, 300);
  add("config_expansion", "completed", "Configs generated", "1 scenario configs ready", 40000, 2000);

  // Simulations
  add("simulations", "running", "Launching simulations...", undefined, undefined, 500);
  add("simulations", "running", "Running 1 simulations...", REPLAY_SIM_ID, undefined, 500);
  add("simulations", "running", "Simulation 1/1 running...", REPLAY_SIM_ID, undefined, 2000);
  add("simulations", "completed", "All 1 simulations complete", undefined, 288000, 5000);

  // Monte Carlo
  add("monte_carlo", "running", "Stress testing — re-running with variations...", undefined, undefined, 500);
  add("monte_carlo", "running", "Stress testing — re-running with variations...",
    JSON.stringify({ batchId: REPLAY_BATCH_ID, iterations: 10, completed: 0, currentSimId: `${REPLAY_BATCH_ID}_iter_0000`, scenarioTitle: "The Silent Model Exfiltration" }), undefined, 1000);
  for (let i = 1; i <= 10; i++) {
    add("monte_carlo", "running",
      `Stress testing — ${i}/10 variations complete...`,
      JSON.stringify({ batchId: REPLAY_BATCH_ID, iterations: 10, completed: i, currentSimId: `${REPLAY_BATCH_ID}_iter_${String(Math.min(i, 9)).padStart(4, "0")}` }),
      undefined, 2000);
  }
  add("monte_carlo", "completed", "Stress testing complete",
    JSON.stringify({ batchId: REPLAY_BATCH_ID, iterations: 10 }), 1669000, 1000);

  // Counterfactual
  add("counterfactual", "running", "Identifying key decision points...", undefined, undefined, 500);
  add("counterfactual", "running", "Found a critical moment — testing what happens differently...",
    JSON.stringify({ decisions: 1, forkAgent: "Marcus Thorne", forkRound: 4 }), undefined, 2000);
  add("counterfactual", "running", "Testing alternate timeline from round 4...",
    JSON.stringify({ forkSimId: REPLAY_BRANCH_ID, forkAgent: "Marcus Thorne", forkRound: 4 }), undefined, 2000);
  add("counterfactual", "completed", "Tested 1 alternate decisions, 1 branches complete",
    JSON.stringify({ decisions: 1, branches: 1 }), 331200, 5000);

  // Exercise report
  add("exercise_report", "running", "Generating exercise report...", undefined, undefined, 500);
  add("exercise_report", "completed", "Exercise report complete", undefined, 120000, 3000);

  // Complete
  add("complete", "completed", "Pipeline complete!", undefined, undefined, 500);

  return updates;
}

const replayUpdatesCache = buildReplayUpdates();

function getReplayUpdates(runId: string): { status: string; updates: unknown[] } {
  if (!replayStarts.has(runId)) {
    replayStarts.set(runId, Date.now());
  }
  const elapsed = Date.now() - replayStarts.get(runId)!;
  // 10x speed: divide delayMs by 10
  const visible = replayUpdatesCache.filter(u => u.delayMs / 10 <= elapsed);
  const allDone = visible.length === replayUpdatesCache.length;

  return {
    status: allDone ? "completed" : "running",
    updates: visible.map(({ delayMs: _, ...rest }) => rest),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  // Replay mode: serve fixture data at 10x speed
  if (runId.startsWith("replay_")) {
    const replay = getReplayUpdates(runId);
    return Response.json({
      data: { runId, status: replay.status, updates: replay.updates },
    });
  }

  try {
    const run = getRun(runId);
    const entry = ensureDraining(runId);

    return Response.json({
      data: {
        runId,
        status: run.status,
        updates: entry.updates,
      },
    });
  } catch {
    return Response.json({
      data: { runId, status: "unknown", updates: [] },
    });
  }
}
