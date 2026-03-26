# DirePhish — Data Flow Diagram

> How data moves between Frontend, Backend, and Firestore across each pipeline stage.

---

## Simulation Stage (working)

```
FRONTEND (Next.js)                    BACKEND (Flask)                     FIRESTORE
─────────────────                    ───────────────                     ─────────

┌─────────────────┐                 ┌──────────────────┐
│ pollSimStatus()  │───GET /status──►│ crucible_manager  │
│ every 3s         │◄──{round,acts}──│ _simulations[id]  │
│                  │                 │                   │
│ pollActions()    │───GET /actions─►│ reads actions.jsonl│
│ every 3s         │◄──[actions]─────│ (from disk — fast)│
│                  │                 │                   │
│ pollGraph()      │───GET /graph──►│ reads Firestore───│──►graph_nodes
│ when version↑    │◄──{nodes,edges}│                   │   graph_edges
│                  │                 │                   │
│ RIGHT PANEL:     │                 │  sim runner:      │
│ shows actions ✓  │                 │  agent acts ──────│──►sim_episodes
│ GRAPH: highlights│                 │  every 3 rounds───│──►graph_nodes
│ active agents ✓  │                 │  (incremental)    │   graph_edges
└─────────────────┘                 └──────────────────┘

Display path:  agent acts → disk (actions.jsonl) → API reads disk → frontend polls
Persist path:  agent acts → async Queue → Firestore (parallel, non-blocking)
Graph path:    every 3 rounds → Gemini extraction → Firestore graph_nodes/edges
```

---

## Stress Testing Stage (working)

```
FRONTEND                             BACKEND                              FIRESTORE
────────                             ───────                              ─────────

┌─────────────────┐                 ┌──────────────────┐
│ WDK workflow     │                 │  Stress test      │
│ polls progress   │◄──progress JSON─│  engine launches   │
│ via pipeline     │                 │  iterations        │
│ stream           │                 │                   │
│                  │                 │  BEFORE iteration: │
│ MC panel gets    │                 │  register sim with │
│ currentSimId     │                 │  _simulations ✓   │
│ from progress    │                 │                   │
│ detail JSON      │                 │  iteration runs   │
│       │          │                 │  agents act       │
│       ▼          │                 │  actions.jsonl ✓  │──►sim_episodes
│ useSimPolling    │───GET /actions─►│  readable via API │
│ (iterationSimId) │◄──[actions]─────│                   │
│                  │                 │                   │
│ RIGHT PANEL:     │                 │                   │──►mc_aggregates
│ live action feed │                 │                   │   (outcomes)
│                  │                 │                   │
│ GRAPH: highlights│                 │                   │──►graph_nodes
│ active agents ✓  │                 │                   │   (incremental)
└─────────────────┘                 └──────────────────┘

Flow: iteration sims registered in _simulations dict
      → frontend polls actions via existing useSimPolling hook
      → progress detail JSON carries currentSimId for live feed
```

---

## What-If Analysis Stage (working)

```
FRONTEND                             BACKEND                              FIRESTORE
────────                             ───────                              ─────────

┌─────────────────┐                 ┌──────────────────┐
│ WDK workflow     │───POST /fork──►│ What-if engine    │
│                  │◄──{sim_id}──────│ forks at decision │
│                  │                 │ point             │
│ CF panel gets    │                 │                   │
│ forkSimId from   │                 │  branch sim IS in │
│ progress detail  │                 │  _simulations ✓   │
│       │          │                 │                   │
│       ▼          │                 │  branch sim runs  │
│ useSimPolling    │───GET /actions─►│  agents act       │──►sim_episodes
│ (branchSimId)    │◄──[actions]─────│  actions.jsonl ✓  │
│                  │                 │  readable via API │
│                  │                 │                   │
│ pollSimulation() │───GET /status─►│  status trackable │
│ for branch       │◄──{status}──────│  via manager ✓    │
│                  │                 │                   │
│ RIGHT PANEL:     │                 │                   │
│ live action feed │                 │                   │
│ + branch context │                 │                   │
│                  │                 │                   │
│ GRAPH: highlights│                 │                   │──►graph_nodes
│ active agents ✓  │                 │                   │   (incremental)
└─────────────────┘                 └──────────────────┘

Flow: branch sim registered in _simulations dict
      → frontend gets forkSimId from progress detail JSON
      → polls branch actions via existing useSimPolling hook
```

---

## Data Path Summary

```
                    FAST PATH (display)              PERSIST PATH (storage)
                    ──────────────────              ───────────────────────

Agent acts ──┬──► actions.jsonl (disk)              Firestore sim_episodes
             │         │                                    │
             │    API reads disk                    vector-embedded
             │         │                            searchable
             │    frontend polls                            │
             │         │                            graph extraction
             │    RIGHT PANEL                       every 3 rounds
             │    shows actions                             │
             │                                      graph_nodes
             └──► async Queue ──────────────►       graph_edges
                  (non-blocking)                    (knowledge graph)

Display reads from DISK (fast, ~0 latency)
Persistence writes to FIRESTORE (async, non-blocking)
Graph reads from FIRESTORE (polled by frontend)
```

---

## Stage-by-Stage Data Stores

```
Stage              Disk                          Firestore
─────              ────                          ─────────
Research           dossier.json                  sim_episodes (28 chunks)
                   research_log.json             graph_nodes (~28)
                                                 graph_edges (~30)

Threat Analysis    scenarios.json                —

Config Expansion   config.json                   —

Simulation         actions.jsonl                 sim_episodes (batch/round)
                   checkpoints/round_N.json      graph_nodes (incremental +)
                   summary.json                  graph_edges (incremental +)

Stress Testing     mc_dir/iter_NNNN/             sim_episodes (per iteration)
                     actions.jsonl               mc_aggregates (outcomes)
                     summary.json
                   test_results.json

What-If Analysis   branch_dir/                   sim_episodes (per branch)
                     actions.jsonl
                     config.json

Exercise Report    exercise_dir/                 —
                     report.json
```
