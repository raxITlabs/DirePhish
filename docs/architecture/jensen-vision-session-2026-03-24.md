# Jensen Vision — DirePhish Architecture Session (2026-03-24)

> **Historical decision record.** Some implementation details may have evolved since this session. See [data-flow-diagram.md](data-flow-diagram.md) for the current architecture.

> This document captures the architectural decisions made during a session where Jensen Huang (NVIDIA CEO, roleplayed) evaluated the DirePhish threat simulation platform and directed its transformation from a demo into an enterprise-grade probabilistic threat intelligence engine. Every technical decision, debugging session, and implementation detail is recorded here as a permanent reference.

---

## 1. Jensen's Initial Assessment — The 7 Critiques

Jensen evaluated DirePhish and delivered 7 specific critiques:

1. **"A thin orchestration layer over somebody else's LLM"** — no moat. Every component (research, simulation, report) is replaceable in an afternoon by any team with API keys. There is no proprietary intelligence, no trained model, no accumulated advantage.

2. **No real inference infrastructure** — synchronous API calls, one at a time. No batching, no queuing, no parallelism. Every LLM call blocks the next. This is hobby-scale architecture.

3. **Simulation is toy-scale** — 3 rounds default, 8-15 max, single run = single story. One simulation produces one narrative. No statistical validity, no confidence intervals, no way to distinguish signal from noise.

4. **No data flywheel** — crawl website, synthesize dossier, throw it away. Every simulation starts from zero. No learning, no accumulation, no network effect across customers.

5. **File-based JSON storage** — no database, JSON files, JSONL action logs. Everything in `/tmp` or local directories. No persistence across restarts, no query capability, no scale.

6. **Knowledge graph (Graphiti/KuzuDB) was the most interesting piece but local-only** — the graph was the closest thing to a moat, but it ran in-process with KuzuDB (embedded), consumed ~500MB RAM per process, and couldn't be shared across simulations or customers.

7. **Monte Carlo is a GPU workload** — millions of possible attack paths, each requiring LLM inference. Running them sequentially on a single API connection is fundamentally wrong. This should be massively parallel.

### Jensen's Vision — What DirePhish SHOULD Produce

Jensen described the output a CISO should see:

> "Across 100 simulations of a ransomware attack on NovaPay:
> - 73% of the time, the IR team contained the breach within 12 hours
> - In 18% of runs, lateral movement to customer DB succeeded
> - 9% resulted in full regulatory escalation (GDPR notification)
> - Mean time to containment: 8.4 hours (sigma = 3.2)
> - The single highest-impact decision point: Round 3, whether to isolate payment DB"

This is the product. Not a single story — a probabilistic threat assessment backed by hundreds of simulated outcomes.

### Jensen's 5 Strategic Recommendations

1. **Pick ONE thing and make it world-class** — threat scenario generation from dossier is interesting, make it a *model* not a prompt
2. **Bring inference local** — run own fine-tuned models, change unit economics
3. **Build the data flywheel** — every simulation is training data, every report is a label, every user edit is RLHF
4. **Knowledge graph is the moat** — persistent across customers, anonymized, network effect
5. **Monte Carlo at scale** — thousands of attack paths simultaneously, probabilistic outcomes

---

## 2. Graphiti to Firestore Migration

### What Graphiti Did
- LLM-based entity extraction from text using OpenAI function calls
- KuzuDB embedded graph database for storing entities and relationships
- ~500MB memory per process (KuzuDB loads full graph into RAM)
- Used by research agent to build organizational knowledge graph from dossier

### What Zep Did
- Graph memory service for report generation (interview-style Q&A)
- Provided `zep_tools.py` with search/retrieval functions for LLM tool use
- `zep_graph_memory_updater.py` pushed simulation episodes into Zep's memory
- `zep_entity_reader.py` pulled entity summaries for report context
- `zep_paging.py` handled Zep's paginated API responses

### Why They Were Replaced
Memory bottleneck blocked Monte Carlo scaling. Running 10 concurrent simulations would require 10 KuzuDB instances = ~5GB RAM just for graphs. Zep added another external dependency with its own scaling limits. Neither could share knowledge across simulations or persist beyond the process lifecycle.

### Research Conducted
Evaluated ALL relevant Google Cloud APIs before deciding:

| API | Evaluation | Verdict |
|-----|-----------|---------|
| Gemini File Search | Upload files, search with grounding | Too coarse — file-level, not entity-level |
| Gemini Context Caching | Cache large context, 90% token discount | Requires Gemini 2.5+ models, future optimization |
| Firestore Vector Search | Native vector similarity on document fields | **WINNER** — strong consistency, pay-per-use |
| AlloyDB (PostgreSQL + pgvector) | Managed PostgreSQL with vector extensions | Always-on instance cost (~$200/mo minimum) |
| Vertex AI RAG Engine | Managed RAG pipeline | Overkill, opaque, expensive for this use case |
| Memory Bank (Gemini) | Session-based memory | Too ephemeral, no cross-session persistence |
| Cloud Natural Language API | Entity extraction | No relationships, no custom entity types |

### Decision: Firestore Vector Search
Won for three reasons:
1. **Strong consistency** — write an embedding, read it back immediately (no eventual consistency lag)
2. **Pay-per-use** — no always-on infrastructure cost, free tier covers ~40 sims/day
3. **Native vector search** — `find_nearest()` on embedding fields, no external vector DB needed

### Key Constraint: Embedding Dimensions
Gemini `gemini-embedding-001` defaults to 3072 dimensions. Firestore Vector Search maximum is 2048 dimensions. **MUST** set `output_dimensionality=768` in every embedding call. This was a non-obvious constraint that caused silent failures (Firestore accepted the write but `find_nearest()` returned empty results with oversized vectors).

### Migration Scope
- **5 files deprecated** (moved to `backend/_deprecated/`):
  - `graphiti_manager.py` — KuzuDB graph operations
  - `zep_entity_reader.py` — Zep entity summaries
  - `zep_graph_memory_updater.py` — Zep episode writes
  - `zep_tools.py` — Zep search tools for LLM
  - `zep_paging.py` — Zep pagination utility
- **11 files modified** — imports, config, API endpoints, service init
- **3 new files created**:
  - `firestore_memory.py` (950 lines) — unified memory layer
  - `embedding_client.py` — Gemini embedding wrapper
  - `memory_types.py` — shared dataclasses

### GCP Setup Required
```bash
gcloud auth application-default login
# Firestore must be in Native mode (not Datastore mode)
# 4 composite vector indexes required:
gcloud firestore indexes composite create --collection-group=episodes \
  --field-config field-path=project_id,order=ASCENDING \
  --field-config field-path=embedding,vector-config='{"dimension":"768","flat":{}}' \
  --database="(default)"
# Repeat for: dossier_chunks, entities, mc_aggregates
```

---

## 3. Complete File List

### Backend — New Files

| File | Lines | Description |
|------|-------|-------------|
| `backend/app/services/firestore_memory.py` | ~950 | Unified memory layer replacing Graphiti + Zep. Collections: episodes, dossier_chunks, entities, insights, mc_aggregates. Methods: store_episode, search_similar, store_dossier_chunk, get_project_context, store_entity, search_entities, get_containment_probability. |
| `backend/app/services/embedding_client.py` | ~120 | Gemini embedding wrapper. Model: gemini-embedding-001. Batch size: 250 texts per call. Output dimensionality: 768. Async and sync interfaces. Retry with exponential backoff. |
| `backend/app/services/memory_types.py` | ~80 | Shared dataclasses: SearchResult, InsightForgeResult, EpisodeData, DossierChunk, EntityRecord. Used across firestore_memory, simulation runner, and report agent. |
| `backend/app/services/monte_carlo_engine.py` | ~450 | Batch orchestration engine. Modes: test(3), quick(10), standard(50), deep(100+). In-process async worker pool with asyncio.Semaphore (not subprocesses). Cost estimation before launch, hard cost limits, per-iteration tracking. Stores aggregate results in Firestore. |
| `backend/app/services/monte_carlo_variations.py` | ~180 | 4 seeded variation axes: temperature jitter (0.7-1.3), persona perturbation (synonym injection into agent descriptions), inject timing shift (+-2 rounds), agent order shuffle (changes who acts first). Deterministic from seed for reproducibility. |
| `backend/app/services/monte_carlo_aggregator.py` | ~250 | Statistical analysis of batch results. Computes: outcome distribution (contained/escalated/catastrophic), containment round statistics (mean, median, stddev), decision divergence points (rounds where outcomes split), agent consistency scores (how often each agent takes similar actions across runs). |
| `backend/app/services/adversarial_agent.py` | ~300 | Threat actor LLM agent. Builds persona from scenario's threat_actor_profile. Reads defender channels (observable_worlds) but defenders cannot see C2. Generates realistic SIEM/EDR alerts when attacker succeeds. Adaptive triggers: detection -> pivot, isolation -> activate backup, escalation -> accelerate exfil. |
| `backend/app/services/counterfactual_engine.py` | ~358 | Decision point identification via LLM (3-5 critical moments per simulation). Fork from any checkpoint with modifications: agent_override, inject_event, remove_action. Branch comparison with divergence summary. |
| `backend/app/services/config_mutator.py` | ~200 | 11 mutation types for stress testing: bus-factor (remove each agent one at a time), pressure timing (compress/expand round durations), insider threat injection (flip one defender to attacker), communication channel removal (disable one channel per mutation), extreme time pressure (halve all response windows), reduced team size, degraded tooling, compliance-only mode, no-escalation constraint, delayed detection, simultaneous multi-vector attack. |
| `backend/app/services/graph_context.py` | ~404 | Graph query utility for LLM prompt injection. Queries Firestore entity/relationship store and formats context strings for: org_hierarchy (who reports to whom), system_dependencies (what depends on what), attacker_context (lateral movement paths, high-value targets), threat_landscape (known threats and mitigations). Singleton Firestore client to prevent connection exhaustion. |
| `backend/app/utils/console.py` | ~350 | Mission Control ANSI console logger (see dedicated section below). |
| `backend/app/utils/rate_limiter.py` | ~100 | Async rate limiter (token bucket) + sync wrapper. Used to throttle Gemini API calls to stay within quota (60 RPM for Flash Lite). Configurable burst allowance. |
| `backend/scripts/create_firestore_indexes.sh` | ~40 | Shell script to create all 4 required Firestore composite vector indexes via gcloud CLI. Idempotent (skips existing indexes). |

### Backend — New Test Files

| File | Description |
|------|-------------|
| `backend/tests/test_config_adversarial.py` | Tests adversarial agent injection into config expander output |
| `backend/tests/test_counterfactual_fields.py` | Tests field name consistency (agent vs agent_name) in counterfactual payloads |
| `backend/tests/test_counterfactual_resume.py` | Tests that forked simulations actually run (not just create config) |
| `backend/tests/test_data_flywheel.py` | Tests aggregate storage and retrieval from mc_aggregates collection |
| `backend/tests/test_sim_config_endpoint.py` | Tests GET /api/crucible/simulations/{simId}/config endpoint |

### Frontend — New Files

| File | Description |
|------|-------------|
| `frontend/app/types/monte-carlo.ts` | All Monte Carlo TypeScript interfaces: MCBatchStatus, MCIterationResult, MCAggregate, MCCostEstimate, MCMode, etc. |
| `frontend/app/actions/monte-carlo.ts` | 11 Next.js server actions: estimateCost, launchBatch, getBatchStatus, getBatchResults, getBatchCosts, stopBatch, getDecisionPoints, getCheckpoints, forkSimulation, getBranches, runStressTest |
| `frontend/app/hooks/useMonteCarloPolling.ts` | React hook with 2-second polling interval for batch status. Auto-stops when batch completes or errors. Returns { status, results, costs, isPolling }. |
| `frontend/app/components/monte-carlo/MonteCarloLauncher.tsx` | Mode selector (test/quick/standard/deep) with cost estimator. Shows estimated cost, iteration count, and time before launch. Confirmation dialog with cost warning for standard/deep modes. |
| `frontend/app/batch/[batchId]/page.tsx` | Batch dashboard page. Progress grid showing each iteration as a colored cell (pending/running/complete/error). Live cost counter. Iteration detail cards on click. |
| `frontend/app/components/monte-carlo/AggregateResults.tsx` | ~620 lines. Pure CSS/SVG visualization (no charting library). Outcome distribution as horizontal stacked bars. Containment round histogram. Decision divergence timeline. Agent consistency heatmap with color intensity mapping. |
| `frontend/app/components/monte-carlo/BranchExplorer.tsx` | Timeline visualization with fork buttons at each decision point. Shows original vs forked branch outcomes side by side. Divergence summary highlighting what changed and why. |

---

## 4. WDK Pipeline Changes

The Vercel WDK workflow (`frontend/app/workflows/crucible-pipeline.ts`) was modified from 7 steps to 10.

### Previous Pipeline (7 steps)
```
research → dossier_review → threat_analysis → scenario_selection
→ config_expansion → simulations → exercise_report
```

### New Pipeline (10 steps)
```
research → dossier_review → threat_analysis → scenario_selection
→ config_expansion (+ adversarial agent + adaptive depth injection)
→ simulations (parallel polling via Promise.all)
→ monte_carlo (10 iterations QUICK mode, auto)
→ counterfactual (identify decisions, auto-fork top 2)
→ exercise_report (enhanced with MC stats + counterfactual data)
→ complete
```

### Specific Changes

**Step 6 — Simulations**: Changed from sequential polling (await each sim one by one) to `Promise.all()` for parallel polling of all simulation statuses. This was a significant change because the old code had a `for` loop that awaited each simulation's completion before checking the next.

**Step 7 (NEW) — Monte Carlo QUICK**: Auto-runs after all simulations complete. Launches 10 iterations in QUICK mode using the first simulation's config as the base. Calls `POST /api/crucible/monte-carlo/launch` then polls with `GET /api/crucible/monte-carlo/{batchId}/status` via new `pollMonteCarlo()` function.

**Step 8 (NEW) — Counterfactual Analysis**: Calls `POST /api/crucible/simulations/{simId}/decision-points` to identify 3-5 critical decisions, then auto-forks the top 2 decision points (highest impact score) via `POST /api/crucible/simulations/{simId}/fork`.

**Step 9 — Exercise Report**: Enhanced to include Monte Carlo aggregate statistics and counterfactual comparison data in the report generation payload.

**Error Handling**: Both new steps (7 and 8) are wrapped in `try/catch` blocks. They are non-fatal — if Monte Carlo or counterfactual analysis fails, the pipeline continues to report generation. The error is logged but does not block the user from getting their exercise report.

**New Helper Function**: `pollMonteCarlo(batchId: string)` — polls batch status every 3 seconds, returns aggregate results when complete.

**PipelineStagesPanel**: Updated with new stage labels: "Monte Carlo Analysis" and "Counterfactual Branching" added between "Simulations" and "Exercise Report".

---

## 5. Config Expander Changes

`backend/app/services/config_expander.py` was modified with a new method `_inject_adversarial_and_adaptive()` that runs as the final step of config expansion, auto-injecting three features into every generated simulation config.

### Adversarial Agent Injection
- Reads `threat_actor_profile` field from the scenario (generated during threat analysis)
- Builds a threat actor persona using an LLM call (this is "LLM Call 10" in the pipeline)
- Persona prompt includes graph context: `attacker_context` from GraphContext (lateral movement paths, high-value targets, system criticality rankings)
- Adds a new agent to the config with `role: "threat_actor"`, `channel: "c2_channel"`, and `observable_worlds` set to the top 3 defender communication channels
- Generates 2-3 initial injects for the threat actor (e.g., "Initial access achieved via phishing payload on endpoint WS-0042")
- Inject generation prompt includes graph context: `system_dependencies` from GraphContext

### Adaptive Depth Injection
Adds to every config:
```json
{
  "adaptive_depth": {
    "enabled": true,
    "min_rounds": 3,
    "max_rounds": 30,
    "stagnation_threshold": 0.3,
    "arbiter_model": "gemini-2.0-flash-lite"
  }
}
```

### Adaptive Triggers
Keyword-based triggers injected into the threat actor's persona:
- If defenders use "isolate", "block", "quarantine" -> pivot to backup access vector
- If defenders use "detect", "identify", "alert" -> accelerate exfiltration timeline
- If defenders use "escalate", "notify", "report" -> activate distraction (DDoS, secondary incident)

### Graph Context Integration
Three injection points in config expander:
1. **Persona generation prompt** — `org_hierarchy` from GraphContext (who reports to whom, team structure) ensures generated agent personas reflect real organizational relationships
2. **Inject generation prompt** — `system_dependencies` from GraphContext (what systems depend on what) ensures injects target realistic attack surfaces
3. **Adversarial agent persona** — `attacker_context` from GraphContext (lateral movement paths, high-value targets) gives the threat actor knowledge of the organization's actual infrastructure

---

## 6. Simulation Runner Refactoring

`backend/scripts/run_crucible_simulation.py` underwent major refactoring to support Monte Carlo batching, adversarial agents, and adaptive depth.

### Structural Changes
- **Extracted `run_single_iteration()`** — new function with dependency injection for shared clients (Firestore, embedding client, rate limiter). This is the unit of work that Monte Carlo engine calls repeatedly.
- **`run_simulation()` became thin CLI wrapper** — only handles argument parsing, logging setup, and calling `run_single_iteration()` once.
- **Returns `IterationResult` dict** — standardized return type with fields: outcome, rounds_completed, containment_round, actions_log, cost, duration. This is what Monte Carlo aggregator consumes.

### Async Migration
- **`_call_llm` replaced with `_call_llm_async`** — uses `AsyncOpenAI` client (pointed at Gemini's OpenAI-compatible endpoint) instead of synchronous `OpenAI` client
- **Removed all `run_in_executor` wrappers** — these were bridging sync calls into async context; now everything is natively async
- **Parallel world execution** — `asyncio.gather(*[run_world(world) for world in worlds])` runs all communication channels concurrently instead of sequentially

### Adversarial Agent Integration
Each round now has two phases:
1. **Attacker phase** — threat actor agent acts first, reading defender channels but writing only to C2
2. **Defender phase** — all defender agents act, reading their assigned channels (cannot see C2)

The attacker phase runs before defenders so the attacker can react to the previous round's defender actions and set up the next round's situation.

### Adaptive Depth Loop
Replaced `for round_num in range(total_rounds)` with:
```python
round_num = 0
while round_num < config["adaptive_depth"]["max_rounds"]:
    # ... run round ...
    arbiter_decision = await evaluate_round(round_num, actions, config)
    if arbiter_decision == "HALT" and round_num >= config["adaptive_depth"]["min_rounds"]:
        break
    if arbiter_decision == "INJECT_COMPLICATION":
        inject_complication(round_num, config)
    round_num += 1
```

### Memory Operations
- **Batch memory prefetch at round start** — single `search_similar()` call retrieves relevant context for all agents in the round, avoiding N+1 query pattern
- **Batch episode writes at round end** — collects all agent actions from the round into a single batch write to Firestore
- **Checkpoint saving every round** — full simulation state (config, actions so far, agent states) saved to Firestore for counterfactual branching

### Graph Context Injection
Every agent's LLM prompt now includes graph context from GraphContext:
- Defender agents get `org_hierarchy` (their position in the org) and `system_dependencies` (what they're responsible for)
- Threat actor gets `attacker_context` (lateral movement paths, high-value targets)
- Arbiter gets full graph summary for informed CONTINUE/HALT/INJECT decisions

---

## 7. Mission Control Console

Created `backend/app/utils/console.py` with the `MissionControl` class — a structured ANSI-colored console logger designed to make the simulation pipeline's progress visible and debuggable.

### Design
All output goes to stderr (so stdout remains clean for JSON/API responses) plus a file logger that strips ANSI codes for persistent logs.

### Output Elements

**Startup Banner**: Box-drawing characters with ASCII art header, lists enabled features (Monte Carlo, Adversarial Agent, Adaptive Depth, Graph Context, etc.).

**Phase Headers**: Full-width separator lines with phase names:
```
═══════════════════ RESEARCH ═══════════════════
═══════════════════ SIMULATION ═══════════════════
═══════════════════ MONTE CARLO ═══════════════════
```

**Color Coding**:
- Teal — progress messages, phase transitions
- Orange — warnings, cost alerts
- Red — errors, failures
- Green — completions, success states
- White — standard info

**Research Step Tracking**: Named steps with duration:
```
[CRAWL] example.com .......................... 2.3s
[SEARCH] "NovaPay breach history" ........... 1.1s
[SYNTHESIS] Dossier compilation ............. 4.7s
[INDEX] Firestore embedding + storage ....... 0.8s
```

**Round Headers with Progress Bars**:
```
── Round 4/14 ▏████████░░░░░░░░▕ 29% ──
```

**Agent Action Logs**: Emoji-prefixed for quick scanning:
- `[DEFENDER]` — defender agent actions
- `[ATTACKER]` — threat actor actions (adversarial agent)
- `[INJECT]` — new inject delivered
- `[ARBITER]` — arbiter decisions (CONTINUE / HALT / INJECT_COMPLICATION)

**Round Cost Tracking**: Per-round and cumulative:
```
Cost: $0.0021 | Total: $0.0040
```

**Monte Carlo Iteration Progress**:
```
[MC 7/10] Iteration complete — contained @ round 8 ($0.68)
```

---

## 8. Knowledge Graph Evolution

The knowledge graph went through three distinct iterations before reaching its current form.

### Iteration 1: Hardcoded Parsing (Failed)
First attempt extracted entities by parsing episode action names with regex patterns. Looked for patterns like `"Agent X performed Y on system Z"` and split on keywords. Result: garbage. Action text is free-form LLM output with no consistent structure. Produced nonsensical nodes like `"performed"` and `"the"`.

### Iteration 2: User Pushback
Adesh pushed back: "Why aren't we using the LLM like Graphiti did?" Graphiti's entire value proposition was LLM-based entity extraction — it sent text to GPT-4 with a structured output schema and got clean entities back. Replacing it with regex was a regression.

### Iteration 3: Research Phase
Evaluated four approaches for LLM-powered entity extraction:

| Approach | Evaluation | Result |
|----------|-----------|--------|
| Cloud Natural Language API | No custom entity types, no relationships | Rejected |
| Gemini structured output | Enforced JSON schema, cheap with Flash Lite | **Selected** |
| Document AI | Designed for scanned documents, not text | Rejected |
| Knowledge Graph Search API | Read-only Google Knowledge Graph, no custom data | Rejected |

### Final Implementation: Gemini Structured Output
Uses `gemini-2.0-flash-lite` with `response_mime_type: "application/json"` and an enforced JSON schema.

**Entity types**: person, system, threat, compliance, organization, event

**Relationship types**: reports_to, manages, threatens, depends_on, mitigates, detected_by, affects, responsible_for

### Prompt Evolution
- **First version** produced 31 nodes / 21 edges (0.7 edge-to-node ratio) — too sparse, mostly isolated nodes
- **Enriched prompt** explicitly instructs: "For every entity, identify at least 2-3 relationships. Every person should have reports_to and manages edges. Every system should have depends_on edges."
- **Target**: 60-90 edges for 30 nodes (2-3 edges per node)
- Prompt includes examples of expected output density

### GraphContext Class
`backend/app/services/graph_context.py` (~404 lines) queries Firestore entities and relationships, then formats context strings for every LLM prompt in the pipeline:

| Context Type | Used By | Content |
|-------------|---------|---------|
| `org_hierarchy` | Config expander, defender agents | "Amy Hood (CFO) reports to Satya Nadella (CEO). Charlie Bell (CISO) reports to Satya Nadella..." |
| `system_dependencies` | Config expander (injects), defender agents | "Payment Gateway depends on Customer DB. Customer DB depends on Auth Service..." |
| `attacker_context` | Adversarial agent | "High-value targets: Customer DB (criticality: 9/10), Payment Gateway (8/10). Lateral path: Endpoint -> AD -> Customer DB" |
| `threat_landscape` | Report agent | "Known threats: ransomware (mitigated_by: EDR), insider (detected_by: DLP)..." |

---

## 9. Debugging Sessions

### Bug 1: Graphiti Migration Cascading Imports
**Symptom**: `ImportError: cannot import name 'GraphitiManager'` on startup after removing Graphiti.
**Root cause**: `backend/app/services/__init__.py` imported Zep-dependent modules at the top level. Even though the Graphiti/Zep files were deprecated, the `__init__.py` still tried to import them.
**Fix**: Added `try/except ImportError` guards around all deprecated imports in `__init__.py`. Modules that fail to import are set to `None` and checked at call sites.

### Bug 2: Graph Endpoint Empty
**Symptom**: `GET /api/graph/{projectId}` returned `{"nodes": [], "edges": []}` after Graphiti removal.
**Root cause**: The endpoint previously called `GraphitiManager.get_graph()` which queried KuzuDB. With Graphiti removed, there was no graph data source.
**Fix (attempt 1)**: Hardcoded parser that extracted entities from episode action text — produced garbage (see Knowledge Graph Iteration 1).
**Fix (final)**: LLM-based entity extraction using Gemini structured output. Entities extracted from dossier text and stored in Firestore. Graph endpoint queries Firestore.

### Bug 3: Node Attributes Missing
**Symptom**: Frontend graph visualization crashed with `Cannot read property 'summary' of undefined`.
**Root cause**: Frontend D3 code expected every node to have an `attributes` field with a `summary` sub-field. The new Firestore entity format had `description` at the top level but no `attributes` wrapper.
**Fix**: Added `attributes: { summary: entity.description }` to the graph endpoint response serialization.

### Bug 4: Edge Name-to-ID Resolution
**Symptom**: D3 force graph showed disconnected edges floating in space.
**Root cause**: Edges referenced entities by `name` (e.g., `source: "Charlie Bell"`), but D3 requires edges to reference nodes by `id` (Firestore document IDs). Nodes had IDs like `ent_a3f2b1`, but edges said `source: "Charlie Bell"`.
**Fix**: Built `name_to_id` lookup dict from nodes list. Edge serialization resolves `source` and `target` from entity names to document IDs. Edges with unresolved names are dropped with a warning.

### Bug 5: Simulation "Not Found"
**Symptom**: `GET /api/crucible/simulations/{simId}` returned 404 for simulations that had completed successfully.
**Root cause**: Flask debug reloader restarts the process, which clears in-memory simulation registry. Simulations existed on disk (JSON files) but the in-memory dict was empty after reload.
**Fix**: On 404, check disk for simulation JSON files and rehydrate into memory. Added startup scan that loads all existing simulation states from disk.

### Bug 6: GraphContext Creating New Firestore Client Per Agent
**Symptom**: Simulation slowed dramatically after round 5, eventually hitting `google.api_core.exceptions.ResourceExhausted`.
**Root cause**: Every call to `GraphContext.get_org_hierarchy()` instantiated a new `firestore.Client()`. With 12 agents per round and 4 worlds, that's 48 new Firestore clients per round. By round 5, there were 240 active gRPC connections.
**Fix**: Made GraphContext use a singleton Firestore client. Single client instance shared across all calls within a simulation.

### Bug 7: Firestore AsyncClient Deadlock
**Symptom**: Simulation hung indefinitely after ~15 rounds with no error message. CPU at 0%.
**Root cause**: Firestore's `AsyncClient` creates gRPC async channels that bind to the event loop they're created in. Monte Carlo engine spawns new event loops via `asyncio.run()` in threads. When iteration N's event loop tries to use a channel created in iteration N-1's loop, the channel deadlocks.
**Fix**: Replaced `AsyncClient` with sync `Client` + `ThreadPoolExecutor` (16 workers). All Firestore operations are sync calls dispatched to the thread pool via `loop.run_in_executor()`. Confirmed this is the recommended pattern by Google Cloud maintainers.

### Bug 8: Round Count Display
**Symptom**: Frontend showed "Round 14/14" but simulation kept running to round 22.
**Root cause**: Frontend read `total_rounds` from the config (set to 14) and used it as the denominator. But adaptive depth can extend simulations up to `max_rounds` (30). The config's `total_rounds` is now a suggestion, not a hard limit.
**Fix**: Backend now reports `rounds_completed` and `max_rounds` (from adaptive_depth config) instead of `total_rounds`. Frontend uses `max_rounds` as the denominator and shows "(adaptive)" label.

---

## 10. API Endpoints Added

### Monte Carlo (6 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/crucible/monte-carlo/estimate` | Cost estimation before launch. Takes mode + config, returns estimated cost, time, iteration count. |
| POST | `/api/crucible/monte-carlo/launch` | Start a batch. Takes mode + config + cost_limit. Returns batchId. |
| GET | `/api/crucible/monte-carlo/{batchId}/status` | Batch progress. Returns: iterations_complete, iterations_total, current_cost, status (running/complete/error/stopped). |
| GET | `/api/crucible/monte-carlo/{batchId}/results` | Aggregate results. Returns: outcome_distribution, containment_stats, divergence_points, agent_consistency. |
| GET | `/api/crucible/monte-carlo/{batchId}/costs` | Detailed cost breakdown. Per-iteration costs, total, estimate vs actual delta. |
| POST | `/api/crucible/monte-carlo/{batchId}/stop` | Graceful stop. Completes current iteration, then stops. Returns partial results. |

### Counterfactual (4 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/crucible/simulations/{simId}/decision-points` | LLM identifies 3-5 critical decision moments. Returns: round, agent, action, impact_score, alternative. |
| GET | `/api/crucible/simulations/{simId}/checkpoints` | List saved checkpoints (one per round). Returns: round_num, timestamp, agent_count, action_count. |
| POST | `/api/crucible/simulations/{simId}/fork` | Fork from checkpoint with modifications. Takes: checkpoint_round, modifications (agent_override, inject_event, remove_action). Launches new simulation from that point. |
| GET | `/api/crucible/simulations/{simId}/branches` | List all branches (original + forks). Returns: branch_id, fork_point, outcome, divergence_summary. |

### Other (2 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/crucible/simulations/{simId}/config` | Returns the full expanded config for a simulation (including injected adversarial agent and adaptive depth). |
| POST | `/api/crucible/projects/{projectId}/stress-test` | Launches stress test matrix. Applies all 11 mutations, runs each through Monte Carlo. Returns matrix of resilience scores. |

---

## 11. Observed Simulation Quality

### Microsoft Run (proj_b68ec7a1)
The most complete end-to-end test run, simulating a ransomware attack on Microsoft.

**Metrics**:
- Simulation 0 completed in 10 rounds, ~4 minutes wall clock, $0.72 total cost
- Arbiter HALTED with reason: "Force Majeure hard-shutdown, market confidence collapse absolute"
- Cost per round: ~$0.02 (Gemini Flash Lite)

**Agents Generated** (from config expander based on dossier):
- Satya Nadella (CEO), Charlie Bell (CISO), Igor Tsyganskiy (CTO), Brad Smith (Vice Chair/President), Kevin Scott (CTO AI), Amy Hood (CFO), Elena Rodriguez (VP Incident Response), Marcus Thorne (SOC Lead), and others

**Realistic Communications Observed**:
- Legal: "GRC override is a regulatory liability nightmare" (Brad Smith)
- Legal/compliance: "I am contemporaneously drafting regulatory disclosure" (legal agent)
- Physical security: data center evacuation ordered when lateral movement reached infrastructure management systems
- Executive: emergency board notification chain triggered by Amy Hood
- Cross-functional: tension between "contain now" (security) vs "preserve evidence" (legal) vs "maintain operations" (business)

**Adversarial Agent**:
- Persona: "The Silent Pipeline Poisoning Operator"
- Operated in C2 channel, invisible to defenders
- Successfully achieved lateral movement in early rounds before detection
- Adapted strategy when defenders began isolation procedures

---

## 12. Jensen's 5 Critical Fixes (Post-Review)

After Jensen reviewed the full implementation, he identified 5 gaps that needed immediate fixes before the system was coherent end-to-end.

### Fix 1: Wire the Pipeline
**Problem**: WDK workflow (`crucible-pipeline.ts`) still had the old 7-step flow. Monte Carlo and counterfactual were built as backend features but the frontend pipeline didn't call them.
**Fix**: Added steps 7 (Monte Carlo) and 8 (counterfactual) to the pipeline, with `pollMonteCarlo()` helper and try/catch wrappers.

### Fix 2: Counterfactual Resume
**Problem**: `POST /api/crucible/simulations/{simId}/fork` created a new config with modifications but never actually ran the forked simulation. The fork just sat there as an unexecuted config.
**Fix**: Fork endpoint now calls `run_single_iteration()` after creating the modified config. The forked simulation runs to completion and its results are stored alongside the original for comparison.

### Fix 3: Config Expander LLM Call 10
**Problem**: Adversarial agent existed as a concept but wasn't being auto-injected by the config expander. Users had to manually add threat actor config, which they never would.
**Fix**: Added `_inject_adversarial_and_adaptive()` as the final step of config expansion. Every config now automatically includes a threat actor and adaptive depth settings.

### Fix 4: Field Name Mismatches
**Problem**: Counterfactual engine used `agent_name` in decision point payloads, but the simulation runner and frontend expected `agent`. Same action was referenced as `action_taken` in one place and `action` in another.
**Fix**: Standardized all field names: `agent` (not `agent_name`), `action` (not `action_taken`), `round` (not `round_num` in API responses).

### Fix 5: Data Flywheel
**Problem**: Simulations produced rich data but none of it persisted beyond the immediate run. No learning, no accumulation, no historical context.
**Fix**: At minimum, store Monte Carlo aggregate outcomes in Firestore `mc_aggregates` collection. Added `get_containment_probability(project_id)` method that calculates historical containment rate across all runs for a project. This is the seed of the flywheel — future work will feed these aggregates back into scenario probability weighting and agent prompt refinement.

---

## 13. Performance Architecture

### The Problem
48 agent calls per round (12 agents x 4 worlds), each blocking 3-5 seconds = ~5 minutes per round sequential.

### The Solution

| Technique | Impact |
|-----------|--------|
| AsyncOpenAI (replace sync OpenAI) | Non-blocking LLM calls |
| Parallel world execution (asyncio.gather) | 4 worlds concurrent = 4x speedup |
| Batch embedding (250/call) | 1 API call instead of 48 |
| ThreadPoolExecutor for Firestore (16 workers) | 16 parallel queries, no gRPC deadlocks |
| Singleton Firestore clients | Prevent connection exhaustion (Bug 6 fix) |
| Graph endpoint TTL cache (30s) | Eliminate polling overhead on graph queries |

**Result: ~5 min/round -> ~20-25s/round (12x speedup)**

### Key Learning: Don't Use Firestore AsyncClient
Firestore's `AsyncClient` gRPC channels deadlock after ~15 rounds when mixed with asyncio event loops. Root cause: gRPC async channels bind to a single event loop; Monte Carlo engine spawns new loops via `asyncio.run()` in threads. The correct pattern is sync `Client` + `ThreadPoolExecutor` (confirmed by Google Cloud maintainers). See Bug 7 in Debugging Sessions.

---

## 14. Google API Research Findings

| API | Verdict | Details |
|-----|---------|---------|
| Gemini Batch API | NOT for sim loop | 24-hour SLO. Useful only for offline batch report generation, not real-time simulation. |
| Gemini Context Caching | Future optimization | 90% token discount on cached prefixes. Requires Gemini 2.5+ models. Would significantly reduce cost for Monte Carlo (same system prompt across iterations). |
| Firestore AsyncClient | DO NOT USE | Deadlocks after ~15 rounds. Use sync Client + ThreadPoolExecutor. See Bug 7. |
| Firestore batch find_nearest | Does NOT exist | Vector search has no batch API. Must parallelize manually with ThreadPoolExecutor. |
| Gemini structured output | USE for entity extraction | Works reliably with `gemini-2.0-flash-lite`. Enforced JSON schema via `response_mime_type`. |
| Cloud Natural Language API | Poor fit | No custom entity types, no relationship extraction. Only pre-defined categories (PERSON, LOCATION, etc.). |
| Vertex AI RAG Engine | Overkill | Managed RAG pipeline with always-on cost. More than needed for entity storage and retrieval. |
| AlloyDB | Too expensive | Managed PostgreSQL + pgvector. Always-on instance ~$200/mo minimum. |
| Memory Bank (Gemini) | Too ephemeral | Session-scoped memory, no cross-session persistence. |
| Document AI | Wrong use case | Designed for OCR and form parsing, not free-text entity extraction. |
| Knowledge Graph Search API | Read-only | Queries Google's Knowledge Graph. Cannot store custom entities. |

---

## 15. Cost Model

| Item | Cost |
|------|------|
| LLM (Gemini 2.0 Flash Lite) | $0.25/1M input tokens, $1.50/1M output tokens |
| Embeddings (gemini-embedding-001) | $0.15/1M tokens |
| Firestore reads | $0.03/100K reads |
| Firestore writes | $0.09/100K writes |
| Per simulation (10 rounds, adaptive) | ~$0.70 |
| Monte Carlo QUICK (10 iterations) | ~$7 |
| Monte Carlo STANDARD (50 iterations) | ~$35 |
| Monte Carlo DEEP (100 iterations) | ~$70 |
| Graph extraction per dossier | ~$0.001 |
| Counterfactual fork (1 branch) | ~$0.35 (half a sim, starts from checkpoint) |

Cost tracking at every level: per-LLM-call, per-round, per-iteration, per-batch, with estimation before launch and hard limits that trigger graceful stop.

---

## 16. Jensen's Review Scores (Post-Implementation)

| Feature | Score | Notes |
|---------|-------|-------|
| Monte Carlo | 4/5 | Engine solid, pipeline defaults to QUICK (10). Needs standard/deep to be production-ready. |
| Adversarial Agent | 4.5/5 | Best-implemented piece — asymmetric information model done right. |
| Adaptive Depth | 5/5 | Full marks — arbiter works perfectly, stagnation detection catches dead simulations. |
| Counterfactual | 3.5/5 | Fork must actually run (was broken, now fixed). |
| Stress Testing | 4/5 | Mutator ready, API wired, 11 mutation types. |
| Data Flywheel | 1.5/5 | Basic aggregate storage only, no learning loop yet. |
| Cost Tracking | 4.5/5 | Excellent coverage at every level. |

**Overall CISO purchase confidence: 65%** — needs data flywheel and polished demo to reach 90%.

---

## 17. Implementation Stats

- **New backend files**: 15+
- **New frontend files**: 7
- **New test files**: 5
- **Modified files**: 20+
- **Deprecated files**: 5 (Graphiti/Zep -> `backend/_deprecated/`)
- **New API endpoints**: 12 (40 total Crucible endpoints)
- **Lines of code added**: ~10,000
- **Tests**: 45 passing

---

## 18. Open Items / Future Work

1. **Data flywheel learning loop** — aggregate outcomes should feed back into scenario probability weighting and agent prompt refinement
2. **Gemini Context Caching** — 90% token discount on repeated system prompts, requires model upgrade to 2.5+
3. **Richer graph extraction** — target 2-3 edges per node (currently ~1.0 ratio), extract entities from simulation actions (not just dossier)
4. **Frontend polish** — Monte Carlo results page needs real-world testing, branch explorer UX refinement
5. **Graph as real-time sim backbone** — extract entities from simulation round actions in real-time, building graph as simulation progresses
6. **uvloop** — drop-in replacement for asyncio event loop, ~10% free performance boost
7. **Fine-tuned models** — Jensen's recommendation #2: bring inference local with models trained on simulation data
8. **Cross-customer intelligence** — anonymized graph sharing for network effect (Jensen's recommendation #4)
9. **GPU-scale Monte Carlo** — move from API-based LLM calls to local inference for 1000+ iteration runs (Jensen's recommendation #5)
