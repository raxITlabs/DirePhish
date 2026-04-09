# Architecture

## Pipeline overview

<p align="center">
  <img src="./architecture/pipeline-flow.png" alt="DirePhish Pipeline" width="700" />
</p>
<p align="center">
  <img src="./architecture/system-architecture.png" alt="System Architecture" width="700" />
</p>

## Pipeline stages

```
 YOU                                           DIREPHISH
  |
  |  company.com + context
  v
┌─────────────────────────────────────────────────────────────────┐
│ 1. RESEARCH                                                     │
│    Crawl website ─► Gemini grounded search (5 queries) ─► LLM   │
│    synthesis ─► structured dossier + knowledge graph            │
│                                                                 │
│    Output:  8-15 roles, 7-12 systems, 5-8 risks, 5+ events      │
│    Stores:  dossier.json (disk)                                 │
│             sim_episodes (Firestore, 28 vector-embedded chunks) │
│             graph_nodes + graph_edges (Firestore, ~30 entities) │
└──────────────────────────┬──────────────────────────────────────┘
                           │ dossier + graph
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 2. DOSSIER REVIEW                                               │
│    You review and edit the dossier before simulation begins.    │
│    Fix roles, add systems, adjust risks.                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ confirmed dossier
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 3. THREAT ANALYSIS (4 LLM calls)                                │
│    Analyze threat landscape ─► map vulnerabilities ─►           │
│    generate attack paths ─► frame scenarios with                │
│    uncertainty axes. Maps MITRE ATT&CK kill chains.             │
│                                                                 │
│    Output:  3-5 ranked scenarios with attack paths              │
│    Stores:  threat_analysis.json (disk)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ top 1-2 scenarios
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 4. CONFIG EXPANSION (5 LLM calls per scenario)                  │
│    Generates full simulation config from scenario + graph:      │
│    ├── Agent personas (grounded in org hierarchy from graph)    │
│    ├── Communication worlds (Slack channels, email threads)     │
│    ├── Timed injects (grounded in system dependencies)          │
│    ├── Business pressures (countdowns, deadlines)               │
│    └── Auto-injects: threat actor + adaptive depth              │
│                                                                 │
│    The threat actor gets attacker intelligence from the graph:  │
│    critical systems ranked by connectivity, lateral movement    │
│    paths, defender blind spots.                                 │
│                                                                 │
│    Output:  scenarios/<id>.json with 8-14 agents, 3-5 worlds,   │
│             8-15 injects, adaptive depth (3-30 rounds)          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ simulation config(s)
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 5. SIMULATION (parallel worlds, async LLM calls)                │
│                                                                 │
│    Each round:                                                  │
│    ├── Attacker phase: threat actor reads defender channels,    │
│    │   acts in C2 (invisible to defenders)                      │
│    ├── Defender phase: all agents act in parallel across worlds │
│    ├── Memory: Firestore vector search for agent recall         │
│    ├── Graph: each agent gets org context (who they manage,     │
│    │   what systems they own, who they report to)               │
│    └── Arbiter: LLM evaluates — continue / halt / inject twist  │
│                                                                 │
│    Runs until arbiter halts (adaptive) or max rounds reached.   │
│    ~20-25s per round (12x faster than sequential).              │
│                                                                 │
│    Stores:  actions.jsonl, checkpoints/round_N.json (disk)      │
│             sim_episodes (Firestore, batch per round)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ completed simulation(s)
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 6. MONTE CARLO — run the sim N times with controlled variation  │
│                                                                 │
│    ┌──────────┬──────┬─────────┬───────────┬────────┐            │
│    │   Mode   │ Iter │ Workers │ Max rnds  │  Cost  │            │
│    ├──────────┼──────┼─────────┼───────────┼────────┤            │
│    │ Test     │   3  │    2    │ 10 (7 ag) │  ~$1   │            │
│    │ Quick    │  10  │    2    │ 30        │  ~$7   │            │
│    │ Standard │  50  │    3    │ 30        │  ~$35  │            │
│    │ Deep     │ 100+ │    3    │ 30        │  ~$70+ │            │
│    └──────────┴──────┴─────────┴───────────┴────────┘            │
│                                                                 │
│    4 variation axes per iteration (seeded, reproducible):       │
│    temperature jitter · persona perturbation ·                  │
│    inject timing shift · agent order shuffle                    │
│                                                                 │
│    Output:  outcome distribution, containment stats,            │
│             decision divergence, agent consistency scores       │
│    Stores:  mc_aggregates (Firestore)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ aggregate results
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 7. COUNTERFACTUAL — what if they decided differently?           │
│                                                                 │
│    LLM identifies 3-5 critical decision points from the sim.    │
│    Forks top 1-2 decisions from checkpoint, replays with        │
│    modifications (override agent, inject event, remove action). │
│    Compares: original outcome vs alternate timeline.            │
│                                                                 │
│    Stores:  branch configs + actions (disk), episodes           |
|    (Firestore)                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ all simulation data + MC stats + branches
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 8. EXERCISE REPORT                                              │
│                                                                 │
│    ReACT agent with Firestore vector search tools generates     │
│    executive-grade report across 5 views:                       │
│    ├── Board View — KPIs, incident timeline, team metrics       │
│    ├── CISO View — threat assessment, top risks, org impact     │
│    ├── Security Team — role-specific performance breakdown      │
│    ├── Playbook — 6-part IR playbook (evidence → recovery)      │
│    └── Risk Score — FAIR methodology, confidence intervals      │
│                                                                 │
│    All in predictive language — this is a forecast, not a       │
│    post-mortem.                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**What the numbers mean:** In test mode, DirePhish runs 3 Monte Carlo
iterations with a capped config (7 agents, 3 worlds, max 10 rounds)
and 1 counterfactual fork -- enough to validate the entire pipeline
end-to-end in ~3-5 minutes. In standard mode, 50 iterations with full
configs produce statistically meaningful outcome distributions: "73%
contained within 12 hours, 18% lateral movement succeeded, 9% full
regulatory escalation."

## Data stores

```
Firestore:  sim_episodes · graph_nodes · graph_edges · mc_aggregates · risk_scores
Disk:       dossier.json · threat_analysis.json · scenarios/*.json · actions.jsonl
```

## Monte Carlo simulation

Run the same threat scenario 50-100 times with controlled variation to get
probabilistic threat intelligence instead of a single narrative.

**Graduated test mode** -- start small, scale up:

| Mode | Iterations | Workers | Max rounds | Agents | Cost est. |
|------|-----------|---------|------------|--------|-----------|
| Test | 3 | 2 | 10 | 7 | ~$1 |
| Quick | 10 | 2 | 30 | 8-14 | ~$7 |
| Standard | 50 | 3 | 30 | 8-14 | ~$35 |
| Deep | 100+ | 3 | 30 | 8-14 | ~$70+ |

Test mode runs 3 iterations with a capped config (7 agents, 3 worlds, max 10
rounds) for fast end-to-end validation in ~3-5 minutes. Must complete a test run before
unlocking standard/deep. Cost tracking at every level with hard spend limits.

**What you get:**
- Outcome probability distribution (73% contained, 18% escalated, 9% breach)
- Mean time to containment with standard deviation
- Decision divergence analysis -- which round and which agent's choice matters most
- Agent consistency scores -- who behaves predictably vs erratically under pressure
- Cost extrapolation from test runs to estimate larger batches

## Advanced simulation features

- **Adversarial agent** -- live threat actor LLM playing against defenders with asymmetric information
- **Adaptive depth** -- simulations run until resolved (not a fixed timer), governed by an arbiter LLM
- **Counterfactual branching** -- fork any sim from any round, change one decision, compare outcomes
- **Stress testing** -- 11 automatic config mutations (remove agents, add insiders, kill comms, halve timers) with resilience scoring

## See also

- [Data flow diagram](architecture/data-flow-diagram.md)
- [Tech stack](TECH_STACK.md)
- [GCP setup](GCP_SETUP.md)
