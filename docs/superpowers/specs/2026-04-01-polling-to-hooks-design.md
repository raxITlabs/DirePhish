# Polling to Hooks Migration — Design Spec

## Context

The DirePhish pipeline workflow (`frontend/app/workflows/crucible-pipeline.ts`) orchestrates a multi-stage simulation pipeline using Vercel WDK. It currently uses 6 polling loops that check Flask backend status every 5 seconds via `"use step"` check functions and workflow-level `sleep("5s")` calls.

**The problem:** When the laptop sleeps or the dev server restarts, the WDK Local World's in-memory queue loses pending sleep timers. The workflow freezes permanently because the orchestrator never wakes up to poll again. The simulations complete fine on the backend, but the workflow never sees it.

**The fix:** Replace polling with WDK hooks. The backend calls the frontend to resume the workflow when each phase completes. No polling, no timers, no sleep-sensitivity.

## Architecture

### Two-sided change

**Backend (Flask/Python):** A new `resume_workflow_hook()` helper that POSTs to the frontend when a phase completes. Called from 7 completion points across backend services.

**Frontend (Next.js/WDK):** Replace 6 polling loops with `createHook()` suspensions. Add a `/api/pipeline/resume` route to receive backend callbacks.

### Data flow

```
Workflow                        Flask Backend
   |                                |
   |-- POST /launch {token} ------->|
   |   (create hook, suspend)       |
   |                                |-- runs simulation
   |                                |-- sim completes
   |                                |
   |<-- POST /api/pipeline/resume --|
   |   {token, data}               |
   |                                |
   |(workflow resumes)              |
```

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Callback URL discovery | `FRONTEND_URL` env var, default `http://localhost:4942` | Simple, dev-only for now |
| Token passing | Frontend passes `callback_token` in the API call that launches each phase | Explicit, no convention guessing |
| Parallel sims | Sequential hook awaits in workflow, backend runs sims in parallel | WDK determinism requires sequential awaits; wall time unchanged |
| Race condition | Backend retries POST with exponential backoff on 404 (hook not yet created) | Simple, no extra state |
| Live progress | Pipeline page polls Flask status endpoints directly, decoupled from workflow | Workflow only handles phase transitions; UI handles granular progress |

## Backend Changes

### New file: `backend/app/services/workflow_callback.py`

Single helper function used by all services:

```python
import os
import time
import logging
import requests

logger = logging.getLogger(__name__)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:4942")

def resume_workflow_hook(token: str, data: dict, max_retries: int = 5) -> bool:
    """POST to frontend to resume a WDK workflow hook.
    
    Retries with exponential backoff if the hook isn't created yet (404).
    """
    url = f"{FRONTEND_URL}/api/pipeline/resume"
    for attempt in range(max_retries):
        try:
            resp = requests.post(url, json={"token": token, "data": data}, timeout=5)
            if resp.status_code == 200:
                logger.info("Resumed hook %s", token)
                return True
            if resp.status_code == 404:
                delay = min(2 ** attempt, 16)
                logger.debug("Hook %s not ready, retry in %ds (attempt %d)", token, delay, attempt + 1)
                time.sleep(delay)
                continue
            logger.warning("Hook resume %s returned %d", token, resp.status_code)
            return False
        except requests.RequestException as e:
            delay = min(2 ** attempt, 16)
            logger.warning("Hook resume %s failed: %s, retry in %ds", token, e, delay)
            time.sleep(delay)
    logger.error("Failed to resume hook %s after %d retries", token, max_retries)
    return False
```

### Modified: 7 service files — add callback at completion

Each service receives a `callback_token` parameter and calls `resume_workflow_hook()` when the phase completes or fails.

| Service file | Function | Line | Status set | Callback data |
|-------------|----------|------|-----------|---------------|
| `research_agent.py` | `_research_pipeline()` | 128 | `research_complete` | `{status, project_id, graph_id}` |
| `threat_analyzer.py` | `_analysis_pipeline()` | 104 | `scenarios_ready` | `{status, project_id}` |
| `config_generator.py` | `_generate_pipeline()` | 44 | `config_ready` | `{status, project_id}` |
| `crucible_manager.py` | `launch_simulation()._monitor()` | 189 | `completed` | `{status, sim_id}` |
| `monte_carlo_engine.py` | `launch_batch()._run_batch()` | 335 | `completed` | `{status, batch_id, iterations}` |
| `exercise_report_agent.py` | `_generate_exercise_report()` | 1317 | `complete` | `{status, project_id}` |
| `comparative_report_agent.py` | `_generate_comparative()` | 166 | `complete` | `{status, project_id}` |

**Error case:** On failure, the same callback fires with `{status: "failed", error: "..."}` so the workflow can throw.

### Modified: `app/api/crucible.py` — accept `callback_token`

Each launch/start endpoint accepts an optional `callback_token` field in the request body and passes it through to the service layer:

- `POST /api/crucible/projects` (research) 
- `POST /api/crucible/projects/<id>/analyze-threats`
- `POST /api/crucible/projects/<id>/generate-configs`
- `POST /api/crucible/projects/<id>/launch` (simulations)
- `POST /api/crucible/monte-carlo/launch`
- `POST /api/crucible/projects/<id>/exercise-report`

## Frontend Changes

### New file: `frontend/app/api/pipeline/resume/route.ts`

Generic hook resume endpoint (mirrors existing `/api/pipeline/confirm/route.ts`):

```typescript
import { resumeHook } from "workflow/api";

export async function POST(req: Request) {
  const { token, data } = await req.json();

  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  try {
    const result = await resumeHook(token, data);
    return Response.json({ data: { runId: result.runId } });
  } catch {
    return Response.json({ error: "Invalid or expired token" }, { status: 404 });
  }
}
```

### Modified: `frontend/app/workflows/crucible-pipeline.ts`

**Remove:** `pollStatus`, `pollSimulation`, `pollReport`, `pollExerciseReport`, `pollComparativeReport`, `pollMonteCarlo` and their check step functions (`checkProjectStatus`, `checkSimStatus`, `checkReportStatus`, `checkExerciseReportStatus`, `checkComparativeReportStatus`, `checkMCStatus`). Note: `pollComparativeReport` and `pollReport` are dead code (defined but never called) — remove as cleanup.

**Keep:** `emitProgress`, `closeProgress`, `flaskApi` step functions.

**Replace polling with hooks.** Example for the simulation phase:

```typescript
// OLD (polling):
await Promise.all(simIds.map((id, i) =>
  (async () => {
    await pollSimulation(id);
  })()
));

// NEW (hooks, sequential awaits):
for (const [i, simId] of simIds.entries()) {
  const hook = createHook<{ status: string; sim_id: string }>({
    token: `sim-done-${simId}`,
  });
  const result = await hook;
  if (result.status === "failed") {
    throw new Error(`Simulation ${simId} failed`);
  }
  await emitProgress("simulations", "running",
    `Simulation ${i + 1}/${simIds.length} complete`, simId);
}
```

**Full phase mapping:**

| Phase | Old polling function | New hook token pattern | Passed via |
|-------|---------------------|----------------------|------------|
| Research | `pollStatus(projectId, ["research_complete", ...])` | `research-done-${projectId}` | `POST /projects` body |
| Threat analysis | `pollStatus(projectId, ["scenarios_ready"])` | `threats-done-${projectId}` | `POST /analyze-threats` body |
| Config expansion | `pollStatus(projectId, ["configs_ready"])` | `configs-done-${projectId}` | `POST /generate-configs` body |
| Simulations | `pollSimulation(simId)` per sim | `sim-done-${simId}` per sim | `POST /launch` body (array of tokens) |
| Monte Carlo | `pollMonteCarlo(batchId)` | `mc-done-${batchId}` | `POST /monte-carlo/launch` body |
| Exercise report | `pollExerciseReport(projectId)` | `report-done-${projectId}` | `POST /exercise-report` body |

### Modified: `frontend/app/pipeline/[runId]/page.tsx`

The pipeline page currently gets all progress through the WDK stream. With hooks, the workflow is suspended during long phases, so it can't emit progress ticks.

**Add direct status polling** for granular progress during active phases:

- When a phase is "running", poll the Flask status endpoint every 3 seconds for live stats (MC iteration count, sim round number, etc.)
- Display these in the existing progress UI
- Stop polling when the phase transitions to "completed" or "failed" via the WDK stream

This means the pipeline page has two data sources:
1. **WDK stream** (via `/api/pipeline/stream`) — phase transitions (start, complete, fail)
2. **Direct Flask polls** — granular progress within a running phase

## What stays the same

- Local World (no Postgres switch)
- `emitProgress()` calls for phase start/complete events
- `getWritable`/`getReadable` streaming architecture
- Dossier confirmation hook (already hook-based)
- All backend simulation/MC/report logic
- Pipeline page layout and components

## Error handling

- Backend `resume_workflow_hook()` catches all request exceptions and retries
- If all retries fail, the backend logs a warning but doesn't crash (fire-and-forget)
- The workflow has a top-level try/catch that emits `"error"` status on unhandled exceptions
- Hook data includes `status` field: workflow checks for `"failed"` and throws with the error message

## Verification

1. **Basic flow:** Run the pipeline end-to-end, confirm each phase transitions via hooks (no polling)
2. **Laptop sleep test:** Start a pipeline, close laptop lid during sim phase, reopen. Verify workflow resumes when backend fires the hook
3. **Race condition test:** Use `test` mode (fast research), verify the hook resume retries work when research completes before the hook is created
4. **Error propagation:** Kill a simulation mid-run, verify the workflow receives the failure via hook and displays the error
5. **Progress display:** During MC phase, verify the pipeline page shows live iteration progress via direct Flask polling
