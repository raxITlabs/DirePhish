# Jensen Vision — DirePhish Architecture Session (2026-03-24)

> This document captures the architectural decisions made during a session where Jensen Huang (NVIDIA CEO, roleplayed) evaluated the DirePhish threat simulation platform and directed its transformation from a demo into an enterprise-grade probabilistic threat intelligence engine.

## 1. Initial Assessment

Jensen evaluated DirePhish and identified critical gaps:

- **"A thin orchestration layer over somebody else's LLM"** — every part replaceable in an afternoon
- **No real inference infrastructure** — synchronous API calls to Google, no batching
- **Simulation is toy-scale** — 3 rounds, fixed timer, single narrative output
- **No proprietary data flywheel** — every simulation learns nothing from the last
- **File-based JSON storage** — no database, no persistence, no scale

### Jensen's 5 Recommendations

1. **Pick ONE thing and make it world-class** — threat scenario generation from dossier is interesting, make it a *model* not a prompt
2. **Bring inference local** — run own fine-tuned models, change unit economics
3. **Build the data flywheel** — every simulation is training data, every report is a label, every user edit is RLHF
4. **Knowledge graph is the moat** — persistent across customers, anonymized, network effect
5. **Monte Carlo at scale** — thousands of attack paths simultaneously, probabilistic outcomes

## 2. What Was Built

### Phase 0: Firestore Vector Search
Replaced Graphiti/KuzuDB + Zep with Google Cloud Firestore Vector Search:
- Eliminated ~500MB local memory per simulation process
- Unified memory layer for agent memory, dossier retrieval, and report generation
- Gemini embeddings at 768 dimensions with output_dimensionality constraint
- Strong consistency (instant write→read), pay-per-use pricing
- Cost: ~$0.005/sim, free tier covers ~40 sims/day

### Phase 1: Monte Carlo Engine
- Graduated test mode: test(3) → quick(10) → standard(50) → deep(100+)
- In-process async worker pool with asyncio.Semaphore (not subprocesses)
- 4 seeded variation axes: temperature jitter, persona perturbation, inject timing shift, agent order shuffle
- Statistical aggregation: outcome distribution, containment round stats, decision divergence points, agent consistency scores
- Cost estimation before launch, hard cost limits, per-iteration tracking
- Test-mode gating: must complete test before unlocking standard/deep

### Phase 2: Adversarial Agent
- Live threat actor LLM that plays against defenders with asymmetric information
- Attacker reads defender channels (observable_worlds), defenders can't see C2
- Adaptive triggers: if detected → pivot strategy, if isolated → activate backup
- Dynamic inject generation: attacker success → realistic SIEM/EDR alerts for defenders
- Auto-injected by config expander (LLM Call 10) from threat analysis profile
- Attacker phase runs BEFORE defender phase each round

### Phase 3: Adaptive Depth
- Arbiter LLM evaluates each round: contained? stagnant? catastrophic?
- Replaces fixed `for round in range(total_rounds)` with adaptive `while` loop
- Guardrails: min_rounds=3, max_rounds=30
- Stagnation detection via action entropy scoring
- Can inject complications when simulation stagnates
- Checkpoint saving every round for counterfactual branching

### Phase 4: Counterfactual Branching
- LLM identifies 3-5 critical decision points in completed simulations
- Fork from any checkpoint with modifications (agent_override, inject_event, remove_action)
- Launch forked simulations and compare outcomes
- "What if the CISO had isolated the DB instead of monitoring?"
- Branch comparison with divergence summary

### Phase 5: Stress Testing Matrix
- 11 automatic config mutations: bus-factor (remove each agent), pressure timing variations, insider threat injection, communication channel removal, extreme time pressure
- Resilience scoring: detection speed, containment speed, communication quality, compliance adherence, robustness index
- Feeds into Monte Carlo engine for statistical significance

### Phase 6: Frontend
- Monte Carlo launcher: mode selector, cost estimator, confirmation dialog
- Batch dashboard: progress grid, live cost counter, iteration status cards
- Aggregate results: outcome distribution charts, divergence timeline, agent consistency heatmap (pure CSS/SVG)
- Branch explorer: timeline with fork buttons, branch comparison view

## 3. Knowledge Graph as Intelligence Backbone

### LLM-Powered Entity Extraction
- Gemini structured output with enforced JSON schema
- Entity types: person, system, threat, compliance, organization, event
- Relationship types: reports_to, manages, threatens, depends_on, mitigates, detected_by, affects, responsible_for

### Feeds Every Pipeline Step
| Component | What Graph Provides |
|-----------|-------------------|
| Config Expander | Org hierarchy for realistic agent personas |
| Adversarial Agent | System criticality and lateral movement paths |
| Simulation Runner | Agent org context (reports_to, manages, collaborators) |
| Report Agent | Organizational gap analysis, system ownership |
| Stress Testing | Orphan analysis when removing agents (bus-factor) |
| Monte Carlo | System criticality weighting for outcome classification |

## 4. Performance Architecture

### The Problem
48 agent calls per round, each blocking 3-5 seconds = ~5 min/round sequential.

### The Solution
| Technique | Impact |
|-----------|--------|
| AsyncOpenAI (replace sync OpenAI) | Non-blocking LLM calls |
| Parallel world execution (asyncio.gather) | 4 worlds concurrent = 4x |
| Batch embedding (250/call) | 1 API call instead of 48 |
| ThreadPoolExecutor for Firestore (16 workers) | 16 parallel queries, no gRPC deadlocks |
| Singleton Firestore clients | Prevent connection exhaustion |
| Graph endpoint TTL cache (30s) | Eliminate polling overhead |

**Result: ~5 min/round → ~20-25s/round (12x speedup)**

### Key Learning: Don't Use Firestore AsyncClient
Firestore's AsyncClient gRPC channels deadlock after ~15 rounds when mixed with asyncio event loops. Root cause: gRPC async channels bind to a single event loop; Monte Carlo engine spawns new loops via asyncio.run() in threads. The correct pattern is sync Client + ThreadPoolExecutor (confirmed by Google maintainers).

## 5. Pipeline Flow (10 Steps)

```
research → dossier_review → threat_analysis → scenario_selection
→ config_expansion (+ adversarial agent + adaptive depth injection)
→ simulations (parallel polling via Promise.all)
→ monte_carlo (10 iterations QUICK mode, auto)
→ counterfactual (identify decisions, auto-fork top 2)
→ exercise_report (enhanced with MC stats + counterfactual data)
→ complete
```

## 6. Data Flywheel

- Every Monte Carlo batch stores aggregate outcomes in Firestore `mc_aggregates` collection
- `get_containment_probability(project_id)` calculates historical rate across all runs
- Future: weight scenario probabilities based on historical outcomes
- Future: refine agent prompt templates based on consistency scores
- Future: shared threat intelligence graph across customers (anonymized)

## 7. Cost Model

| Item | Cost |
|------|------|
| LLM (Gemini 3.1 Flash Lite) | $0.25/1M input, $1.50/1M output |
| Embeddings (gemini-embedding-001) | $0.15/1M tokens |
| Firestore reads | $0.03/100K |
| Firestore writes | $0.09/100K |
| Per simulation (10 rounds) | ~$0.70 |
| Monte Carlo 10 iterations | ~$7 |
| Graph extraction per dossier | ~$0.001 |

Cost tracking at every level: per-call, per-iteration, per-batch, with estimation before launch and hard limits.

## 8. Google API Research Findings

| API | Verdict |
|-----|---------|
| Gemini Batch API | 24h SLO — NOT for sim loop, offline reports only |
| Gemini Context Caching | 90% token discount, requires 2.5+ models |
| Firestore AsyncClient | DEADLOCKS after ~15 rounds — use sync + ThreadPoolExecutor |
| Firestore batch find_nearest | Does NOT exist — must parallelize manually |
| Gemini structured output | Works with 3.1-flash-lite for entity extraction |
| Cloud NL API | No relationships, no custom types — poor fit |
| Vertex AI RAG Engine | Overkill for this use case |

## 9. Jensen's Review Scores (Post-Implementation)

| Feature | Score | Notes |
|---------|-------|-------|
| Monte Carlo | 4/5 | Engine solid, pipeline defaults to QUICK (10) |
| Adversarial Agent | 4.5/5 | Best-implemented piece — asymmetric info done right |
| Adaptive Depth | 5/5 | Full marks — arbiter works perfectly |
| Counterfactual | 3.5/5 | Fork must actually run (fixed) |
| Stress Testing | 4/5 | Mutator ready, API wired |
| Data Flywheel | 1.5/5 | Basic storage only, no learning loop yet |
| Cost Tracking | 4.5/5 | Excellent coverage |

**Overall CISO purchase confidence: 65%** — needs data flywheel and polished demo to reach 90%.

## 10. Implementation Stats

- **New backend files**: 15+
- **New frontend files**: 7
- **Modified files**: 20+
- **Deprecated files**: 5 (Graphiti/Zep → _deprecated/)
- **New API endpoints**: 12 (40 total Crucible endpoints)
- **Lines of code added**: ~10,000
- **Tests**: 45 passing

## 11. Open Items / Future Work

1. **Data flywheel learning loop** — aggregate outcomes should feed back into scenario probability weighting
2. **Gemini Context Caching** — 90% token discount, requires model upgrade to 2.5+
3. **Richer graph extraction** — target 2-3 edges per node (currently ~1.0)
4. **Frontend polish** — Monte Carlo results page, branch explorer, stress test UI
5. **Graph as real-time sim backbone** — extract entities from simulation actions (not just dossier)
6. **uvloop** — free ~10% async performance boost
