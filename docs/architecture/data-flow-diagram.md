# DirePhish — Data Flow Diagram

> How data moves between Frontend, Backend, and Firestore across each pipeline stage.

---

## Research Stage

```
FRONTEND (Next.js)                    BACKEND (Flask)                     FIRESTORE
─────────────────                    ───────────────                     ─────────

┌─────────────────┐                 ┌──────────────────┐
│ POST /projects   │───{url,files}─►│ create_project()  │
│ (HomeClient)     │◄──{projectId}──│ proj_xxxx/        │
│                  │                 │                   │
│ useResearchPoll  │───GET /status─►│ research_agent.py │
│ every 2.5s       │◄──{progress}───│ (background thread│
│                  │                 │  5-min watchdog)  │
│                  │                 │                   │
│                  │                 │  1. _scrape_website│──Cloudflare /crawl
│                  │                 │  2. _web_search    │──Gemini grounded
│                  │                 │  3. _process_docs  │──PDF/TXT parsing
│                  │                 │  4. _synthesize    │──LLM call
│                  │                 │     → dossier.json │
│                  │                 │                   │
│ GET /dossier     │───────────────►│ reads dossier.json│
│ DossierEditor    │◄──{dossier}────│                   │
│                  │                 │  push_dossier()───│──►sim_episodes
│ GET /graph       │───────────────►│ reads Firestore───│──►graph_nodes
│ D3 force graph   │◄──{nodes,edges}│                   │   graph_edges
└─────────────────┘                 └──────────────────┘

Flow: POST creates project → background thread runs 4-step research pipeline
      → frontend polls status until research_complete → fetches dossier + graph
```

---

## Threat Analysis Stage

```
FRONTEND                             BACKEND                              FIRESTORE
────────                             ───────                              ─────────

┌─────────────────┐                 ┌──────────────────┐
│ Auto-triggered   │                 │ threat_analyzer.py│
│ after research   │                 │ (background thread│
│ completes        │                 │  4 sequential LLM │
│                  │                 │  calls):          │
│ useResearchPoll  │───GET /status─►│                   │
│ watches for      │◄──{status}─────│  1. analyze_threat│
│ scenarios_ready  │                 │     _landscape    │
│                  │                 │  2. map_vulns     │
│ GET /scenarios   │───────────────►│  3. generate      │
│ ScenarioCards    │◄──{scenarios}───│     _attack_paths │
│                  │                 │  4. frame         │
│                  │                 │     _scenarios    │
│                  │                 │                   │
│                  │                 │  → threat_analysis│
│                  │                 │    .json (disk)   │
└─────────────────┘                 └──────────────────┘

Flow: auto-starts after research_complete → 4 LLM calls → threat_analysis.json
      → status becomes scenarios_ready → frontend fetches scenarios for selection
```

---

## Config Expansion Stage

```
FRONTEND                             BACKEND                              FIRESTORE
────────                             ───────                              ─────────

┌─────────────────┐                 ┌──────────────────┐
│ POST /generate-  │───{scenarioIds}►│ config_expander.py│
│ configs          │                 │ (background thread│
│ (LaunchBar)      │                 │  per scenario):   │
│                  │                 │                   │
│ polls /status    │───GET /status─►│  5 LLM calls:     │
│ watches for      │◄──{status}─────│  1. agent_profiles│
│ configs_ready    │                 │  2. worlds        │
│                  │                 │  3. events        │
│ GET /configs     │───────────────►│  4. adaptive_depth│
│ multi-tab view   │◄──{configs}────│  5. time_config   │
│ AgentCards       │                 │                   │
│ WorldList        │                 │  Mode caps applied│
│ EventTimeline    │                 │  (test: 7ag/3w/10r│
│                  │                 │   std: LLM decides│
│                  │                 │                   │
│                  │                 │  → scenarios/     │
│                  │                 │    <id>.json (disk│
└─────────────────┘                 └──────────────────┘

Flow: user selects scenarios → POST triggers expansion → 5 LLM calls per scenario
      → configs saved to scenarios/ dir → frontend fetches for review before launch
```

---

## Simulation Stage



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

## Exercise Report Stage

```
FRONTEND                             BACKEND                              FIRESTORE
────────                             ───────                              ─────────

┌─────────────────┐                 ┌──────────────────┐
│ POST /report     │───{simId}─────►│ report_agent.py   │
│ (auto or manual) │                 │ (background thread│
│                  │                 │  ReACT pattern):  │
│ polls report     │───GET /report─►│                   │
│ status           │◄──{status}─────│  1. Plan outline  │
│                  │                 │  2. Per-section:  │
│                  │                 │     ReACT loop    │
│ /report/exercise │                 │     (max 5 rounds)│
│ /[projectId]     │                 │     ├─ LLM thinks│
│                  │                 │     ├─ calls tools│──►search()
│ 5 tab views:     │                 │     │  (vector   │   insight_forge()
│ ├─ Board         │                 │     │   search)  │   panorama_search()
│ ├─ CISO          │                 │     └─ synthesize│   interview_agents()
│ ├─ Security Team │                 │                   │
│ ├─ Playbook      │                 │  → report.json   │
│ └─ Risk Score    │                 │    (disk)         │──►risk_scores
│                  │                 │                   │
│ RiskScoreView    │───POST /compute►│ risk_score_engine │
│ (on-demand)      │◄──{score}──────│ FAIR methodology  │──►risk_scores
└─────────────────┘                 └──────────────────┘

Flow: report agent uses ReACT loop with Firestore vector search tools
      → generates sections iteratively → saves report.json
      → frontend renders across 5 specialized views
      → risk score computed on-demand via separate endpoint
```

---

## Stage-by-Stage Data Stores

```
Stage              Disk                          Firestore
─────              ────                          ─────────
Research           dossier.json                  sim_episodes (28 chunks)
                   research_log.json             graph_nodes (~28)
                                                 graph_edges (~30)

Threat Analysis    threat_analysis.json          —

Config Expansion   scenarios/<id>.json           —

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

Exercise Report    report.json                   risk_scores
```
