# Predictive Config Generation Pipeline

**Date:** 2026-03-21
**Status:** Draft
**Author:** Adesh + Claude

## Problem

The current config generation pipeline takes a company dossier and produces a single simulation config in one LLM call. This produces plausible but not predictive scenarios — generic incident types without evidence-backed reasoning about what's most likely to happen to THIS company. An executive can't use the output to plan because it doesn't answer: "What are the most probable incidents we'll face, how would our team respond to each, and where do we consistently fail?"

## Desired Outcome

An executive gives the system a company URL. The system:

1. Researches the company (exists, unchanged)
2. Analyzes threats specific to that company — what threat actors, what gaps, what attack paths
3. Presents 3-4 ranked scenario variants with probability estimates and evidence
4. Executive picks 1-3 to simulate
5. Each simulation runs with rich, scenario-specific configs (cascading pressures, conditional injects, human-factors-aware agents)
6. Individual after-action reports per simulation (exists, unchanged)
7. Comparative report across all simulations: "Here's where you consistently fail"

The comparative report is the planning document.

## Pipeline Flow

```
researching → research_complete → (auto-start) → analyzing_threats → scenarios_ready → (user picks 1-3) → generating_configs → configs_ready → (launch 1-3 sims) → simulations → (user triggers) → comparative_report
```

User decision points:
- Review dossier (exists)
- Pick scenarios (new)
- Trigger comparative report (new — button after all sims complete)

## Auto-Chain Trigger

When `project_manager.update_project()` sets status to `research_complete`, it calls `threat_analyzer.run_threat_analysis(project_id)` to auto-start Phase 2. This keeps `research_agent.py` completely unchanged — the orchestration hook lives in `project_manager.py`.

## Project Status Enum (Complete)

```
"researching" | "research_complete" | "analyzing_threats" | "scenarios_ready" | "generating_configs" | "configs_ready" | "failed"
```

The old `"generating_config"` (singular) and `"config_ready"` (singular) are kept for backward compatibility with any projects created before this change. New projects use the plural forms.

## Multi-Simulation Storage

The `project.json` gains a `sim_ids: list[str]` field (replaces the singular `sim_id`). For backward compatibility, code that reads `sim_id` should also check `sim_ids[0]`.

## Phase 1: Intelligence Gathering (EXISTS, UNCHANGED)

Research agent scrapes, searches, synthesizes dossier. No changes.

## Phase 2: Threat Intelligence (NEW)

New service: `backend/app/services/threat_analyzer.py`

Auto-starts when research completes (triggered via project_manager hook). Runs 4 focused LLM calls sequentially in a background thread, following the same pattern as `research_agent.py`.

### Cost tracking
Each call loads the existing cost tracker from the project directory, appends entries with phase label `threat_analysis`, and saves back after the pipeline completes.

### Call 1 — Threat Landscape Analysis
- **Input:** dossier (company, systems, compliance, security posture)
- **Role:** Cyber threat intelligence analyst
- **Task:** Given this company's industry, size, tech stack, and security posture — what threat actor groups are most likely to target them? What are the top 8-10 threat categories ranked by relevance?
- **Output:** Ranked threat list with reasoning

### Call 2 — Vulnerability & Gap Analysis
- **Input:** dossier (systems, security posture, compliance) + threat list from Call 1
- **Role:** Penetration tester reviewing the attack surface
- **Task:** Map the threats to specific gaps. Where's the attack surface? What's missing from their defenses? What systems are exposed?
- **Output:** Vulnerability map linked to specific systems and threats

### Call 3 — Attack Path Generation
- **Input:** threat list + vulnerability map + dossier (recent events, risks, peer incidents)
- **Role:** Red team operator planning attack campaigns
- **Task:** For the top 3-4 threats, walk a full MITRE ATT&CK kill chain through this company's specific infrastructure. Each path should be 5-8 steps from initial access to impact.
- **Output:** 3-4 attack paths with technique IDs, target systems, and expected outcomes

### Call 4 — Scenario Framing (2x2 Matrix)
- **Input:** attack paths + dossier
- **Role:** Strategic scenario planner
- **Task:** Pick the 2 most uncertain and impactful variables for this company. Generate 3-4 scenario frames from the matrix quadrants. Assign probability estimates based on evidence. Give each a concrete title and one-paragraph narrative.
- **Output:** Scenario variants with probabilities, summaries, affected teams

### Output
Saves `threat_analysis.json` to the project directory. Updates project status to `scenarios_ready`.

### Error handling
If any call fails, status is set to `failed` with `error_message` describing which step failed. The user can retry from the configure page, which re-triggers the full threat analysis.

### threat_analysis.json structure (snake_case, matching backend convention)

```json
{
  "threats": [
    {
      "name": "Supply Chain Compromise",
      "relevance": "high",
      "reasoning": "Company uses 3 unaudited third-party payment processors...",
      "threat_actors": ["FIN7", "APT41"],
      "mitre_techniques": ["T1195", "T1199"]
    }
  ],
  "vulnerabilities": [
    {
      "gap": "No vendor security audit process",
      "linked_threats": ["Supply Chain Compromise"],
      "affected_systems": ["PaymentGateway", "VendorPortal"],
      "severity": "critical"
    }
  ],
  "attack_paths": [
    {
      "id": "path_0",
      "title": "Supply chain via payment processor",
      "kill_chain": [
        { "step": 1, "tactic": "initial_access", "technique": "T1195.002", "target": "PaymentGateway", "description": "Compromised vendor credentials..." },
        { "step": 2, "tactic": "execution", "technique": "T1059", "target": "AppServer", "description": "..." }
      ],
      "expected_outcome": "PCI data exfiltration, GDPR notification required"
    }
  ],
  "uncertainty_axes": {
    "axis1": { "name": "Detection Speed", "low": "Breach undetected for days", "high": "SIEM catches within hours" },
    "axis2": { "name": "Attacker Persistence", "low": "Opportunistic smash-and-grab", "high": "APT with long-term access" }
  },
  "scenarios": [
    {
      "id": "scenario_0",
      "title": "Supply chain compromise via payment processor",
      "probability": 0.65,
      "severity": "critical",
      "summary": "Your dossier shows you use PaymentCo (no SOC 2 cert found)...",
      "affected_teams": ["SOC", "Legal", "Engineering"],
      "attack_path_id": "path_0",
      "quadrant": "high_persistence_slow_detection",
      "evidence": [
        "No vendor audit process found in security posture",
        "CISO departed 2 months ago (recent events)",
        "3 fintech peers hit via third-party vendors this year"
      ]
    }
  ]
}
```

## Phase 3: Scenario Selection (NEW — user decision point)

The frontend shows scenario cards from `threat_analysis.json`. User checks 1-3 scenarios and clicks "Generate Configs". This calls `POST /api/crucible/projects/{id}/generate-configs` with `{ "scenario_ids": ["scenario_0", "scenario_2"] }`.

No backend logic beyond the endpoint — this is a UI interaction that triggers Phase 4.

## Phase 4: Config Expansion (NEW)

New service: `backend/app/services/config_expander.py`

Runs after user selects 1-3 scenarios. For each selected scenario, runs 5 focused LLM calls sequentially.

### Cost tracking
Loads existing cost tracker from project directory (which now includes research + threat analysis costs), appends entries with phase label `config_expansion`, saves back after completion.

### Call 5 — Cascading Pressure Chain
- **Input:** selected scenario + dossier (compliance, org)
- **Task:** What are the 1st/2nd/3rd order effects of this incident? Map each effect to business pressure (regulatory, customer, PR, operational, board).
- **Output:** Cascading effects + pressure configs

### Call 6 — Timed Injects with Conditions
- **Input:** scenario attack path + cascading effects
- **Task:** Generate 6-10 timed injects that follow the kill chain progression. For rounds 3+ add conditional branching — "if defenders haven't done X, escalate; if they have, attacker adapts."
- **Output:** Scheduled events with conditions. Conditions use a structured format (see below) rather than free text.

### Call 7 — Agent Selection & Personas
- **Input:** scenario + dossier (org, recent events) + pressures
- **Task:** Pick 5-8 roles that matter for THIS specific incident. Generate rich personas — name, background, relationship to the incident, stress profile, decision biases, communication style. Each persona should include tension with at least one other agent.
- **Output:** Agent profiles with human factors

### Call 8 — World & Comms Design
- **Input:** scenario type + agent roles
- **Task:** Which communication platforms are relevant? Map agents to their primary worlds.
- **Output:** World configs

### Call 9 — Time & Pacing
- **Input:** scenario attack path + inject count
- **Task:** How fast does this type of incident unfold? Set round count, hours per round, pacing.
- **Output:** Time config

### Output per scenario
Assembles all outputs into a full `SimulationConfig` (backward compatible, with optional new fields). Saves to `uploads/crucible_projects/{project_id}/scenarios/scenario_{id}.json` and also as the standard `config.json` in the simulation directory when launched.

### Error handling
If config expansion fails for one scenario, the others still complete. Status only goes to `failed` if ALL selected scenarios fail. Partial success shows which configs are ready and which failed.

### Enriched scenario file structure (snake_case)

```json
{
  "scenario_id": "scenario_0",
  "title": "Supply chain compromise via payment processor",
  "cascading_effects": {
    "first_order": ["Payment processing disrupted", "SIEM alerts spike"],
    "second_order": ["Customers can't transact — revenue impact", "Board demands emergency briefing"],
    "third_order": ["Media picks up outage", "Regulators request formal notification"]
  },
  "scheduled_events": [
    {
      "round": 1,
      "description": "SIEM alert: unusual outbound traffic from payment gateway",
      "kill_chain_step": "initial_access",
      "condition": null
    },
    {
      "round": 3,
      "description": "Attacker pivots to customer DB — 50k records accessible",
      "kill_chain_step": "lateral_movement",
      "condition": {
        "unless": "containment_started",
        "keywords": ["isolate", "contain", "block", "quarantine"],
        "target_systems": ["payment", "gateway"],
        "alternative": "Attacker detected and blocked at network boundary"
      }
    }
  ],
  "agent_profiles": [
    {
      "name": "Sarah Chen",
      "role": "interim_ciso",
      "persona": "Started 8 weeks ago after previous CISO departed...",
      "stress_profile": { "baseline": 0.6, "escalation_rate": "high" },
      "incident_memory": "Has never led an IR at this company. Previous experience was at a smaller firm.",
      "decision_bias": "Tends to over-communicate to compensate for unfamiliarity"
    }
  ],
  "worlds": [
    { "type": "slack", "name": "IR War Room" },
    { "type": "email", "name": "Corporate Email" },
    { "type": "siem", "name": "SIEM Console" }
  ],
  "pressures": [
    {
      "name": "GDPR 72-Hour Notification",
      "type": "countdown",
      "affects_roles": ["interim_ciso", "legal_counsel", "dpo"],
      "hours": 72,
      "severity_at_50pct": "high",
      "severity_at_25pct": "critical"
    }
  ],
  "time_config": { "total_rounds": 6, "hours_per_round": 1.5 }
}
```

## SimulationConfig Extensions (Backward Compatible)

All new fields are optional. Existing configs without them work identically.

### TypeScript (frontend)

The frontend transforms snake_case from the API to camelCase as it does today in the server actions.

```typescript
export interface SimulationConfig {
  // All existing fields unchanged
  simulationId?: string;
  projectId?: string;
  companyName: string;
  scenario: string;
  totalRounds: number;
  hoursPerRound: number;
  agents: AgentConfig[];
  worlds: WorldConfig[];
  pressures: PressureConfig[];
  scheduledEvents: ScheduledEvent[];

  // NEW optional fields
  scenarioId?: string;
  attackPath?: { killChain: KillChainStep[] };
  cascadingEffects?: { firstOrder: string[]; secondOrder: string[]; thirdOrder: string[] };
  threatActorProfile?: string;
}

export interface KillChainStep {
  step: number;
  tactic: string;
  technique: string;
  target: string;
  description: string;
}

export interface ScheduledEvent {
  round: number;
  description: string;
  // NEW optional fields
  killChainStep?: string;
  condition?: ConditionalInject;
}

export interface ConditionalInject {
  unless: string;
  keywords: string[];
  targetSystems: string[];
  alternative: string;
}

export interface AgentConfig {
  name: string;
  role: string;
  persona: string;
  // NEW optional fields
  stressProfile?: { baseline: number; escalationRate: string };
  incidentMemory?: string;
  decisionBias?: string;
}
```

### Python (backend)

The backend stores and serves all data in snake_case. The `SimulationConfig` dict gains optional keys: `scenario_id`, `attack_path`, `cascading_effects`, `threat_actor_profile`. Agent dicts gain optional: `stress_profile`, `incident_memory`, `decision_bias`. Scheduled event dicts gain optional: `kill_chain_step`, `condition`.

### Frontend action passthrough

The `launchSimulation` action in `frontend/app/actions/simulation.ts` must be updated to pass through all new optional fields when building the backend payload. Currently it explicitly maps only known fields — new fields would be silently dropped.

## Simulation Runner Changes

File: `backend/scripts/run_crucible_simulation.py`

### Must-have: Scheduled event parsing change

**This is a structural change, not additive.** The current runner flattens scheduled events to plain strings at parse time:

```python
# CURRENT (must change):
for event in config.get("scheduled_events", []):
    r = event["round"]
    scheduled_events.setdefault(r, []).append(event["description"])
```

Must change to store the full event dict:

```python
# NEW:
for event in config.get("scheduled_events", []):
    r = event["round"]
    scheduled_events.setdefault(r, []).append(event)
```

### Must-have: Conditional inject evaluation

Add `_evaluate_condition(condition, actions)` function that uses structured keyword matching (not regex on free text):

```python
def _evaluate_condition(condition: dict, actions: list[dict]) -> bool:
    """Check if any action in history matches the condition's keywords + target systems."""
    keywords = [k.lower() for k in condition.get("keywords", [])]
    targets = [t.lower() for t in condition.get("target_systems", [])]
    if not keywords:
        return False
    for action in actions:
        action_text = f"{action.get('action', '')} {json.dumps(action.get('args', {}))}".lower()
        keyword_match = any(kw in action_text for kw in keywords)
        target_match = not targets or any(t in action_text for t in targets)
        if keyword_match and target_match:
            return True
    return False
```

Inject evaluation in the round loop:

```python
if round_num in scheduled_events:
    for event in scheduled_events[round_num]:
        if isinstance(event, dict) and event.get("condition"):
            condition_met = _evaluate_condition(event["condition"], all_actions)
            inject_text = event["condition"]["alternative"] if condition_met else event["description"]
        elif isinstance(event, dict):
            inject_text = event.get("description", str(event))
        else:
            inject_text = str(event)  # backward compat: plain string events
        active_events.append(inject_text)
```

This is backward compatible because old configs with plain `{"round": N, "description": "..."}` events still work — they just don't have a `condition` field.

### Good-to-have: Optional prompt enrichment

If `attack_path` exists in config, append kill chain context to scenario text in round 1. If `incident_memory` exists on an agent, append to system prompt. If `stress_profile` exists, add stress context that scales with round number. If `decision_bias` exists, add to persona section.

These are additive prompt enrichments that only activate when the fields are present.

## Phase 5: Simulation (EXISTS, MINIMALLY EXTENDED)

The core simulation loop is unchanged. Only the scheduled event parsing and inject evaluation change as described above. All existing behavior (agent → world → action, Graphiti memory, pressure ticking, action logging) remains identical.

## Phase 6: Individual Reports (EXISTS, UNCHANGED)

Each simulation gets its own after-action report via `crucible_report_agent.py`. No changes.

## Phase 7: Comparative Report (NEW)

New service: `backend/app/services/comparative_report_agent.py`

**User-triggered** — a "Generate Comparative Report" button appears on the UI after all simulations for a project are complete. Not auto-chained.

### Input
- All individual reports for the project's simulations
- All simulation configs
- All action logs
- The threat analysis (scenarios, attack paths, evidence)

### Output (via LLM)
- Executive summary tying all scenarios together
- Cross-scenario comparison matrix (scenarios × metrics like response time, containment, compliance, communication)
- Consistent weaknesses section ("Across all scenarios, your team failed to...")
- Scenario-specific findings ("In the supply chain scenario, your team excelled at X but...")
- Priority recommendations ranked by how many scenarios they'd improve

### Partial completion
If 2 of 3 simulations completed and 1 failed, the comparative report runs on the 2 that succeeded. It notes which scenario did not complete.

### Cost tracking
Uses phase label `comparative_report`. Loads cost tracker from the first simulation's directory.

Saves to `uploads/simulations/comparative_{project_id}/report.json`.

## New API Endpoints

All under `/api/crucible/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `projects/{id}/scenarios` | GET | Returns scenario variants from threat_analysis.json |
| `projects/{id}/generate-configs` | POST | Takes `{ "scenario_ids": [...] }`, triggers config expansion |
| `projects/{id}/configs` | GET | Returns all generated configs (list) |
| `projects/{id}/launch` | POST | Launches all ready configs as separate simulations, returns sim_ids |
| `projects/{id}/comparative-report` | POST | Triggers comparative report generation |
| `projects/{id}/comparative-report` | GET | Returns comparative report |

All existing endpoints remain unchanged.

## New Frontend Server Actions

```typescript
// actions/scenarios.ts
getScenarios(projectId: string)
generateConfigs(projectId: string, scenarioIds: string[])
getConfigs(projectId: string)
launchScenarios(projectId: string)

// actions/report.ts (extended)
generateComparativeReport(projectId: string)
getComparativeReport(projectId: string)
```

## Frontend Changes

### Configure project page (`/configure/project/[projectId]`)

Extended to handle new statuses:

- `analyzing_threats` → progress bar with phase messages ("Analyzing threat landscape...", "Mapping vulnerabilities...", "Generating attack paths...", "Framing scenarios...")
- `scenarios_ready` → scenario selection view: 3-4 cards with title, probability badge, severity indicator, one-paragraph summary, affected teams list. Checkboxes for 1-3 selection. "Generate Configs" button.
- `generating_configs` → progress per scenario
- `configs_ready` → existing config review UI with tab/dropdown per selected scenario. "Launch All" button.

### New page: Comparative report (`/report/comparative/[projectId]`)

Shows cross-scenario analysis after all simulations complete. Link appears on the simulation history or individual report pages.

### All other pages unchanged
- Home page
- Simulation dashboard
- Individual report page
- Research components

### Note on presets
The preset UI components (`PresetCard.tsx`, `PresetGrid.tsx`, `preset.ts`) have already been deleted from the codebase. The preset backend endpoints still exist and work, but there is no frontend UI for them. The new pipeline does not affect this — presets remain a backend-only path.

## Cost Tracking

Uses existing `CostTracker` class with new phase labels. No changes to the class itself.

Each new service follows the same load/append/save pattern:
1. Load existing costs from project directory (`CostTracker.load()` or from `costs.json`)
2. Track LLM calls with the appropriate phase label
3. Save back to project directory on completion

Phase labels:
- `threat_analysis` — for Phase 2 LLM calls (4 calls: threat_landscape, vulnerability_mapping, attack_path_generation, scenario_framing)
- `config_expansion` — for Phase 4 LLM calls (5 calls per scenario: cascading_pressures, timed_injects, agent_personas, world_design, time_config)
- `comparative_report` — for the cross-scenario report generation

## Data Storage

```
uploads/crucible_projects/{project_id}/
  project.json              ← extended: new statuses + sim_ids list
  dossier.json              ← unchanged
  research_log.json         ← unchanged
  threat_analysis.json      ← NEW
  scenarios/
    scenario_0.json         ← NEW: enriched scenario config
    scenario_1.json
    scenario_2.json
  costs.json                ← unchanged format, new phase labels

uploads/simulations/{sim_id}/
  config.json               ← same shape + optional new fields
  actions.jsonl             ← unchanged
  summary.json              ← unchanged
  report.json               ← unchanged

uploads/simulations/comparative_{project_id}/
  report.json               ← NEW: comparative analysis
```

## What Does NOT Change (Safety List)

| Component | Status |
|-----------|--------|
| `research_agent.py` | Unchanged — does not call threat_analyzer (project_manager handles the hook) |
| `graphiti_manager.py` | Unchanged |
| `crucible_report_agent.py` | Unchanged — per-simulation reports stay identical |
| `llm_client.py` | Unchanged |
| `cost_tracker.py` | Unchanged — new services use existing load/track/save pattern |
| `config_generator.py` | Deprecated but kept — still works if called directly |
| Frontend simulation dashboard | Unchanged |
| Frontend individual report page | Unchanged |
| Frontend research components | Unchanged |
| All existing API endpoints | Unchanged — new endpoints are additive |
| `SimulationConfig` existing fields | Unchanged — new fields are optional |

## What Changes (Explicit)

| Component | Change | Risk |
|-----------|--------|------|
| `project_manager.py` | New statuses, `sim_ids` list, scenario storage methods, auto-chain hook to trigger threat analysis | Low — additive methods, existing methods untouched |
| `crucible.py` (API) | 6 new route handlers | Low — new routes only |
| `run_crucible_simulation.py` | Scheduled event parsing stores full dict instead of string; conditional inject evaluation added | Medium — changes event parsing but backward compatible via type checking |
| `simulation.ts` (types) | Optional fields on SimulationConfig, AgentConfig, ScheduledEvent | Low — all optional |
| `simulation.ts` (action) | launchSimulation passes through new optional fields | Low — additive payload fields |
| `project.ts` (types) | New status values, `simIds` field | Low — union type extension |
| `configure/project/[projectId]/page.tsx` | Handle new statuses, scenario selection flow, multi-config tabs | Medium — significant UI additions to existing page |
| `actions/report.ts` | Comparative report actions | Low — new functions only |

## New Files

| File | Purpose |
|------|---------|
| `backend/app/services/threat_analyzer.py` | Phase 2: threat intelligence pipeline (4 LLM calls) |
| `backend/app/services/config_expander.py` | Phase 4: per-scenario config generation (5 LLM calls each) |
| `backend/app/services/comparative_report_agent.py` | Cross-scenario comparative report |
| `frontend/app/actions/scenarios.ts` | Server actions for scenario endpoints |
| `frontend/app/components/configure/ScenarioCards.tsx` | Scenario selection UI |
| `frontend/app/components/configure/ScenarioTabs.tsx` | Multi-config review tabs |
| `frontend/app/report/comparative/[projectId]/page.tsx` | Comparative report page |
| `frontend/app/components/report/ComparativeReport.tsx` | Comparative report content |
