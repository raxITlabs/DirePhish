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
researching → research_complete → (auto-start) → analyzing_threats → scenarios_ready → (user picks 1-3) → generating_configs → configs_ready → (launch 1-3 sims) → simulations → comparative_report
```

Two user decision points:
- Review dossier (exists)
- Pick scenarios (new)

Everything else auto-chains.

## Phase 2: Threat Intelligence (NEW)

New service: `backend/app/services/threat_analyzer.py`

Auto-starts when research completes. Runs 4 focused LLM calls sequentially in a background thread, following the same pattern as `research_agent.py`.

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

### threat_analysis.json structure

```json
{
  "threats": [
    {
      "name": "Supply Chain Compromise",
      "relevance": "high",
      "reasoning": "Company uses 3 unaudited third-party payment processors...",
      "threatActors": ["FIN7", "APT41"],
      "mitreTechniques": ["T1195", "T1199"]
    }
  ],
  "vulnerabilities": [
    {
      "gap": "No vendor security audit process",
      "linkedThreats": ["Supply Chain Compromise"],
      "affectedSystems": ["PaymentGateway", "VendorPortal"],
      "severity": "critical"
    }
  ],
  "attackPaths": [
    {
      "id": "path_0",
      "title": "Supply chain via payment processor",
      "killChain": [
        { "step": 1, "tactic": "initial_access", "technique": "T1195.002", "target": "PaymentGateway", "description": "Compromised vendor credentials..." },
        { "step": 2, "tactic": "execution", "technique": "T1059", "target": "AppServer", "description": "..." }
      ],
      "expectedOutcome": "PCI data exfiltration, GDPR notification required"
    }
  ],
  "uncertaintyAxes": {
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
      "affectedTeams": ["SOC", "Legal", "Engineering"],
      "attackPathId": "path_0",
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

## Phase 4: Config Expansion (NEW)

New service: `backend/app/services/config_expander.py`

Runs after user selects 1-3 scenarios. For each selected scenario, runs 5 focused LLM calls:

### Call 5 — Cascading Pressure Chain
- **Input:** selected scenario + dossier (compliance, org)
- **Task:** What are the 1st/2nd/3rd order effects of this incident? Map each effect to business pressure (regulatory, customer, PR, operational, board).
- **Output:** Cascading effects + pressure configs

### Call 6 — Timed Injects with Conditions
- **Input:** scenario attack path + cascading effects
- **Task:** Generate 6-10 timed injects that follow the kill chain progression. For rounds 3+ add conditional branching — "if defenders haven't done X, escalate; if they have, attacker adapts."
- **Output:** Scheduled events with conditions

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
Assembles all outputs into a full `SimulationConfig` (backward compatible, with optional new fields). Saves to `uploads/crucible_projects/{project_id}/scenarios/scenario_{id}.json` and also as the standard `config.json` in the simulation directory.

### Enriched scenario file structure

```json
{
  "scenarioId": "scenario_0",
  "title": "Supply chain compromise via payment processor",
  "cascadingEffects": {
    "firstOrder": ["Payment processing disrupted", "SIEM alerts spike"],
    "secondOrder": ["Customers can't transact — revenue impact", "Board demands emergency briefing"],
    "thirdOrder": ["Media picks up outage", "Regulators request formal notification"]
  },
  "scheduledEvents": [
    {
      "round": 1,
      "description": "SIEM alert: unusual outbound traffic from payment gateway",
      "killChainStep": "initial_access",
      "condition": null
    },
    {
      "round": 3,
      "description": "Attacker pivots to customer DB — 50k records accessible",
      "killChainStep": "lateral_movement",
      "condition": {
        "unless": "containment_started",
        "check": "any agent action contains 'isolate' or 'contain' targeting payment systems",
        "alternative": "Attacker detected and blocked at network boundary"
      }
    }
  ],
  "agentProfiles": [
    {
      "name": "Sarah Chen",
      "role": "interim_ciso",
      "persona": "Started 8 weeks ago after previous CISO departed...",
      "stressProfile": { "baseline": 0.6, "escalationRate": "high" },
      "incidentMemory": "Has never led an IR at this company. Previous experience was at a smaller firm.",
      "decisionBias": "Tends to over-communicate to compensate for unfamiliarity"
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
  "timeConfig": { "totalRounds": 6, "hoursPerRound": 1.5 }
}
```

## SimulationConfig Extensions (Backward Compatible)

All new fields are optional. Existing configs without them work identically.

### TypeScript (frontend)

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
  check: string;
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

## Simulation Runner Changes

File: `backend/scripts/run_crucible_simulation.py`

### Must-have: Conditional inject evaluation

Add `_evaluate_condition(check_string, actions)` function that scans the action log for keyword matches. Simple string matching — no LLM call during simulation.

```python
def _evaluate_condition(check: str, actions: list[dict]) -> bool:
    """Check if any action in history matches the condition keywords."""
    keywords = re.findall(r"'([^']+)'", check)  # extract quoted keywords
    for action in actions:
        action_text = f"{action.get('action', '')} {json.dumps(action.get('args', {}))}"
        if any(kw.lower() in action_text.lower() for kw in keywords):
            return True
    return False
```

Inject evaluation in the round loop:

```python
if round_num in scheduled_events:
    for event in scheduled_events[round_num]:
        if isinstance(event, dict) and event.get("condition"):
            condition_met = _evaluate_condition(event["condition"]["check"], all_actions)
            inject_text = event["condition"]["alternative"] if condition_met else event["description"]
        elif isinstance(event, dict):
            inject_text = event.get("description", str(event))
        else:
            inject_text = str(event)  # backward compat: plain string events
        active_events.append(inject_text)
```

### Good-to-have: Optional prompt enrichment

If `attackPath` exists in config, append kill chain context to scenario text in round 1. If `incidentMemory` exists on an agent, append to system prompt. If `stressProfile` exists, add stress context that scales with round number. If `decisionBias` exists, add to persona section.

These are additive prompt enrichments — no structural changes to the runner loop.

## Comparative Report (NEW)

New service: `backend/app/services/comparative_report_agent.py`

Triggered after all simulations for a project complete. Takes:
- All individual reports
- All simulation configs
- All action logs
- The threat analysis (scenarios, attack paths, evidence)

Generates via LLM:
- Cross-scenario comparison matrix (scenarios × metrics like response time, containment, compliance, communication)
- Consistent weaknesses section ("Across all scenarios, your team failed to...")
- Scenario-specific findings ("In the supply chain scenario, your team excelled at X but...")
- Priority recommendations ranked by how many scenarios they'd improve
- Executive summary tying it all together

Saves to `uploads/simulations/comparative_{project_id}/report.json`.

## New API Endpoints

All under `/api/crucible/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `projects/{id}/scenarios` | GET | Returns scenario variants after threat analysis completes |
| `projects/{id}/generate-configs` | POST | Takes `{ scenarioIds: [...] }`, generates configs for selected scenarios |
| `projects/{id}/configs` | GET | Returns all generated configs |
| `projects/{id}/launch` | POST | Launches all configs as separate simulations, returns sim IDs |
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
- Preset flow

## Cost Tracking

Uses existing `CostTracker` class with new phase labels:

- `threat_analysis` — for Phase 2 LLM calls (4 calls: threat_landscape, vulnerability_mapping, attack_path_generation, scenario_framing)
- `config_expansion` — for Phase 4 LLM calls (5 calls per scenario: cascading_pressures, timed_injects, agent_personas, world_design, time_config)
- `comparative_report` — for the cross-scenario report generation

Cost tracker carries forward across phases as it does today. No changes to the CostTracker class.

## Data Storage

```
uploads/crucible_projects/{project_id}/
  project.json              ← extended with new statuses
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
| `research_agent.py` | Unchanged |
| `graphiti_manager.py` | Unchanged |
| `crucible_report_agent.py` | Unchanged |
| `llm_client.py` | Unchanged |
| `cost_tracker.py` | Unchanged |
| `config_generator.py` | Deprecated but kept — still works if called directly |
| Frontend simulation dashboard | Unchanged |
| Frontend individual report page | Unchanged |
| Frontend research components | Unchanged |
| Preset flow (`/configure/[presetId]`) | Unchanged |
| All existing API endpoints | Unchanged |
| `SimulationConfig` existing fields | Unchanged — new fields are optional |
| Simulation runner core loop | Unchanged — conditional inject eval is additive |

## New Files

| File | Purpose |
|------|---------|
| `backend/app/services/threat_analyzer.py` | Phase 2: threat intelligence pipeline |
| `backend/app/services/config_expander.py` | Phase 4: per-scenario config generation |
| `backend/app/services/comparative_report_agent.py` | Cross-scenario comparative report |
| `frontend/app/actions/scenarios.ts` | Server actions for scenario endpoints |
| `frontend/app/components/configure/ScenarioCards.tsx` | Scenario selection UI |
| `frontend/app/components/configure/ScenarioTabs.tsx` | Multi-config review tabs |
| `frontend/app/report/comparative/[projectId]/page.tsx` | Comparative report page |
| `frontend/app/components/report/ComparativeReport.tsx` | Comparative report content |

## Extended Files

| File | Change |
|------|--------|
| `backend/app/services/project_manager.py` | New statuses, scenario storage/retrieval methods |
| `backend/app/api/crucible.py` | New endpoints (6 new routes) |
| `backend/scripts/run_crucible_simulation.py` | Conditional inject evaluation + optional prompt enrichment |
| `frontend/app/types/simulation.ts` | Optional fields on SimulationConfig, AgentConfig, ScheduledEvent |
| `frontend/app/types/project.ts` | New statuses on Project type |
| `frontend/app/configure/project/[projectId]/page.tsx` | Handle new statuses, scenario selection flow |
| `frontend/app/actions/report.ts` | Comparative report actions |
