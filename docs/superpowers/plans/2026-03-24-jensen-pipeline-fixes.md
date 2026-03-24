# Jensen Pipeline Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Monte Carlo, adversarial agents, adaptive depth, counterfactual branching into the WDK pipeline so every simulation run uses the full Jensen vision. TDD.

**Architecture:** Config expander auto-injects adversarial agent + adaptive depth into every config. WDK workflow adds parallel sim polling, Monte Carlo QUICK (10 iterations), and counterfactual analysis. Data flywheel stores aggregate outcomes in Firestore.

**Tech Stack:** Flask/Python backend, Next.js/TypeScript frontend with Vercel WDK, Google Cloud Firestore

---

### Task 1: Fix Counterfactual Field Name Mismatches

**Files:**
- Modify: `backend/app/services/counterfactual_engine.py:55-57`
- Test: `backend/tests/test_counterfactual_fields.py` (create)

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_counterfactual_fields.py
"""Test that counterfactual engine parses action fields correctly."""


def test_action_field_parsing():
    """Actions use 'agent' and 'action', not 'agent_name' and 'action_type'."""
    from app.services.counterfactual_engine import CounterfactualEngine

    actions = [
        {"round": 1, "agent": "CISO Yuki", "action": "send_message",
         "args": {"content": "Isolate the DB"}, "world": "ir-war-room"},
        {"round": 2, "agent": "SOC Lead", "action": "isolate_system",
         "args": {"target": "payment-db"}, "world": "ir-war-room"},
        {"round": 3, "agent": "CISO Yuki", "action": "send_email",
         "args": {"subject": "Board notification"}, "world": "executive"},
    ]
    config = {"agent_profiles": [{"name": "CISO Yuki"}, {"name": "SOC Lead"}]}

    # This should parse actions correctly — not return empty/unknown
    summary = CounterfactualEngine._build_action_summary(actions)
    assert "CISO Yuki" in summary
    assert "unknown" not in summary.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_counterfactual_fields.py -v`
Expected: FAIL — `_build_action_summary` uses `agent_name` field, returns "unknown"

- [ ] **Step 3: Fix field names in counterfactual_engine.py**

In `backend/app/services/counterfactual_engine.py`:
- Line 55: Change `action.get("agent_name", "unknown")` → `action.get("agent", "unknown")`
- Line 56: Change `action.get("action_type", "unknown")` → `action.get("action", "unknown")`
- Line 57: Change `action.get("content", "")` → `json.dumps(action.get("args", {}), ensure_ascii=False)[:100]`
- Search entire file for any other `agent_name` or `action_type` references and fix them

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_counterfactual_fields.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_counterfactual_fields.py backend/app/services/counterfactual_engine.py
git commit -m "fix: counterfactual engine field names (agent_name→agent, action_type→action)"
```

---

### Task 2: Add GET Simulation Config Endpoint

**Files:**
- Modify: `backend/app/api/crucible.py` (append endpoint)
- Test: `backend/tests/test_sim_config_endpoint.py` (create)

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_sim_config_endpoint.py
"""Test GET /api/crucible/simulations/<sim_id>/config endpoint."""
import json
from pathlib import Path


def test_get_sim_config(tmp_path):
    """Should return simulation config.json contents."""
    from app import create_app

    app = create_app()
    client = app.test_client()

    # Create a fake sim directory with config
    sim_dir = Path(app.config.get("UPLOAD_FOLDER", "uploads")) / "simulations" / "test_sim_001"
    sim_dir.mkdir(parents=True, exist_ok=True)
    config = {"simulation_id": "test_sim_001", "total_rounds": 10, "agent_profiles": []}
    (sim_dir / "config.json").write_text(json.dumps(config))

    response = client.get("/api/crucible/simulations/test_sim_001/config")
    assert response.status_code == 200
    data = response.get_json()
    assert data["data"]["simulation_id"] == "test_sim_001"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_sim_config_endpoint.py -v`
Expected: FAIL — 404, endpoint doesn't exist

- [ ] **Step 3: Add endpoint to crucible.py**

Append to `backend/app/api/crucible.py`:

```python
@crucible_bp.route("/simulations/<sim_id>/config", methods=["GET"])
def get_simulation_config(sim_id):
    """Return a simulation's config.json for reuse (e.g., Monte Carlo)."""
    config_path = SIMULATIONS_DIR / sim_id / "config.json"
    if not config_path.exists():
        return jsonify({"error": f"Config not found for simulation '{sim_id}'"}), 404
    with open(config_path) as f:
        config = json.load(f)
    return jsonify({"data": config})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_sim_config_endpoint.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/crucible.py backend/tests/test_sim_config_endpoint.py
git commit -m "feat: add GET /simulations/<sim_id>/config endpoint"
```

---

### Task 3: Config Expander — Auto-Inject Adversarial Agent + Adaptive Depth

**Files:**
- Modify: `backend/app/services/config_expander.py:210-234`
- Test: `backend/tests/test_config_adversarial.py` (create)

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_config_adversarial.py
"""Test that config expander injects adversarial agent and adaptive depth."""


def test_config_has_threat_actor():
    """Expanded config must include a threat_actor agent."""
    # We test the injection function directly, not the full LLM pipeline
    from app.services.config_expander import _inject_adversarial_and_adaptive

    base_config = {
        "simulation_id": "test_sim",
        "agent_profiles": [
            {"name": "CISO", "role": "ciso", "persona": "Security leader"},
        ],
        "worlds": [
            {"type": "slack", "name": "ir-war-room", "participants": ["ciso"]},
        ],
        "pressures": [],
        "scheduled_events": [],
        "total_rounds": 10,
        "threat_actor_profile": "APT-29 / Nation State",
    }

    enriched = _inject_adversarial_and_adaptive(base_config)

    # Must have adversarial agent
    threat_actors = [a for a in enriched["agent_profiles"] if a.get("agent_type") == "threat_actor"]
    assert len(threat_actors) == 1
    assert "c2" in threat_actors[0].get("c2_world", "").lower() or "c2" in str(threat_actors[0]).lower()
    assert threat_actors[0].get("threat_profile") is not None

    # Must have C2 world
    c2_worlds = [w for w in enriched["worlds"] if "c2" in w.get("name", "").lower()]
    assert len(c2_worlds) == 1

    # Must have adaptive depth enabled
    assert enriched.get("adaptive_depth", {}).get("enabled") is True
    assert enriched["adaptive_depth"]["min_rounds"] >= 3
    assert enriched["adaptive_depth"]["max_rounds"] >= 15
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_config_adversarial.py -v`
Expected: FAIL — `_inject_adversarial_and_adaptive` doesn't exist

- [ ] **Step 3: Implement `_inject_adversarial_and_adaptive` in config_expander.py**

Add new function after line 527 in `backend/app/services/config_expander.py`:

```python
def _inject_adversarial_and_adaptive(config: dict) -> dict:
    """Inject adversarial threat actor agent, C2 world, and adaptive depth into any config.

    Called after the main config expansion (or on an existing config for Monte Carlo reuse).
    Does NOT require an LLM call — uses the threat_actor_profile field to template the agent.
    """
    import copy
    config = copy.deepcopy(config)

    threat_profile_name = config.get("threat_actor_profile", "Unknown Threat Actor")

    # Skip if already has a threat actor
    existing_ta = [a for a in config.get("agent_profiles", []) if a.get("agent_type") == "threat_actor"]
    if existing_ta:
        # Just ensure adaptive depth
        if "adaptive_depth" not in config:
            config["adaptive_depth"] = {"enabled": True, "min_rounds": 3, "max_rounds": 30}
        return config

    # Determine observable worlds (all existing slack-type worlds)
    observable = [w["name"] for w in config.get("worlds", []) if w.get("type") in ("slack", "email")]

    # Build adversarial agent
    threat_actor = {
        "agent_type": "threat_actor",
        "name": f"{threat_profile_name} Operator",
        "role": "threat_actor",
        "persona": (
            f"You are an operator for {threat_profile_name}. You are methodical, patient, "
            f"and adapt your tactics when detected. Your primary objective is to achieve your "
            f"mission goals while avoiding detection as long as possible."
        ),
        "threat_profile": {
            "actor_type": "nation_state" if "apt" in threat_profile_name.lower() else "cybercriminal",
            "sophistication": "advanced",
            "objectives": ["data_exfiltration", "persistence"],
            "stealth_priority": 0.7,
        },
        "c2_world": "c2-channel",
        "observable_worlds": observable[:3],  # Max 3 channels to observe
        "adaptive_triggers": [
            {
                "condition": {"keywords": ["isolate", "block", "quarantine", "contain"]},
                "response": "pivot_to_backup_access",
            },
            {
                "condition": {"keywords": ["forensics", "IOC", "indicator"]},
                "response": "activate_anti_forensics",
            },
        ],
    }
    config["agent_profiles"].append(threat_actor)

    # Add C2 world
    c2_world = {
        "type": "slack",
        "name": "c2-channel",
        "participants": ["threat_actor"],
    }
    config["worlds"].append(c2_world)

    # Enable adaptive depth
    config["adaptive_depth"] = {
        "enabled": True,
        "min_rounds": 3,
        "max_rounds": 30,
    }

    return config
```

Then modify `_expand_single_scenario()` at line 233 (before the return) to call it:

```python
    config = _inject_adversarial_and_adaptive(config)
    return config
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_config_adversarial.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/config_expander.py backend/tests/test_config_adversarial.py
git commit -m "feat: auto-inject adversarial agent + adaptive depth into every config"
```

---

### Task 4: Counterfactual Resume — Fork Must Actually Run

**Files:**
- Modify: `backend/app/services/counterfactual_engine.py:107-201`
- Modify: `backend/app/api/crucible.py` (update fork endpoint)
- Test: `backend/tests/test_counterfactual_resume.py` (create)

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_counterfactual_resume.py
"""Test that forked simulations can be launched and run to completion."""


def test_fork_creates_launchable_config():
    """fork_from_checkpoint should return a config that can be passed to launch_simulation."""
    import json
    from pathlib import Path
    from app.services.counterfactual_engine import CounterfactualEngine

    # Create mock sim directory with checkpoint
    sim_dir = Path("uploads/simulations/test_fork_sim")
    sim_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir = sim_dir / "checkpoints"
    checkpoint_dir.mkdir(exist_ok=True)

    config = {
        "simulation_id": "test_fork_sim",
        "total_rounds": 10,
        "agent_profiles": [{"name": "CISO", "role": "ciso", "persona": "Leader"}],
        "worlds": [{"type": "slack", "name": "ir-war-room"}],
        "pressures": [],
        "scheduled_events": [],
    }
    (sim_dir / "config.json").write_text(json.dumps(config))

    checkpoint = {
        "round": 3,
        "all_actions": [{"round": 1, "agent": "CISO", "action": "send_message"}],
        "world_history": {"ir-war-room": ["[CISO]: Isolate the DB"]},
        "active_events": [],
    }
    (checkpoint_dir / "round_3.json").write_text(json.dumps(checkpoint))

    # Fork
    fork_info = CounterfactualEngine.fork_from_checkpoint(
        "test_fork_sim", 3, {"type": "inject_event", "details": {"event": "Attacker pivots"}}
    )

    assert fork_info["branch_id"] is not None
    assert fork_info["config"]["total_rounds"] == 10
    assert fork_info["fork_round"] == 3
    # The fork should have a resume_from_round field
    assert fork_info["config"].get("_resume_from_round") == 3
    # The fork should carry forward the checkpoint state
    assert fork_info.get("checkpoint") is not None

    # Cleanup
    import shutil
    shutil.rmtree(sim_dir, ignore_errors=True)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_counterfactual_resume.py -v`
Expected: FAIL — no `_resume_from_round` in fork output

- [ ] **Step 3: Update fork_from_checkpoint to include resume data**

In `backend/app/services/counterfactual_engine.py`, update `fork_from_checkpoint` to:
1. Add `_resume_from_round` to the forked config
2. Include the checkpoint state in the return dict
3. Add a `launch_fork()` static method that calls `crucible_manager.launch_simulation` with the forked config

```python
@staticmethod
def launch_fork(fork_info: dict) -> str:
    """Launch a forked simulation. Returns the new sim_id."""
    from . import crucible_manager
    config = fork_info["config"]
    branch_id = fork_info["branch_id"]
    sim_id = f"{config['simulation_id']}_branch_{branch_id}"
    config["simulation_id"] = sim_id
    config["_resume_from_round"] = fork_info["fork_round"]
    config["_checkpoint_state"] = fork_info.get("checkpoint")
    return crucible_manager.launch_simulation(config, sim_id=sim_id)
```

Update the fork API endpoint in `crucible.py` to also launch:
```python
# In the /simulations/<sim_id>/fork endpoint, after fork_from_checkpoint:
fork_sim_id = CounterfactualEngine.launch_fork(fork_info)
return jsonify({"data": {**fork_info, "sim_id": fork_sim_id}})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_counterfactual_resume.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/counterfactual_engine.py backend/app/api/crucible.py backend/tests/test_counterfactual_resume.py
git commit -m "feat: counterfactual fork now launches runnable simulation"
```

---

### Task 5: Data Flywheel — Store + Retrieve Aggregate Outcomes

**Files:**
- Modify: `backend/app/services/firestore_memory.py` (add 2 methods)
- Modify: `backend/app/services/monte_carlo_engine.py` (store after batch)
- Test: `backend/tests/test_data_flywheel.py` (create)

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_data_flywheel.py
"""Test data flywheel: store and retrieve aggregate outcomes."""


def test_store_and_retrieve_aggregates():
    """FirestoreMemory should store and retrieve batch aggregate outcomes."""
    from app.services.firestore_memory import FirestoreMemory

    memory = FirestoreMemory()

    # Store an aggregate outcome
    aggregate = {
        "batch_id": "mc_test_001",
        "project_id": "proj_test",
        "mode": "test",
        "iterations": 3,
        "outcome_distribution": {"contained_early": 2, "not_contained": 1},
        "containment_round_stats": {"mean": 5.0, "median": 4.0, "std": 2.0},
        "cost_summary": {"total_usd": 0.21},
    }
    doc_id = memory.store_aggregate_outcome(aggregate)
    assert doc_id is not None

    # Retrieve aggregates for this project
    results = memory.get_project_aggregates("proj_test")
    assert len(results) >= 1
    assert results[0]["batch_id"] == "mc_test_001"

    # Retrieve containment probability for scenario weighting
    prob = memory.get_containment_probability("proj_test")
    assert 0.0 <= prob <= 1.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_data_flywheel.py -v`
Expected: FAIL — methods don't exist

- [ ] **Step 3: Add flywheel methods to firestore_memory.py**

Add to `backend/app/services/firestore_memory.py`:

```python
def store_aggregate_outcome(self, aggregate: dict) -> str:
    """Store Monte Carlo batch aggregate outcome for the data flywheel.

    Collection: mc_aggregates
    Used to weight future scenario probabilities and improve predictions.
    """
    doc_ref = self._db.collection("mc_aggregates").document()
    doc_ref.set({
        "batch_id": aggregate.get("batch_id", ""),
        "project_id": aggregate.get("project_id", ""),
        "mode": aggregate.get("mode", ""),
        "iterations": aggregate.get("iterations", 0),
        "outcome_distribution": aggregate.get("outcome_distribution", {}),
        "containment_round_stats": aggregate.get("containment_round_stats", {}),
        "cost_summary": aggregate.get("cost_summary", {}),
        "created_at": firestore.SERVER_TIMESTAMP,
    })
    return doc_ref.id

def get_project_aggregates(self, project_id: str, limit: int = 10) -> list[dict]:
    """Retrieve stored aggregate outcomes for a project."""
    docs = (
        self._db.collection("mc_aggregates")
        .where("project_id", "==", project_id)
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .get()
    )
    return [doc.to_dict() for doc in docs]

def get_containment_probability(self, project_id: str) -> float:
    """Calculate historical containment probability across all MC runs for a project.

    Returns weighted average of containment rates. Used for scenario probability adjustment.
    """
    aggregates = self.get_project_aggregates(project_id, limit=20)
    if not aggregates:
        return 0.5  # No data — neutral prior

    total_contained = 0
    total_iterations = 0
    for agg in aggregates:
        dist = agg.get("outcome_distribution", {})
        contained = dist.get("contained_early", 0) + dist.get("contained_late", 0)
        total = sum(dist.values()) if dist else 0
        total_contained += contained
        total_iterations += total

    return total_contained / total_iterations if total_iterations > 0 else 0.5
```

- [ ] **Step 4: Wire into monte_carlo_engine.py**

In `backend/app/services/monte_carlo_engine.py`, in `_run_batch()` after aggregation completes, add:

```python
# Data flywheel: store aggregate outcomes for future learning
try:
    from .firestore_memory import FirestoreMemory
    flywheel = FirestoreMemory()
    flywheel.store_aggregate_outcome({
        "batch_id": batch.batch_id,
        "project_id": batch.project_id,
        "mode": batch.mode.value,
        "iterations": batch.iterations_completed,
        "outcome_distribution": aggregation.outcome_distribution,
        "containment_round_stats": {
            "mean": aggregation.containment_round_stats.mean,
            "median": aggregation.containment_round_stats.median,
            "std": aggregation.containment_round_stats.std,
        },
        "cost_summary": {"total_usd": batch.cost_tracker.total_cost()},
    })
    logger.info("Data flywheel: stored aggregate for batch %s", batch.batch_id)
except Exception as e:
    logger.warning("Data flywheel store failed (non-fatal): %s", e)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_data_flywheel.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/firestore_memory.py backend/app/services/monte_carlo_engine.py backend/tests/test_data_flywheel.py
git commit -m "feat: data flywheel — store aggregate outcomes in Firestore for learning"
```

---

### Task 6: Wire WDK Pipeline — Parallel Sims + MC + Counterfactual

**Files:**
- Modify: `frontend/app/workflows/crucible-pipeline.ts:309-344`
- Modify: `frontend/app/pipeline/[runId]/page.tsx:38-46`
- Test: Manual E2E (automated test not feasible for WDK workflows)

- [ ] **Step 1: Add pollMonteCarlo function to pipeline**

In `frontend/app/workflows/crucible-pipeline.ts`, add after `pollExerciseReport` (~line 160):

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

- [ ] **Step 2: Fix Step 6 — parallel simulation polling**

Replace lines 322-326 (the sequential `for` loop):

```typescript
// BEFORE:
// for (let i = 0; i < simIds.length; i++) {
//   await pollSimulation(simIds[i]);
// }

// AFTER: parallel polling
await Promise.all(simIds.map((id, i) =>
  (async () => {
    await emitProgress("simulations", "running",
      `Simulation ${i + 1}/${simIds.length} running...`, id);
    await pollSimulation(id);
  })()
));
```

- [ ] **Step 3: Add Step 7 — Monte Carlo QUICK**

After step 6 completion (line 330), add:

```typescript
    // ─── STEP 7: Monte Carlo analysis ───
    stageStart = Date.now();
    await emitProgress("monte_carlo", "running", "Launching Monte Carlo analysis (10 iterations)...");

    let mcBatchId = "";
    let mcResults: Record<string, unknown> = {};
    try {
      // Get config from first sim for MC reuse
      const simConfig = await flaskApi<Record<string, unknown>>(
        `/api/crucible/simulations/${simIds[0]}/config`,
      );

      // Launch MC QUICK mode (10 iterations)
      const mcLaunch = await flaskApi<{ batch_id: string }>(
        "/api/crucible/monte-carlo/launch",
        { method: "POST", body: JSON.stringify({
          project_id: projectId,
          config: simConfig,
          mode: "quick",
          cost_limit_usd: 25.0,
        })},
      );
      mcBatchId = mcLaunch.batch_id;

      await emitProgress("monte_carlo", "running",
        "Running 10 Monte Carlo iterations...", mcBatchId);
      await pollMonteCarlo(mcBatchId);

      mcResults = await flaskApi<Record<string, unknown>>(
        `/api/crucible/monte-carlo/${mcBatchId}/results`,
      );

      stageDurations.monte_carlo = Date.now() - stageStart;
      await emitProgress("monte_carlo", "completed",
        "Monte Carlo analysis complete",
        JSON.stringify({ batchId: mcBatchId, iterations: 10 }),
        stageDurations.monte_carlo);
    } catch (mcError) {
      stageDurations.monte_carlo = Date.now() - stageStart;
      const msg = mcError instanceof Error ? mcError.message : String(mcError);
      await emitProgress("monte_carlo", "failed",
        `Monte Carlo failed: ${msg}`, undefined, stageDurations.monte_carlo);
      // Non-fatal — continue pipeline
    }
```

- [ ] **Step 4: Add Step 8 — Counterfactual analysis**

After MC step:

```typescript
    // ─── STEP 8: Counterfactual analysis ───
    stageStart = Date.now();
    await emitProgress("counterfactual", "running", "Analyzing critical decisions...");

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

      const topDecisions = (decisions.decision_points || [])
        .filter(d => d.criticality === "high")
        .slice(0, 2);

      await emitProgress("counterfactual", "running",
        `Found ${topDecisions.length} critical decisions, forking...`);

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
            branchIds.push(fork.sim_id);
            await pollSimulation(fork.sim_id);
          }
        } catch {
          // Individual fork failure is non-fatal
        }
      }

      stageDurations.counterfactual = Date.now() - stageStart;
      await emitProgress("counterfactual", "completed",
        `Analyzed ${topDecisions.length} decisions, ${branchIds.length} branches complete`,
        undefined, stageDurations.counterfactual);
    } catch (cfError) {
      stageDurations.counterfactual = Date.now() - stageStart;
      const msg = cfError instanceof Error ? cfError.message : String(cfError);
      await emitProgress("counterfactual", "failed",
        `Counterfactual failed: ${msg}`, undefined, stageDurations.counterfactual);
      // Non-fatal — continue to report
    }
```

- [ ] **Step 5: Update STEP_ORDER in pipeline page**

In `frontend/app/pipeline/[runId]/page.tsx`, update STEP_ORDER (lines 38-46):

```typescript
const STEP_ORDER = [
  { id: "research", label: "Company Research" },
  { id: "dossier_review", label: "Dossier Review" },
  { id: "threat_analysis", label: "Threat Analysis" },
  { id: "scenario_selection", label: "Scenario Selection" },
  { id: "config_expansion", label: "Config Generation" },
  { id: "simulations", label: "Simulations" },
  { id: "monte_carlo", label: "Monte Carlo Analysis" },
  { id: "counterfactual", label: "Counterfactual Analysis" },
  { id: "exercise_report", label: "Exercise Report" },
];
```

- [ ] **Step 6: Update PipelineStagesPanel inline summaries**

In `frontend/app/components/pipeline/PipelineStagesPanel.tsx`, add cases to `getInlineSummary()`:

```typescript
case "monte_carlo":
  return detail ? `MC: ${detail}` : "Monte Carlo complete";
case "counterfactual":
  return detail ? detail : "Counterfactual complete";
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add frontend/app/workflows/crucible-pipeline.ts frontend/app/pipeline/[runId]/page.tsx frontend/app/components/pipeline/PipelineStagesPanel.tsx
git commit -m "feat: wire MC + counterfactual into WDK pipeline (parallel sims, 10-iter MC, auto-fork)"
```

---

### Task 7: Integration Test — Full Pipeline E2E

**Files:**
- Test: `backend/tests/test_pipeline_integration.py` (create)

- [ ] **Step 1: Write integration test**

```python
# backend/tests/test_pipeline_integration.py
"""Integration test: verify config expander produces adversarial + adaptive configs."""
import json


def test_expanded_config_has_all_jensen_features():
    """Config from expander should have adversarial agent, C2 world, adaptive depth."""
    from app.services.config_expander import _inject_adversarial_and_adaptive

    # Simulate a config that would come from the LLM expansion
    raw_config = {
        "simulation_id": "proj_test_scenario_0_sim",
        "project_id": "proj_test",
        "company_name": "TestCorp",
        "scenario": "Ransomware attack via phishing",
        "total_rounds": 10,
        "hours_per_round": 1.0,
        "agent_profiles": [
            {"name": "Alice", "role": "ciso", "persona": "Security leader"},
            {"name": "Bob", "role": "soc_lead", "persona": "SOC analyst"},
        ],
        "worlds": [
            {"type": "slack", "name": "ir-war-room", "participants": ["ciso", "soc_lead"]},
            {"type": "email", "name": "executive", "participants": ["ciso"]},
        ],
        "pressures": [{"name": "GDPR 72h", "type": "countdown", "hours": 72}],
        "scheduled_events": [{"round": 1, "description": "Initial alert"}],
        "threat_actor_profile": "APT-29 / Fancy Bear",
    }

    config = _inject_adversarial_and_adaptive(raw_config)

    # 1. Adversarial agent exists
    threat_actors = [a for a in config["agent_profiles"] if a.get("agent_type") == "threat_actor"]
    assert len(threat_actors) == 1, f"Expected 1 threat actor, got {len(threat_actors)}"
    ta = threat_actors[0]
    assert ta["role"] == "threat_actor"
    assert ta.get("threat_profile") is not None
    assert ta.get("c2_world") is not None
    assert len(ta.get("observable_worlds", [])) > 0
    assert len(ta.get("adaptive_triggers", [])) > 0

    # 2. C2 world exists
    c2_worlds = [w for w in config["worlds"] if "c2" in w.get("name", "").lower()]
    assert len(c2_worlds) == 1, f"Expected 1 C2 world, got {len(c2_worlds)}"
    assert c2_worlds[0]["participants"] == ["threat_actor"]

    # 3. Adaptive depth enabled
    ad = config.get("adaptive_depth", {})
    assert ad.get("enabled") is True
    assert ad.get("min_rounds", 0) >= 3
    assert ad.get("max_rounds", 0) >= 15

    # 4. Original agents preserved
    assert len(config["agent_profiles"]) == 3  # 2 original + 1 threat actor
    assert len(config["worlds"]) == 3  # 2 original + 1 C2

    # 5. Idempotent — calling twice doesn't add duplicate
    config2 = _inject_adversarial_and_adaptive(config)
    threat_actors2 = [a for a in config2["agent_profiles"] if a.get("agent_type") == "threat_actor"]
    assert len(threat_actors2) == 1, "Should not add duplicate threat actor"


def test_mc_cost_estimation():
    """Monte Carlo cost estimation should return sensible values."""
    from app.services.monte_carlo_engine import MonteCarloEngine, MonteCarloMode

    config = {
        "agent_profiles": [{"name": f"Agent{i}"} for i in range(10)],
        "worlds": [{"name": "Slack"}, {"name": "Email"}],
        "total_rounds": 10,
    }

    estimate = MonteCarloEngine.estimate_cost(config, MonteCarloMode.QUICK)
    assert estimate["iterations"] == 10
    assert estimate["total_estimated_cost_usd"] > 0
    assert estimate["per_sim_cost_usd"] > 0


def test_counterfactual_field_names():
    """Counterfactual engine should handle real action field names."""
    from app.services.counterfactual_engine import CounterfactualEngine

    actions = [
        {"round": 1, "agent": "CISO", "action": "send_message",
         "args": {"content": "Alert everyone"}, "world": "slack"},
        {"round": 2, "agent": "SOC Lead", "action": "isolate_system",
         "args": {"target": "db-01"}, "world": "slack"},
    ]
    # Should not throw, should parse correctly
    summary = CounterfactualEngine._build_action_summary(actions)
    assert "CISO" in summary
    assert "SOC Lead" in summary
```

- [ ] **Step 2: Run all tests**

Run: `cd backend && uv run pytest tests/ -v`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_pipeline_integration.py
git commit -m "test: integration tests for Jensen pipeline features"
```

---

## Execution Checklist

After all tasks complete:

1. `cd backend && uv run pytest tests/ -v` — all tests pass
2. `cd frontend && npx tsc --noEmit` — TypeScript clean
3. `./start.sh` — app starts with Mission Control banner showing all features
4. Create a new pipeline run from the UI — verify:
   - Config expansion produces configs with adversarial agent + adaptive depth
   - Simulations poll in parallel (both start simultaneously)
   - Monte Carlo step runs 10 iterations
   - Counterfactual step identifies decisions and forks
   - Exercise report completes
   - All costs tracked
