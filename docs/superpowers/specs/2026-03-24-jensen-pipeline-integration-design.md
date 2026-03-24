# Jensen Pipeline Integration — Design Spec

**Date:** 2026-03-24
**Goal:** Wire Monte Carlo, adversarial agents, adaptive depth, counterfactual branching into the WDK pipeline end-to-end. TDD approach.

## Pipeline Flow (10 Steps)

```
research → dossier_review → threat_analysis → scenario_selection
→ config_expansion (+ adversarial agent + adaptive depth injection)
→ simulations (parallel polling, adversarial + adaptive)
→ monte_carlo (3-iteration test on top scenario)
→ counterfactual (identify decisions, auto-fork top 2)
→ exercise_report (enhanced with MC stats + counterfactual data)
→ complete
```

## Changes Required

### 1. Config Expander (`backend/app/services/config_expander.py`)

Add after existing 9 LLM calls:

**LLM Call 10 — Adversarial Agent Generation:**
- Function: `_generate_adversarial_agent(llm, scenario, worlds, agents)`
- Input: scenario (has `threat_actor_profile`), existing worlds and agents
- Output: threat_actor agent config + C2 world config
- Agent schema:
  ```json
  {
    "agent_type": "threat_actor",
    "name": "APT-29 Operator",
    "role": "threat_actor",
    "persona": "...",
    "threat_profile": {
      "actor_type": "nation_state",
      "sophistication": "advanced",
      "objectives": ["data_exfiltration", "persistence"],
      "stealth_priority": 0.7
    },
    "c2_world": "c2-channel",
    "observable_worlds": ["ir-war-room", "executive-strategy"],
    "adaptive_triggers": [
      {"condition": {"keywords": ["isolate", "block"]}, "response": "pivot_to_backup"}
    ]
  }
  ```
- C2 world: `{"type": "slack", "name": "c2-channel", "participants": ["threat_actor"]}`

**Adaptive Depth Injection:**
- Add to every config: `"adaptive_depth": {"enabled": true, "min_rounds": 3, "max_rounds": 30}`

### 2. WDK Workflow (`frontend/app/workflows/crucible-pipeline.ts`)

**Step 6 fix — parallel simulation polling:**
```typescript
// BEFORE: sequential
for (let i = 0; i < simIds.length; i++) {
  await pollSimulation(simIds[i]);
}

// AFTER: parallel
await Promise.all(simIds.map(id => pollSimulation(id)));
```

**Step 7 — Monte Carlo test (NEW):**
```typescript
stageStart = Date.now();
await emitProgress("monte_carlo", "running", "Running Monte Carlo test (3 iterations)...");

// Get config from first (highest-severity) sim
const simConfig = await flaskApi<Record<string, unknown>>(
  `/api/crucible/simulations/${simIds[0]}/config`
);

// Estimate cost
const estimate = await flaskApi<{ total_estimated_cost_usd: number }>(
  "/api/crucible/monte-carlo/estimate",
  { method: "POST", body: JSON.stringify({ config: simConfig, mode: "test" }) }
);

// Launch MC test batch
const mcResult = await flaskApi<{ batch_id: string }>(
  "/api/crucible/monte-carlo/launch",
  { method: "POST", body: JSON.stringify({
    project_id: projectId,
    config: simConfig,
    mode: "test",
    cost_limit_usd: 5.0,
  })}
);
const batchId = mcResult.batch_id;

// Poll until complete
await pollMonteCarlo(batchId);

// Get aggregation
const mcResults = await flaskApi<Record<string, unknown>>(
  `/api/crucible/monte-carlo/${batchId}/results`
);

stageDurations.monte_carlo = Date.now() - stageStart;
await emitProgress("monte_carlo", "completed", "Monte Carlo test complete",
  JSON.stringify(mcResults), stageDurations.monte_carlo);
```

**Step 8 — Counterfactual analysis (NEW):**
```typescript
stageStart = Date.now();
await emitProgress("counterfactual", "running", "Analyzing critical decisions...");

// Identify decision points on first sim
const decisions = await flaskApi<{ decision_points: DecisionPoint[] }>(
  `/api/crucible/simulations/${simIds[0]}/decision-points`,
  { method: "POST" }
);

const topDecisions = (decisions.decision_points || [])
  .filter(d => d.criticality === "high")
  .slice(0, 2);

// Fork top 2 decisions
const branchIds: string[] = [];
for (const decision of topDecisions) {
  const fork = await flaskApi<{ branch_id: string; sim_id?: string }>(
    `/api/crucible/simulations/${simIds[0]}/fork`,
    { method: "POST", body: JSON.stringify({
      fork_round: decision.round,
      modifications: decision.suggested_modification,
    })}
  );
  if (fork.branch_id) branchIds.push(fork.branch_id);
}

// Poll fork sims (if they produce runnable sims)
// Note: fork creates config + checkpoint; may need a launch step

stageDurations.counterfactual = Date.now() - stageStart;
await emitProgress("counterfactual", "completed",
  `Analyzed ${topDecisions.length} critical decisions, forked ${branchIds.length} branches`,
  undefined, stageDurations.counterfactual);
```

**New polling function:**
```typescript
async function pollMonteCarlo(batchId: string): Promise<void> {
  "use step";
  for (let i = 0; i < 360; i++) {
    const res = await fetch(`${API_BASE}/api/crucible/monte-carlo/${batchId}/status`);
    const json = await res.json();
    const status = json.data?.status as string;
    if (status === "completed") return;
    if (["failed", "cost_exceeded", "stopped"].includes(status)) {
      throw new Error(`Monte Carlo batch ${batchId} ${status}: ${json.data?.error || ""}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Monte Carlo batch ${batchId} timed out`);
}
```

### 3. Frontend Pipeline UI

**`PipelineStagesPanel.tsx`** — Add to STEP_ORDER:
```typescript
const STEP_ORDER = [
  "research",
  "dossier_review",
  "threat_analysis",
  "scenario_selection",
  "config_expansion",
  "simulations",
  "monte_carlo",       // NEW
  "counterfactual",    // NEW
  "exercise_report",
];
```

**Stage labels/descriptions** for the new steps in the stages config map.

### 4. Backend API Gaps

**Needed endpoint:** `GET /api/crucible/simulations/{simId}/config`
- Returns the simulation's `config.json` for reuse in Monte Carlo
- Currently not exposed — need to add to `crucible.py`

**Needed behavior:** Monte Carlo engine's `_run_batch` must handle the case where `run_single_iteration` is called with an existing config (not a new subprocess). Currently it imports from `scripts/run_crucible_simulation.py` which may have path issues when called from the Flask process.

### 5. TDD Test Plan

**Test file:** `backend/tests/test_jensen_pipeline.py`

```python
# Test 1: Config expander injects adversarial agent
def test_config_has_adversarial_agent():
    config = expand_config(project_id, scenario_id, dossier)
    threat_actors = [a for a in config["agent_profiles"] if a.get("agent_type") == "threat_actor"]
    assert len(threat_actors) == 1
    assert "c2" in threat_actors[0].get("c2_world", "").lower()
    assert config.get("adaptive_depth", {}).get("enabled") is True

# Test 2: Simulation runs with adversarial + adaptive
def test_sim_with_adversarial_adaptive():
    # Uses a minimal test config with 2 defenders + 1 attacker + adaptive_depth
    result = asyncio.run(run_single_iteration(test_config, output_dir))
    assert result["total_rounds"] <= 30  # adaptive stopped it
    assert Path(output_dir / "checkpoints").exists()
    actions = load_actions(output_dir / "actions.jsonl")
    attacker_actions = [a for a in actions if a.get("agent_type") == "threat_actor"]
    assert len(attacker_actions) > 0

# Test 3: Monte Carlo test mode
def test_monte_carlo_test_mode():
    batch_id = MonteCarloEngine.launch_batch(project_id, config, MonteCarloMode.TEST)
    # Poll until done
    while True:
        status = MonteCarloEngine.get_batch_status(batch_id)
        if status["status"] in ("completed", "failed"): break
        time.sleep(2)
    assert status["status"] == "completed"
    assert status["iterations_completed"] == 3

# Test 4: Counterfactual branching
def test_counterfactual_fork():
    # Requires a completed sim with checkpoints
    points = CounterfactualEngine.identify_decision_points(sim_id, actions, config)
    assert len(points) >= 1
    fork_info = CounterfactualEngine.fork_from_checkpoint(sim_id, points[0]["round"], {})
    assert fork_info["branch_id"] is not None

# Test 5: End-to-end pipeline (integration test)
def test_full_pipeline_e2e():
    # Calls the Flask API endpoints in sequence
    # This validates the entire chain works
    pass  # Implemented as an HTTP-level integration test
```

### 6. Stress Testing (On-Demand)

Not part of the automatic pipeline. Available from:
- The Monte Carlo batch dashboard page (`/batch/[batchId]`)
- A "Run Stress Test" button on the simulation detail page
- Calls `POST /api/crucible/projects/{projectId}/stress-test`

## Implementation Order

1. Write tests (TDD)
2. Add `GET /api/crucible/simulations/{simId}/config` endpoint
3. Modify `config_expander.py` — add LLM Call 10 (adversarial) + adaptive_depth injection
4. Modify `crucible-pipeline.ts` — parallel sims, MC step, counterfactual step
5. Update `PipelineStagesPanel.tsx` — add new stage labels
6. Run 3-iteration test to validate end-to-end
7. Fix any issues discovered in testing

## Success Criteria

- Running a pipeline from the UI produces simulations WITH an adversarial agent
- Simulations use adaptive depth (stop when arbiter says contained, not fixed rounds)
- Monte Carlo test (3 iterations) runs automatically after sims complete
- Decision points are identified and at least 1 counterfactual branch is created
- Exercise report mentions probabilistic data from MC results
- All costs tracked end-to-end
- Logs show Mission Control output for every step
