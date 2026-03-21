# Predictive Config Generation Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-shot config generation with a multi-step predictive pipeline that produces multiple evidence-backed scenario variants, conditional injects, and comparative analysis across simulations.

**Architecture:** New backend services (threat_analyzer.py, config_expander.py, comparative_report_agent.py) slot into the existing project lifecycle managed by project_manager.py. The auto-chain from research to threat analysis is triggered via a hook in project_manager.update_project(). Frontend extends the configure page to handle new statuses and scenario selection. Simulation runner gets conditional inject evaluation. All existing functionality preserved.

**Tech Stack:** Python/Flask backend, Next.js 16/React 19 frontend, LLMClient for all LLM calls, CostTracker for cost accumulation, Tailwind + shadcn/ui for frontend components.

**Spec:** `docs/superpowers/specs/2026-03-21-predictive-config-pipeline-design.md`

---

### Task 1: Extend project_manager.py — new statuses, sim_ids, scenario storage, auto-chain hook

**Files:**
- Modify: `backend/app/services/project_manager.py`

This is the foundation. All new services and endpoints depend on these methods.

- [ ] **Step 1: Add scenario storage methods**

Add `save_threat_analysis()`, `get_threat_analysis()`, `save_scenario()`, `get_scenarios()`, and `get_all_configs()` to project_manager.py. Follow the exact same pattern as `save_dossier()`/`get_dossier()`.

```python
# Add after save_config() (line 81):

def save_threat_analysis(project_id: str, analysis: dict) -> None:
    """Save the threat analysis results."""
    path = PROJECTS_DIR / project_id / "threat_analysis.json"
    with open(path, "w") as f:
        json.dump(analysis, f, indent=2)


def get_threat_analysis(project_id: str) -> dict | None:
    """Get the threat analysis for a project."""
    path = PROJECTS_DIR / project_id / "threat_analysis.json"
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def save_scenario(project_id: str, scenario_id: str, config: dict) -> None:
    """Save an expanded scenario config."""
    scenarios_dir = PROJECTS_DIR / project_id / "scenarios"
    scenarios_dir.mkdir(exist_ok=True)
    path = scenarios_dir / f"{scenario_id}.json"
    with open(path, "w") as f:
        json.dump(config, f, indent=2)


def get_scenario(project_id: str, scenario_id: str) -> dict | None:
    """Get a specific expanded scenario config."""
    path = PROJECTS_DIR / project_id / "scenarios" / f"{scenario_id}.json"
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def get_all_scenarios(project_id: str) -> list[dict]:
    """Get all expanded scenario configs."""
    scenarios_dir = PROJECTS_DIR / project_id / "scenarios"
    if not scenarios_dir.exists():
        return []
    configs = []
    for path in sorted(scenarios_dir.glob("*.json")):
        with open(path) as f:
            configs.append(json.load(f))
    return configs
```

- [ ] **Step 2: Add sim_ids support to create_project**

Change the `create_project` function to include `sim_ids` as an empty list alongside the existing `sim_id`:

```python
# In create_project(), add to the project dict (after "sim_id": None):
        "sim_ids": [],
```

- [ ] **Step 3: Add auto-chain hook to update_project**

Modify `update_project()` to auto-trigger threat analysis when status becomes `research_complete`:

```python
def update_project(project_id: str, **updates) -> dict | None:
    """Update project fields. Auto-chains threat analysis when research completes."""
    project = _load_project(project_id)
    if not project:
        return None
    project.update(updates)
    _save_project(project_id, project)

    # Auto-chain: trigger threat analysis when research completes
    if updates.get("status") == "research_complete":
        from .threat_analyzer import run_threat_analysis
        run_threat_analysis(project_id)

    return project
```

- [ ] **Step 4: Verify existing functionality**

Run: `cd backend && uv run python -c "from app.services import project_manager; print('OK')"`
Expected: `OK` — imports work, no circular dependency issues.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/project_manager.py
git commit -m "feat: extend project_manager with scenario storage, sim_ids, and auto-chain hook"
```

---

### Task 2: Create threat_analyzer.py — Phase 2 threat intelligence pipeline

**Files:**
- Create: `backend/app/services/threat_analyzer.py`

The core new service. 4 focused LLM calls in a background thread, same pattern as research_agent.py.

- [ ] **Step 1: Create threat_analyzer.py with pipeline structure**

Create the file with the full pipeline. Each LLM call has its own function for clarity. The prompts are the most important part — each one has a specific role and focused task.

```python
# backend/app/services/threat_analyzer.py
"""
Threat Analyzer — takes a company dossier and produces threat intelligence:
threat landscape, vulnerability mapping, attack paths, and scenario variants.
Runs as Phase 2 in the predictive pipeline, auto-triggered after research.
"""
import json
import threading

from ..utils.llm_client import LLMClient
from ..utils.cost_tracker import CostTracker
from ..utils.logger import get_logger
from . import project_manager

logger = get_logger("threat_analyzer")


def run_threat_analysis(project_id: str) -> None:
    """Run threat analysis in a background thread."""
    thread = threading.Thread(target=_analysis_pipeline, args=(project_id,), daemon=True)
    thread.start()


def _analysis_pipeline(project_id: str) -> None:
    """Execute the 4-step threat intelligence pipeline."""
    try:
        project_manager.update_project.__wrapped__(project_id,
            status="analyzing_threats", progress=10,
            progress_message="Analyzing threat landscape...")
        # NOTE: We call __wrapped__ or a direct _save version to avoid
        # re-triggering the auto-chain hook. Simpler approach: just check
        # status != "research_complete" in the hook.

        dossier = project_manager.get_dossier(project_id)
        if not dossier:
            raise ValueError("No dossier found for project")

        # Load cost tracker (includes research phase costs)
        project_dir = str(project_manager.get_project_dir(project_id))
        cost_tracker = CostTracker(project_id)
        existing = CostTracker.load(project_id, base_dir=project_dir)
        if existing:
            cost_tracker.entries = existing.get("entries", [])

        llm = LLMClient()

        def _track(description: str):
            if llm.last_usage:
                cost_tracker.track_llm(
                    "threat_analysis", llm.model,
                    llm.last_usage["input_tokens"],
                    llm.last_usage["output_tokens"],
                    description,
                )

        # Call 1: Threat Landscape
        project_manager.update_project(project_id,
            progress=20, progress_message="Analyzing threat landscape...")
        threats = _analyze_threat_landscape(llm, dossier)
        _track("threat_landscape")

        # Call 2: Vulnerability Mapping
        project_manager.update_project(project_id,
            progress=40, progress_message="Mapping vulnerabilities...")
        vulnerabilities = _map_vulnerabilities(llm, dossier, threats)
        _track("vulnerability_mapping")

        # Call 3: Attack Path Generation
        project_manager.update_project(project_id,
            progress=60, progress_message="Generating attack paths...")
        attack_paths = _generate_attack_paths(llm, dossier, threats, vulnerabilities)
        _track("attack_path_generation")

        # Call 4: Scenario Framing
        project_manager.update_project(project_id,
            progress=80, progress_message="Framing scenarios...")
        scenario_data = _frame_scenarios(llm, dossier, attack_paths)
        _track("scenario_framing")

        # Assemble and save
        analysis = {
            "threats": threats,
            "vulnerabilities": vulnerabilities,
            "attack_paths": attack_paths,
            "uncertainty_axes": scenario_data.get("uncertainty_axes", {}),
            "scenarios": scenario_data.get("scenarios", []),
        }
        project_manager.save_threat_analysis(project_id, analysis)
        cost_tracker.save(project_dir)

        project_manager.update_project(project_id,
            status="scenarios_ready", progress=100,
            progress_message="Scenarios ready for review.")

    except Exception as e:
        logger.error(f"Threat analysis failed for {project_id}: {e}")
        project_manager.update_project(project_id,
            status="failed", error_message=f"Threat analysis failed: {e}",
            progress_message="Threat analysis failed.")


def _format_company_context(dossier: dict) -> str:
    """Format dossier into a compact text block for prompts."""
    company = dossier.get("company", {})
    lines = [
        f"Company: {company.get('name', 'Unknown')}",
        f"Industry: {company.get('industry', 'Unknown')}",
        f"Size: {company.get('size', 'medium')} (~{company.get('employee_count', 'unknown')} employees)",
        f"Products: {', '.join(company.get('products', []))}",
        f"Geography: {company.get('geography', 'Unknown')}",
    ]
    if company.get("description"):
        lines.append(f"Description: {company['description']}")

    # Systems
    systems = dossier.get("systems", [])
    if systems:
        lines.append("\nTechnology Stack:")
        for s in systems:
            line = f"- {s.get('name', '?')} ({s.get('category', '?')}, criticality: {s.get('criticality', '?')})"
            if s.get("vendor"):
                line += f" [Vendor: {s['vendor']}]"
            lines.append(line)

    # Compliance
    compliance = dossier.get("compliance", [])
    if compliance:
        lines.append(f"\nCompliance: {', '.join(compliance)}")

    # Security Posture
    sec = dossier.get("securityPosture") or dossier.get("security_posture")
    if sec:
        lines.append("\nSecurity Posture:")
        if sec.get("certifications"):
            lines.append(f"  Certifications: {', '.join(sec['certifications'])}")
        team_key = sec.get("securityTeamSize") or sec.get("security_team_size")
        if team_key:
            lines.append(f"  Security Team: {team_key} people")
        tools = sec.get("securityTools") or sec.get("security_tools") or sec.get("tools")
        if tools:
            lines.append(f"  Tools: {', '.join(tools)}")
        ir_plan = sec.get("incidentResponsePlan") or sec.get("incident_response_plan") or sec.get("ir_plan")
        if ir_plan is not None:
            lines.append(f"  IR Plan: {'Yes' if ir_plan else 'No'}")

    # Risks
    risks = dossier.get("risks", [])
    if risks:
        lines.append("\nKnown Risks:")
        for r in risks:
            line = f"- {r.get('name', '?')} (likelihood: {r.get('likelihood', '?')}, impact: {r.get('impact', '?')})"
            if r.get("description"):
                line += f" — {r['description']}"
            lines.append(line)

    # Recent Events
    events = dossier.get("recentEvents") or dossier.get("recent_events", [])
    if events:
        lines.append("\nRecent Events:")
        for e in events:
            cat = e.get("category", "")
            line = f"- [{e.get('date', '?')}]"
            if cat:
                line += f" [{cat}]"
            line += f" {e.get('description', '')}"
            if e.get("impact"):
                line += f" Impact: {e['impact']}"
            lines.append(line)

    # Org structure
    org = dossier.get("org", {})
    roles = org.get("roles", [])
    if roles:
        lines.append("\nOrg Structure:")
        for r in roles:
            name = r.get("name", "")
            title = r.get("title", "?")
            dept = r.get("department", "?")
            line = f"- {name + ' — ' if name else ''}{title} in {dept}"
            if r.get("responsibilities"):
                line += f" ({r['responsibilities']})"
            lines.append(line)

    return "\n".join(lines)


def _analyze_threat_landscape(llm: LLMClient, dossier: dict) -> list[dict]:
    """Call 1: Identify threat actors and threat categories targeting this company."""
    company_ctx = _format_company_context(dossier)

    prompt = f"""You are a cyber threat intelligence analyst. Analyze this company and identify the threats most likely to target them.

{company_ctx}

For each threat, provide:
- The threat name and category
- Relevance (low/medium/high) to THIS specific company
- Reasoning grounded in the company's industry, tech stack, size, and known gaps
- Known threat actor groups that use this attack type
- MITRE ATT&CK technique IDs associated with the initial access vector

Return ONLY valid JSON — an array of 6-8 threats, ranked by relevance:
[
  {{
    "name": "Supply Chain Compromise",
    "relevance": "high",
    "reasoning": "Company uses unaudited third-party payment processors...",
    "threat_actors": ["FIN7", "APT41"],
    "mitre_techniques": ["T1195", "T1199"]
  }}
]

REQUIREMENTS:
- Rank by relevance to THIS company, not generic industry threats
- Ground every reasoning statement in specific facts from the dossier
- Include at least 2 threats rated "high" relevance
- Cover diverse attack types: supply chain, ransomware, insider, social engineering, DDoS, data breach, etc."""

    return llm.chat_json([{"role": "user", "content": prompt}])


def _map_vulnerabilities(llm: LLMClient, dossier: dict, threats: list[dict]) -> list[dict]:
    """Call 2: Map threats to specific gaps in the company's defenses."""
    company_ctx = _format_company_context(dossier)
    threats_text = json.dumps(threats, indent=2)

    prompt = f"""You are a penetration tester reviewing this company's attack surface. Based on the threat landscape analysis and the company profile, identify specific vulnerabilities and gaps.

## Company Profile
{company_ctx}

## Threat Landscape (from previous analysis)
{threats_text}

For each vulnerability, provide:
- The specific gap or weakness
- Which threats it enables
- Which systems are affected (use exact system names from the profile)
- Severity (low/medium/high/critical)

Return ONLY valid JSON — an array of 5-8 vulnerabilities:
[
  {{
    "gap": "No vendor security audit process",
    "linked_threats": ["Supply Chain Compromise"],
    "affected_systems": ["PaymentGateway", "VendorPortal"],
    "severity": "critical"
  }}
]

REQUIREMENTS:
- Link every vulnerability to at least one threat from the landscape analysis
- Reference specific systems by name from the company profile
- Include both technical gaps (missing tools, misconfigurations) and process gaps (no IR plan, no vendor audits)
- Prioritize gaps that enable the highest-relevance threats"""

    return llm.chat_json([{"role": "user", "content": prompt}])


def _generate_attack_paths(llm: LLMClient, dossier: dict, threats: list[dict], vulnerabilities: list[dict]) -> list[dict]:
    """Call 3: Generate MITRE ATT&CK kill chains through the company's infrastructure."""
    company_ctx = _format_company_context(dossier)
    # Only include high/medium relevance threats
    top_threats = [t for t in threats if t.get("relevance") in ("high", "medium")][:4]
    threats_text = json.dumps(top_threats, indent=2)
    vulns_text = json.dumps(vulnerabilities, indent=2)

    prompt = f"""You are a red team operator planning attack campaigns against this company. For each of the top threats, design a realistic multi-step attack path through their specific infrastructure.

## Company Profile
{company_ctx}

## Top Threats
{threats_text}

## Known Vulnerabilities
{vulns_text}

For each attack path, walk the MITRE ATT&CK kill chain (5-8 steps) through this company's actual systems. Each step should name the specific system being targeted.

Return ONLY valid JSON — an array of 3-4 attack paths:
[
  {{
    "id": "path_0",
    "title": "Supply chain via payment processor",
    "threat_name": "Supply Chain Compromise",
    "kill_chain": [
      {{ "step": 1, "tactic": "initial_access", "technique": "T1195.002", "target": "PaymentGateway", "description": "Compromised vendor credentials used to access payment processing API" }},
      {{ "step": 2, "tactic": "execution", "technique": "T1059.001", "target": "AppServer", "description": "Malicious script executed via compromised API integration" }},
      {{ "step": 3, "tactic": "persistence", "technique": "T1136", "target": "ActiveDirectory", "description": "New service account created for persistent access" }},
      {{ "step": 4, "tactic": "lateral_movement", "technique": "T1021.001", "target": "DatabaseServer", "description": "RDP to database server using stolen credentials" }},
      {{ "step": 5, "tactic": "collection", "technique": "T1005", "target": "CustomerDB", "description": "Customer PII and payment data collected" }},
      {{ "step": 6, "tactic": "exfiltration", "technique": "T1041", "target": "ExternalC2", "description": "Data exfiltrated over encrypted C2 channel" }}
    ],
    "expected_outcome": "PCI data exfiltration affecting 50k+ customers, GDPR notification required within 72 hours"
  }}
]

REQUIREMENTS:
- Each path must use REAL system names from the company profile
- Each step must have a valid MITRE ATT&CK tactic and technique ID
- Paths should be diverse — different initial access vectors, different targets
- The expected_outcome should reference specific business impacts (compliance deadlines, customer data volumes, revenue impact)"""

    return llm.chat_json([{"role": "user", "content": prompt}])


def _frame_scenarios(llm: LLMClient, dossier: dict, attack_paths: list[dict]) -> dict:
    """Call 4: Frame 3-4 scenario variants using a 2x2 uncertainty matrix."""
    company = dossier.get("company", {})
    events = dossier.get("recentEvents") or dossier.get("recent_events", [])
    paths_text = json.dumps(attack_paths, indent=2)
    events_text = json.dumps(events[:8], indent=2)

    prompt = f"""You are a strategic scenario planner. Using the attack paths below, create 3-4 distinct simulation scenarios for {company.get('name', 'the company')}.

## Attack Paths
{paths_text}

## Recent Events (for context)
{events_text}

Use the 2x2 scenario matrix method:
1. Pick the 2 most uncertain and impactful variables for this company
2. Use them as axes (high/low) to create 4 quadrants
3. Select the 3-4 most interesting/likely quadrants as scenarios

For each scenario:
- Assign a probability estimate (must sum to roughly 1.0 across all scenarios)
- Ground the probability in evidence from the dossier and recent events
- Identify which teams would be most affected

Return ONLY valid JSON:
{{
  "uncertainty_axes": {{
    "axis1": {{ "name": "Detection Speed", "low": "Breach undetected for days", "high": "SIEM catches within hours" }},
    "axis2": {{ "name": "Attacker Persistence", "low": "Opportunistic smash-and-grab", "high": "APT with long-term access" }}
  }},
  "scenarios": [
    {{
      "id": "scenario_0",
      "title": "Slow-burn supply chain compromise",
      "probability": 0.40,
      "severity": "critical",
      "summary": "A detailed 3-4 sentence narrative grounding this scenario in the company's specific situation...",
      "affected_teams": ["SOC", "Legal", "Engineering"],
      "attack_path_id": "path_0",
      "quadrant": "high_persistence_slow_detection",
      "evidence": [
        "Specific fact from the dossier supporting this scenario",
        "Another specific fact..."
      ]
    }}
  ]
}}

REQUIREMENTS:
- Each scenario must reference a specific attack_path_id from the paths above
- Probabilities should reflect the evidence — don't just split evenly
- Evidence must cite specific facts from the dossier (systems, events, gaps)
- Include at least one high-probability (>0.3) and one lower-probability (<0.2) scenario
- Summaries should be concrete and company-specific, not generic"""

    return llm.chat_json([{"role": "user", "content": prompt}])
```

- [ ] **Step 2: Fix the auto-chain hook to avoid re-triggering**

The `update_project` hook triggers on `research_complete`. But `_analysis_pipeline` also calls `update_project`. We need to prevent the hook from re-firing. Update `project_manager.py`'s `update_project`:

```python
def update_project(project_id: str, **updates) -> dict | None:
    """Update project fields. Auto-chains threat analysis when research completes."""
    project = _load_project(project_id)
    if not project:
        return None
    project.update(updates)
    _save_project(project_id, project)

    # Auto-chain: trigger threat analysis when research completes
    # Only trigger if transitioning TO research_complete (not already past it)
    if (updates.get("status") == "research_complete"
            and project.get("status") == "research_complete"):
        from .threat_analyzer import run_threat_analysis
        run_threat_analysis(project_id)

    return project
```

- [ ] **Step 3: Verify the module imports cleanly**

Run: `cd backend && uv run python -c "from app.services.threat_analyzer import run_threat_analysis; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/threat_analyzer.py backend/app/services/project_manager.py
git commit -m "feat: add threat_analyzer service — 4-step threat intelligence pipeline"
```

---

### Task 3: Create config_expander.py — Phase 4 per-scenario config generation

**Files:**
- Create: `backend/app/services/config_expander.py`

5 focused LLM calls per scenario, assembles into SimulationConfig.

- [ ] **Step 1: Create config_expander.py**

```python
# backend/app/services/config_expander.py
"""
Config Expander — takes a selected scenario variant and dossier, then generates
a full SimulationConfig through 5 focused LLM calls.
Runs as Phase 4 in the predictive pipeline.
"""
import json
import threading

from ..utils.llm_client import LLMClient
from ..utils.cost_tracker import CostTracker
from ..utils.logger import get_logger
from . import project_manager

logger = get_logger("config_expander")


def run_config_expansion(project_id: str, scenario_ids: list[str]) -> None:
    """Expand selected scenarios into full configs in a background thread."""
    thread = threading.Thread(
        target=_expansion_pipeline,
        args=(project_id, scenario_ids),
        daemon=True,
    )
    thread.start()


def _expansion_pipeline(project_id: str, scenario_ids: list[str]) -> None:
    """Generate full SimulationConfig for each selected scenario."""
    try:
        project_manager.update_project(project_id,
            status="generating_configs", progress=10,
            progress_message="Expanding scenario configs...")

        dossier = project_manager.get_dossier(project_id)
        analysis = project_manager.get_threat_analysis(project_id)
        if not dossier or not analysis:
            raise ValueError("Missing dossier or threat analysis")

        # Load cost tracker
        project_dir = str(project_manager.get_project_dir(project_id))
        cost_tracker = CostTracker(project_id)
        existing = CostTracker.load(project_id, base_dir=project_dir)
        if existing:
            cost_tracker.entries = existing.get("entries", [])

        # Find selected scenarios from the analysis
        all_scenarios = {s["id"]: s for s in analysis.get("scenarios", [])}
        attack_paths = {p["id"]: p for p in analysis.get("attack_paths", [])}

        completed = 0
        failed_scenarios = []
        total = len(scenario_ids)

        for i, sid in enumerate(scenario_ids):
            scenario = all_scenarios.get(sid)
            if not scenario:
                logger.warning(f"Scenario {sid} not found in analysis")
                failed_scenarios.append(sid)
                continue

            attack_path = attack_paths.get(scenario.get("attack_path_id", ""))
            pct = 10 + int(80 * (i / total))
            project_manager.update_project(project_id,
                progress=pct,
                progress_message=f"Expanding scenario: {scenario.get('title', sid)}...")

            try:
                config = _expand_single_scenario(
                    project_id, dossier, scenario, attack_path, cost_tracker, sid,
                )
                project_manager.save_scenario(project_id, sid, config)
                completed += 1
            except Exception as e:
                logger.error(f"Config expansion failed for {sid}: {e}")
                failed_scenarios.append(sid)

        cost_tracker.save(project_dir)

        if completed == 0:
            project_manager.update_project(project_id,
                status="failed",
                error_message=f"All scenario expansions failed: {failed_scenarios}",
                progress_message="Config generation failed.")
        else:
            msg = f"{completed} config(s) ready."
            if failed_scenarios:
                msg += f" ({len(failed_scenarios)} failed: {failed_scenarios})"
            project_manager.update_project(project_id,
                status="configs_ready", progress=100,
                progress_message=msg)

    except Exception as e:
        logger.error(f"Config expansion pipeline failed for {project_id}: {e}")
        project_manager.update_project(project_id,
            status="failed", error_message=str(e),
            progress_message="Config generation failed.")


def _expand_single_scenario(
    project_id: str,
    dossier: dict,
    scenario: dict,
    attack_path: dict | None,
    cost_tracker: CostTracker,
    scenario_id: str,
) -> dict:
    """Run 5 LLM calls to expand a scenario into a full SimulationConfig."""
    llm = LLMClient()
    company = dossier.get("company", {})
    company_name = company.get("name", "Company")

    def _track(description: str):
        if llm.last_usage:
            cost_tracker.track_llm(
                "config_expansion", llm.model,
                llm.last_usage["input_tokens"],
                llm.last_usage["output_tokens"],
                f"{scenario_id}_{description}",
            )

    # Call 5: Cascading Pressures
    cascading = _generate_cascading_pressures(llm, dossier, scenario, attack_path)
    _track("cascading_pressures")

    # Call 6: Timed Injects
    events = _generate_timed_injects(llm, scenario, attack_path, cascading)
    _track("timed_injects")

    # Call 7: Agent Personas
    agents = _generate_agent_personas(llm, dossier, scenario, cascading)
    _track("agent_personas")

    # Call 8: World Design
    worlds = _generate_worlds(llm, scenario, agents)
    _track("world_design")

    # Call 9: Time Config
    time_cfg = _generate_time_config(llm, scenario, attack_path, events)
    _track("time_config")

    # Assemble SimulationConfig (backward compatible)
    config = {
        "simulation_id": f"{project_id}_{scenario_id}_sim",
        "project_id": project_id,
        "company_name": company_name,
        "scenario": scenario.get("summary", ""),
        "total_rounds": time_cfg.get("total_rounds", 6),
        "hours_per_round": time_cfg.get("hours_per_round", 1.0),
        "agent_profiles": agents,
        "worlds": worlds,
        "pressures": cascading.get("pressures", []),
        "scheduled_events": events,
        # New optional fields
        "scenario_id": scenario_id,
        "attack_path": attack_path,
        "cascading_effects": cascading.get("cascading_effects", {}),
        "threat_actor_profile": scenario.get("title", ""),
    }
    return config


def _generate_cascading_pressures(llm: LLMClient, dossier: dict, scenario: dict, attack_path: dict | None) -> dict:
    """Call 5: Generate cascading 1st/2nd/3rd order effects and pressure configs."""
    compliance = dossier.get("compliance", [])
    org_roles = [r.get("title", "") for r in dossier.get("org", {}).get("roles", [])]
    path_text = json.dumps(attack_path, indent=2) if attack_path else "No specific attack path provided."

    prompt = f"""You are an incident response strategist. Analyze the cascading effects of this incident scenario and design the pressure configs.

## Scenario
Title: {scenario.get("title", "")}
Summary: {scenario.get("summary", "")}

## Attack Path
{path_text}

## Company Compliance Requirements
{", ".join(compliance)}

## Available Org Roles
{", ".join(org_roles[:15])}

Generate:
1. Cascading effects (1st, 2nd, 3rd order) — each order should have 2-4 effects
2. Pressure configs that map to these effects

Return ONLY valid JSON:
{{
  "cascading_effects": {{
    "first_order": ["Direct technical impact 1", "Direct technical impact 2"],
    "second_order": ["Business consequence 1", "Business consequence 2"],
    "third_order": ["External/reputational impact 1", "Regulatory impact 2"]
  }},
  "pressures": [
    {{
      "name": "GDPR 72-Hour Notification",
      "type": "countdown",
      "affects_roles": ["ciso", "legal_counsel", "dpo"],
      "hours": 72,
      "severity_at_50pct": "high",
      "severity_at_25pct": "critical"
    }}
  ]
}}

REQUIREMENTS:
- Include at least 3 pressures covering: regulatory, operational, and reputational/business
- Pressure types must be one of: countdown, deadline, threshold, triggered
- affects_roles must use role identifiers (lowercase, underscored) from the org roles above
- Each cascading order should escalate from the previous"""

    return llm.chat_json([{"role": "user", "content": prompt}])


def _generate_timed_injects(llm: LLMClient, scenario: dict, attack_path: dict | None, cascading: dict) -> list[dict]:
    """Call 6: Generate 6-10 timed injects with conditional branching."""
    kill_chain = attack_path.get("kill_chain", []) if attack_path else []
    effects = cascading.get("cascading_effects", {})

    prompt = f"""You are a tabletop exercise designer (CISA CTEP methodology). Design timed injects for this incident scenario.

## Scenario
{scenario.get("summary", "")}

## Kill Chain Steps
{json.dumps(kill_chain, indent=2)}

## Cascading Effects
{json.dumps(effects, indent=2)}

Generate 6-10 timed injects that follow the kill chain progression. For rounds 3 and later, add conditional branching where defender actions can change the outcome.

Return ONLY valid JSON — an array of injects:
[
  {{
    "round": 1,
    "description": "SIEM alert: unusual outbound traffic from payment gateway",
    "kill_chain_step": "initial_access",
    "condition": null
  }},
  {{
    "round": 3,
    "description": "Attacker pivots to customer DB — 50k records now accessible",
    "kill_chain_step": "lateral_movement",
    "condition": {{
      "unless": "containment_started",
      "keywords": ["isolate", "contain", "block", "quarantine"],
      "target_systems": ["payment", "gateway"],
      "alternative": "Attacker detected and blocked at network boundary — incident contained to payment systems"
    }}
  }}
]

REQUIREMENTS:
- Round 1-2: unconditional discovery events
- Round 3+: conditional events that branch based on defender actions
- Keywords in conditions must be action verbs defenders would use
- target_systems should be lowercase fragments that would appear in action args
- Each inject should reference a kill_chain_step from the chain above
- Alternatives should be meaningfully different outcomes, not just "nothing happens"
- Space injects across rounds — not all in round 1"""

    return llm.chat_json([{"role": "user", "content": prompt}])


def _generate_agent_personas(llm: LLMClient, dossier: dict, scenario: dict, cascading: dict) -> list[dict]:
    """Call 7: Select roles and generate rich personas for this scenario."""
    org = dossier.get("org", {})
    roles = org.get("roles", [])
    events = dossier.get("recentEvents") or dossier.get("recent_events", [])
    pressures = cascading.get("pressures", [])

    roles_text = "\n".join(
        f"- {r.get('name', '')} — {r.get('title', '?')} in {r.get('department', '?')}"
        + (f" ({r.get('responsibilities', '')})" if r.get("responsibilities") else "")
        for r in roles
    )
    events_text = "\n".join(
        f"- [{e.get('date', '?')}] {e.get('description', '')}"
        for e in events[:8]
    )

    prompt = f"""You are an organizational psychologist designing a crisis simulation. Select 5-8 people from this company who would be most critical during this incident, and give each a detailed persona.

## Scenario
{scenario.get("summary", "")}

## Available Roles
{roles_text}

## Recent Company Events (affects morale, context)
{events_text}

## Active Pressures During This Incident
{json.dumps([p.get("name", "") for p in pressures])}

For each agent, generate:
- A realistic full name (use real names from the org if available)
- A role ID (lowercase, underscored)
- A detailed persona (3-4 sentences): background, experience, communication style
- An incident_memory: their personal connection to or history with this type of incident
- A stress_profile: baseline stress (0-1) and escalation_rate (low/medium/high)
- A decision_bias: their tendency under pressure
- At least one tension with another agent on the team

Return ONLY valid JSON — an array of agents:
[
  {{
    "name": "Sarah Chen",
    "role": "interim_ciso",
    "persona": "Started 8 weeks ago after previous CISO departed during restructuring. Has 12 years of security experience but at smaller companies. Tends to over-document decisions as a defense mechanism. Communicates formally in email, more directly in Slack.",
    "incident_memory": "Has never led an IR at this company. Previous experience was at a 50-person startup where she was the entire security team.",
    "stress_profile": {{ "baseline": 0.6, "escalation_rate": "high" }},
    "decision_bias": "Tends to over-communicate and seek consensus, which can slow containment decisions"
  }}
]

REQUIREMENTS:
- 5-8 agents, covering: leadership, security operations, legal/compliance, communications, and technical responders
- Personas must reference specific company context (recent events, org changes, company size)
- Each agent should have a realistic reason to be stressed or conflicted during THIS scenario
- At least 2 pairs of agents should have natural tension (e.g., CISO wants containment, CEO wants uptime)
- incident_memory should be scenario-specific, not generic"""

    return llm.chat_json([{"role": "user", "content": prompt}])


def _generate_worlds(llm: LLMClient, scenario: dict, agents: list[dict]) -> list[dict]:
    """Call 8: Select communication platforms relevant to this scenario."""
    roles = [a.get("role", "") for a in agents]

    prompt = f"""You are designing the communication environment for an incident response simulation.

## Scenario Type
{scenario.get("title", "")}

## Agent Roles
{", ".join(roles)}

Select 2-4 communication platforms that are most relevant for THIS type of incident. Each platform should serve a distinct purpose.

Return ONLY valid JSON — an array:
[
  {{ "type": "slack", "name": "IR War Room" }},
  {{ "type": "email", "name": "Corporate Email" }}
]

Available platform types: slack, email, siem, servicenow, pagerduty, edr, teams
- slack: real-time coordination, quick decisions
- email: formal communication, external parties, legal
- siem: security monitoring, alert triage
- servicenow: ticket management, change requests
- pagerduty: on-call escalation
- edr: endpoint detection, forensics
- teams: cross-department collaboration

REQUIREMENTS:
- Always include slack (primary coordination) and email (formal/external)
- Add siem if scenario involves detection/monitoring
- Add others only if the scenario specifically needs them
- Each platform name should be descriptive of its role in THIS incident"""

    return llm.chat_json([{"role": "user", "content": prompt}])


def _generate_time_config(llm: LLMClient, scenario: dict, attack_path: dict | None, events: list[dict]) -> dict:
    """Call 9: Determine pacing for this scenario type."""
    num_injects = len(events)
    path_steps = len(attack_path.get("kill_chain", [])) if attack_path else 5

    prompt = f"""You are a simulation architect. Determine the appropriate pacing for this incident scenario.

## Scenario
{scenario.get("title", "")}
{scenario.get("summary", "")}

## Constraints
- Number of injects: {num_injects}
- Kill chain steps: {path_steps}
- Each round, every agent acts in every world once

Consider: How fast does this type of incident unfold in reality?
- Ransomware: hours (fast rounds, fewer rounds)
- Data exfiltration: days (slower rounds, more rounds)
- Supply chain: days to weeks (medium rounds)
- DDoS: minutes to hours (very fast rounds)

Return ONLY valid JSON:
{{
  "total_rounds": 6,
  "hours_per_round": 1.5,
  "reasoning": "Supply chain compromise unfolds over days..."
}}

REQUIREMENTS:
- total_rounds must be between 4 and 10
- hours_per_round must be between 0.5 and 4.0
- Enough rounds to fit all injects with breathing room
- The total simulated time (rounds × hours) should match the realistic incident duration"""

    return llm.chat_json([{"role": "user", "content": prompt}])
```

- [ ] **Step 2: Verify imports**

Run: `cd backend && uv run python -c "from app.services.config_expander import run_config_expansion; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/config_expander.py
git commit -m "feat: add config_expander service — 5-step per-scenario config generation"
```

---

### Task 4: Create comparative_report_agent.py

**Files:**
- Create: `backend/app/services/comparative_report_agent.py`

- [ ] **Step 1: Create comparative_report_agent.py**

```python
# backend/app/services/comparative_report_agent.py
"""
Comparative Report Agent — generates cross-scenario analysis after
multiple simulations complete for a project.
"""
import json
import threading
from pathlib import Path

from ..config import Config
from ..utils.llm_client import LLMClient
from ..utils.cost_tracker import CostTracker
from ..utils.logger import get_logger
from . import project_manager

logger = get_logger("comparative_report")

SIMULATIONS_DIR = Path(Config.UPLOAD_FOLDER) / "simulations"


def run_comparative_report(project_id: str) -> None:
    """Generate comparative report in a background thread."""
    thread = threading.Thread(target=_generate_comparative, args=(project_id,), daemon=True)
    thread.start()


def _generate_comparative(project_id: str) -> None:
    """Build the comparative analysis across all simulations for a project."""
    try:
        project = project_manager.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        sim_ids = project.get("sim_ids", [])
        if not sim_ids:
            # Backward compat: check singular sim_id
            if project.get("sim_id"):
                sim_ids = [project["sim_id"]]
            else:
                raise ValueError("No simulations found for project")

        analysis = project_manager.get_threat_analysis(project_id)

        # Collect data from each simulation
        sim_data = []
        for sid in sim_ids:
            sim_dir = SIMULATIONS_DIR / sid
            config_path = sim_dir / "config.json"
            report_path = sim_dir / "report.json"
            actions_path = sim_dir / "actions.jsonl"

            if not report_path.exists():
                logger.warning(f"No report for simulation {sid}, skipping")
                continue

            with open(config_path) as f:
                config = json.load(f)
            with open(report_path) as f:
                report = json.load(f)

            actions = []
            if actions_path.exists():
                with open(actions_path) as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                actions.append(json.loads(line))
                            except json.JSONDecodeError:
                                continue

            sim_data.append({
                "sim_id": sid,
                "scenario_title": config.get("threat_actor_profile", config.get("scenario", "")[:80]),
                "config": config,
                "report": report,
                "action_count": len(actions),
                "actions_summary": _summarize_actions(actions),
            })

        if len(sim_data) < 2:
            raise ValueError(f"Need at least 2 completed simulations for comparison, got {len(sim_data)}")

        # Cost tracking
        cost_tracker = CostTracker(f"comparative_{project_id}")

        llm = LLMClient()

        # Build the comparison prompt
        scenarios_text = ""
        for sd in sim_data:
            report = sd["report"]
            scenarios_text += f"\n## Scenario: {sd['scenario_title']}\n"
            scenarios_text += f"Actions: {sd['action_count']}\n"
            scenarios_text += f"Executive Summary: {report.get('executiveSummary', 'N/A')[:1000]}\n"
            scenarios_text += f"Communication Analysis: {report.get('communicationAnalysis', 'N/A')[:500]}\n"
            scenarios_text += f"Tensions: {report.get('tensions', 'N/A')[:500]}\n"
            scores = report.get("agentScores", [])
            if scores:
                scenarios_text += "Agent Scores:\n"
                for s in scores:
                    scenarios_text += f"  - {s.get('name', '?')} ({s.get('role', '?')}): {s.get('score', '?')}/10\n"
            recs = report.get("recommendations", [])
            if recs:
                scenarios_text += f"Recommendations: {json.dumps(recs[:5])}\n"
            scenarios_text += f"Actions Summary: {sd['actions_summary'][:500]}\n"

        prompt = f"""You are a senior security consultant writing an executive-level comparative analysis across multiple incident response simulations for the same company.

{scenarios_text}

Generate a comprehensive comparative report with these sections:

1. EXECUTIVE SUMMARY (2-3 paragraphs): The big picture — what did we learn across all scenarios?
2. COMPARISON MATRIX: For each scenario, rate (1-10) these dimensions: response_speed, containment_effectiveness, communication_quality, compliance_adherence, leadership_decisiveness
3. CONSISTENT WEAKNESSES: What failed in EVERY scenario? These are structural problems.
4. SCENARIO-SPECIFIC FINDINGS: What was unique about each scenario's response?
5. PRIORITY RECOMMENDATIONS: Ranked by how many scenarios they would improve. Each must reference which scenarios it addresses.

Return ONLY valid JSON:
{{
  "executive_summary": "...",
  "comparison_matrix": [
    {{
      "scenario": "Scenario Title",
      "response_speed": 7,
      "containment_effectiveness": 5,
      "communication_quality": 6,
      "compliance_adherence": 4,
      "leadership_decisiveness": 8
    }}
  ],
  "consistent_weaknesses": ["Weakness 1...", "Weakness 2..."],
  "scenario_findings": [
    {{
      "scenario": "Scenario Title",
      "strengths": ["..."],
      "weaknesses": ["..."],
      "notable_moments": ["..."]
    }}
  ],
  "recommendations": [
    {{
      "priority": 1,
      "recommendation": "...",
      "addresses_scenarios": ["Scenario A", "Scenario B"],
      "impact": "high"
    }}
  ]
}}"""

        result = llm.chat_json([{"role": "user", "content": prompt}])
        if llm.last_usage:
            cost_tracker.track_llm(
                "comparative_report", llm.model,
                llm.last_usage["input_tokens"],
                llm.last_usage["output_tokens"],
                "comparative_analysis",
            )

        # Save
        out_dir = SIMULATIONS_DIR / f"comparative_{project_id}"
        out_dir.mkdir(parents=True, exist_ok=True)
        result["project_id"] = project_id
        result["sim_ids"] = [sd["sim_id"] for sd in sim_data]
        result["status"] = "complete"
        with open(out_dir / "report.json", "w") as f:
            json.dump(result, f, indent=2)
        cost_tracker.save(str(out_dir))

        logger.info(f"Comparative report generated for {project_id}")

    except Exception as e:
        logger.error(f"Comparative report failed for {project_id}: {e}")
        out_dir = SIMULATIONS_DIR / f"comparative_{project_id}"
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(out_dir / "report.json", "w") as f:
            json.dump({"project_id": project_id, "status": "failed", "error": str(e)}, f)


def _summarize_actions(actions: list[dict]) -> str:
    """Compact summary of simulation actions for the LLM prompt."""
    by_round: dict[int, list[str]] = {}
    for a in actions:
        r = a.get("round", 0)
        by_round.setdefault(r, [])
        detail = ""
        if a.get("action") == "send_message":
            detail = a.get("args", {}).get("content", "")[:100]
        elif a.get("action") == "send_email":
            detail = f"Email: {a.get('args', {}).get('subject', '')}"
        else:
            detail = a.get("action", "?")
        by_round[r].append(f"[{a.get('agent', '?')}] {detail}")

    lines = []
    for r in sorted(by_round.keys()):
        lines.append(f"Round {r}: {'; '.join(by_round[r][:5])}")
    return "\n".join(lines[:10])
```

- [ ] **Step 2: Verify imports**

Run: `cd backend && uv run python -c "from app.services.comparative_report_agent import run_comparative_report; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/comparative_report_agent.py
git commit -m "feat: add comparative_report_agent for cross-scenario analysis"
```

---

### Task 5: Add new API endpoints to crucible.py

**Files:**
- Modify: `backend/app/api/crucible.py`

6 new route handlers. All existing routes stay unchanged.

- [ ] **Step 1: Add the 6 new endpoints**

Add these after the existing `patch_project` endpoint at the bottom of `crucible.py`:

```python
# --- Predictive pipeline endpoints ---

@crucible_bp.route("/projects/<project_id>/scenarios", methods=["GET"])
def get_scenarios(project_id):
    """Get scenario variants from threat analysis."""
    analysis = project_manager.get_threat_analysis(project_id)
    if not analysis:
        return jsonify({"error": "Threat analysis not found"}), 404
    return jsonify({"data": {
        "scenarios": analysis.get("scenarios", []),
        "uncertainty_axes": analysis.get("uncertainty_axes", {}),
        "attack_paths": analysis.get("attack_paths", []),
    }})


@crucible_bp.route("/projects/<project_id>/generate-configs", methods=["POST"])
def generate_configs(project_id):
    """Trigger config expansion for selected scenarios."""
    data = request.get_json()
    if not data or "scenario_ids" not in data:
        return jsonify({"error": "scenario_ids required"}), 400

    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    from ..services.config_expander import run_config_expansion
    run_config_expansion(project_id, data["scenario_ids"])
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/projects/<project_id>/configs", methods=["GET"])
def get_project_configs(project_id):
    """Get all expanded scenario configs."""
    configs = project_manager.get_all_scenarios(project_id)
    return jsonify({"data": configs})


@crucible_bp.route("/projects/<project_id>/launch", methods=["POST"])
def launch_project_simulations(project_id):
    """Launch all ready configs as separate simulations."""
    configs = project_manager.get_all_scenarios(project_id)
    if not configs:
        return jsonify({"error": "No configs ready"}), 404

    sim_ids = []
    for config in configs:
        sim_id = launch_simulation(config)
        sim_ids.append(sim_id)

    # Store sim_ids on the project
    project_manager.update_project(project_id, sim_ids=sim_ids)

    return jsonify({"data": {"sim_ids": sim_ids}}), 201


@crucible_bp.route("/projects/<project_id>/comparative-report", methods=["POST"])
def trigger_comparative_report(project_id):
    """Trigger comparative report generation."""
    from ..services.comparative_report_agent import run_comparative_report
    run_comparative_report(project_id)
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/projects/<project_id>/comparative-report", methods=["GET"])
def get_comparative_report(project_id):
    """Get the comparative report."""
    report_path = Path(__file__).parent.parent.parent / "uploads" / "simulations" / f"comparative_{project_id}" / "report.json"
    if not report_path.exists():
        return jsonify({"data": {"status": "generating"}}), 200
    with open(report_path) as f:
        report = json.load(f)
    return jsonify({"data": report})
```

- [ ] **Step 2: Verify all existing endpoints still work**

Run: `cd backend && uv run python -c "from app.api.crucible import crucible_bp; print(f'{len(crucible_bp.deferred_functions)} routes registered')"`
Expected: prints route count (should be existing + 6 new).

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/crucible.py
git commit -m "feat: add 6 new API endpoints for predictive pipeline"
```

---

### Task 6: Modify simulation runner — conditional inject evaluation

**Files:**
- Modify: `backend/scripts/run_crucible_simulation.py`

Two changes: (1) store full event dicts instead of strings, (2) add conditional inject evaluation.

- [ ] **Step 1: Add _evaluate_condition function**

Add after the existing `_call_llm` function (around line 143):

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

- [ ] **Step 2: Change scheduled event parsing to store full dicts**

Find this code (around line 295-298):

```python
    for event in config.get("scheduled_events", []):
        r = event["round"]
        scheduled_events.setdefault(r, []).append(event["description"])
```

Replace with:

```python
    for event in config.get("scheduled_events", []):
        r = event["round"]
        scheduled_events.setdefault(r, []).append(event)
```

- [ ] **Step 3: Update the inject handling in the round loop**

Find this code (around line 306-313):

```python
            if round_num in scheduled_events:
                for event_desc in scheduled_events[round_num]:
                    active_events.append(event_desc)
                    # Add to all world histories so agents see it
                    for wn in world_history:
                        world_history[wn].append(
                            f"🚨 [SYSTEM ALERT] {event_desc}"
                        )
                    print(f"\n🚨 INJECT: {event_desc}")
```

Replace with:

```python
            if round_num in scheduled_events:
                for event in scheduled_events[round_num]:
                    # Resolve inject text (conditional or plain)
                    if isinstance(event, dict) and event.get("condition"):
                        condition_met = _evaluate_condition(event["condition"], all_actions)
                        inject_text = event["condition"]["alternative"] if condition_met else event["description"]
                    elif isinstance(event, dict):
                        inject_text = event.get("description", str(event))
                    else:
                        inject_text = str(event)  # backward compat

                    active_events.append(inject_text)
                    for wn in world_history:
                        world_history[wn].append(
                            f"🚨 [SYSTEM ALERT] {inject_text}"
                        )
                    print(f"\n🚨 INJECT: {inject_text}")
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/run_crucible_simulation.py
git commit -m "feat: add conditional inject evaluation to simulation runner"
```

---

### Task 7: Extend frontend types

**Files:**
- Modify: `frontend/app/types/simulation.ts`
- Modify: `frontend/app/types/project.ts`

- [ ] **Step 1: Add new types to simulation.ts**

Add after the existing `ScheduledEvent` interface:

```typescript
export interface KillChainStep {
  step: number;
  tactic: string;
  technique: string;
  target: string;
  description: string;
}

export interface ConditionalInject {
  unless: string;
  keywords: string[];
  targetSystems: string[];
  alternative: string;
}
```

Extend existing interfaces with optional fields:

In `SimulationConfig`, add after `scheduledEvents`:
```typescript
  scenarioId?: string;
  attackPath?: { killChain: KillChainStep[] };
  cascadingEffects?: { firstOrder: string[]; secondOrder: string[]; thirdOrder: string[] };
  threatActorProfile?: string;
```

In `ScheduledEvent`, add after `description`:
```typescript
  killChainStep?: string;
  condition?: ConditionalInject;
```

In `AgentConfig`, add after `persona`:
```typescript
  stressProfile?: { baseline: number; escalationRate: string };
  incidentMemory?: string;
  decisionBias?: string;
```

- [ ] **Step 2: Extend project.ts**

Update `Project` interface status union to include new statuses:
```typescript
  status: "researching" | "research_complete" | "analyzing_threats" | "scenarios_ready" | "generating_config" | "config_ready" | "generating_configs" | "configs_ready" | "failed";
```

Add `simIds` field after `simId`:
```typescript
  simIds?: string[];
```

Add new types for scenario selection:

```typescript
export interface ScenarioVariant {
  id: string;
  title: string;
  probability: number;
  severity: string;
  summary: string;
  affectedTeams: string[];
  attackPathId: string;
  quadrant: string;
  evidence: string[];
}

export interface ThreatAnalysisResponse {
  scenarios: ScenarioVariant[];
  uncertaintyAxes: {
    axis1: { name: string; low: string; high: string };
    axis2: { name: string; low: string; high: string };
  };
  attackPaths: Array<{
    id: string;
    title: string;
    killChain: KillChainStep[];
    expectedOutcome: string;
  }>;
}

export interface ComparativeReport {
  projectId: string;
  simIds: string[];
  status: string;
  executiveSummary?: string;
  comparisonMatrix?: Array<{
    scenario: string;
    responseSpeed: number;
    containmentEffectiveness: number;
    communicationQuality: number;
    complianceAdherence: number;
    leadershipDecisiveness: number;
  }>;
  consistentWeaknesses?: string[];
  scenarioFindings?: Array<{
    scenario: string;
    strengths: string[];
    weaknesses: string[];
    notableMoments: string[];
  }>;
  recommendations?: Array<{
    priority: number;
    recommendation: string;
    addressesScenarios: string[];
    impact: string;
  }>;
  error?: string;
}
```

- [ ] **Step 3: Update types/index.ts export**

The existing `export * from "./project"` already covers the new types. No change needed.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/types/simulation.ts frontend/app/types/project.ts
git commit -m "feat: extend frontend types for predictive pipeline"
```

---

### Task 8: Create frontend server actions for scenarios

**Files:**
- Create: `frontend/app/actions/scenarios.ts`
- Modify: `frontend/app/actions/simulation.ts` (passthrough new fields)
- Modify: `frontend/app/actions/report.ts` (comparative report actions)

- [ ] **Step 1: Create scenarios.ts**

```typescript
// frontend/app/actions/scenarios.ts
"use server";

import { fetchApi } from "@/app/lib/api";
import type { ThreatAnalysisResponse, SimulationConfig, ScenarioVariant } from "@/app/types";

export async function getScenarios(
  projectId: string
): Promise<{ data: ThreatAnalysisResponse } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(
    `/api/crucible/projects/${projectId}/scenarios`
  );
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      scenarios: ((d.scenarios as Array<Record<string, unknown>>) || []).map((s) => ({
        id: (s.id as string) || "",
        title: (s.title as string) || "",
        probability: (s.probability as number) || 0,
        severity: (s.severity as string) || "medium",
        summary: (s.summary as string) || "",
        affectedTeams: (s.affected_teams as string[]) || [],
        attackPathId: (s.attack_path_id as string) || "",
        quadrant: (s.quadrant as string) || "",
        evidence: (s.evidence as string[]) || [],
      })),
      uncertaintyAxes: d.uncertainty_axes as ThreatAnalysisResponse["uncertaintyAxes"],
      attackPaths: ((d.attack_paths as Array<Record<string, unknown>>) || []).map((p) => ({
        id: (p.id as string) || "",
        title: (p.title as string) || "",
        killChain: ((p.kill_chain as Array<Record<string, unknown>>) || []).map((k) => ({
          step: (k.step as number) || 0,
          tactic: (k.tactic as string) || "",
          technique: (k.technique as string) || "",
          target: (k.target as string) || "",
          description: (k.description as string) || "",
        })),
        expectedOutcome: (p.expected_outcome as string) || "",
      })),
    },
  };
}

export async function generateConfigs(
  projectId: string,
  scenarioIds: string[]
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(
    `/api/crucible/projects/${projectId}/generate-configs`,
    { method: "POST", body: JSON.stringify({ scenario_ids: scenarioIds }) }
  );
}

export async function getConfigs(
  projectId: string
): Promise<{ data: SimulationConfig[] } | { error: string }> {
  const result = await fetchApi<Array<Record<string, unknown>>>(
    `/api/crucible/projects/${projectId}/configs`
  );
  if ("error" in result) return result;
  // Configs are full SimulationConfig dicts in snake_case
  return {
    data: result.data.map((d) => ({
      simulationId: d.simulation_id as string | undefined,
      projectId: d.project_id as string | undefined,
      companyName: (d.company_name as string) || "",
      scenario: (d.scenario as string) || "",
      totalRounds: (d.total_rounds as number) || 5,
      hoursPerRound: (d.hours_per_round as number) || 1.0,
      scenarioId: d.scenario_id as string | undefined,
      threatActorProfile: d.threat_actor_profile as string | undefined,
      agents: ((d.agent_profiles as Array<Record<string, unknown>>) || []).map((a) => ({
        name: (a.name as string) || "",
        role: (a.role as string) || "",
        persona: (a.persona as string) || "",
        stressProfile: a.stress_profile as { baseline: number; escalationRate: string } | undefined,
        incidentMemory: a.incident_memory as string | undefined,
        decisionBias: a.decision_bias as string | undefined,
      })),
      worlds: ((d.worlds as Array<Record<string, string>>) || []).map((w) => ({
        type: w.type || "",
        name: w.name || "",
      })),
      pressures: ((d.pressures as Array<Record<string, unknown>>) || []).map((p) => ({
        name: (p.name as string) || "",
        type: p.type as "countdown" | "deadline" | "threshold" | "triggered",
        affectsRoles: (p.affects_roles as string[]) || [],
        hours: p.hours as number | undefined,
        hoursUntil: p.hours_until as number | undefined,
        value: p.value as number | undefined,
        unit: p.unit as string | undefined,
        triggeredBy: p.triggered_by as string | undefined,
        severityAt50pct: (p.severity_at_50pct as string) || "high",
        severityAt25pct: (p.severity_at_25pct as string) || "critical",
      })),
      scheduledEvents: ((d.scheduled_events as Array<Record<string, unknown>>) || []).map((e) => ({
        round: (e.round as number) || 0,
        description: (e.description as string) || "",
        killChainStep: e.kill_chain_step as string | undefined,
        condition: e.condition as SimulationConfig["scheduledEvents"][0]["condition"],
      })),
    })),
  };
}

export async function launchScenarios(
  projectId: string
): Promise<{ data: { simIds: string[] } } | { error: string }> {
  const result = await fetchApi<{ sim_ids: string[] }>(
    `/api/crucible/projects/${projectId}/launch`,
    { method: "POST" }
  );
  if ("error" in result) return result;
  return { data: { simIds: result.data.sim_ids } };
}
```

- [ ] **Step 2: Add comparative report actions to report.ts**

Add to the bottom of `frontend/app/actions/report.ts`:

```typescript
// --- Comparative report ---

export interface ComparativeReportResponse {
  projectId: string;
  simIds: string[];
  status: string;
  executiveSummary?: string;
  comparisonMatrix?: Array<{
    scenario: string;
    responseSpeed: number;
    containmentEffectiveness: number;
    communicationQuality: number;
    complianceAdherence: number;
    leadershipDecisiveness: number;
  }>;
  consistentWeaknesses?: string[];
  scenarioFindings?: Array<{
    scenario: string;
    strengths: string[];
    weaknesses: string[];
    notableMoments: string[];
  }>;
  recommendations?: Array<{
    priority: number;
    recommendation: string;
    addressesScenarios: string[];
    impact: string;
  }>;
  error?: string;
}

export async function generateComparativeReport(
  projectId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(
    `/api/crucible/projects/${projectId}/comparative-report`,
    { method: "POST" }
  );
}

export async function getComparativeReport(
  projectId: string
): Promise<{ data: ComparativeReportResponse } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(
    `/api/crucible/projects/${projectId}/comparative-report`
  );
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      projectId: (d.project_id as string) || projectId,
      simIds: (d.sim_ids as string[]) || [],
      status: (d.status as string) || "generating",
      executiveSummary: d.executive_summary as string | undefined,
      comparisonMatrix: ((d.comparison_matrix as Array<Record<string, unknown>>) || []).map((m) => ({
        scenario: (m.scenario as string) || "",
        responseSpeed: (m.response_speed as number) || 0,
        containmentEffectiveness: (m.containment_effectiveness as number) || 0,
        communicationQuality: (m.communication_quality as number) || 0,
        complianceAdherence: (m.compliance_adherence as number) || 0,
        leadershipDecisiveness: (m.leadership_decisiveness as number) || 0,
      })),
      consistentWeaknesses: d.consistent_weaknesses as string[] | undefined,
      scenarioFindings: ((d.scenario_findings as Array<Record<string, unknown>>) || []).map((sf) => ({
        scenario: (sf.scenario as string) || "",
        strengths: (sf.strengths as string[]) || [],
        weaknesses: (sf.weaknesses as string[]) || [],
        notableMoments: (sf.notable_moments as string[]) || [],
      })),
      recommendations: ((d.recommendations as Array<Record<string, unknown>>) || []).map((r) => ({
        priority: (r.priority as number) || 0,
        recommendation: (r.recommendation as string) || "",
        addressesScenarios: (r.addresses_scenarios as string[]) || [],
        impact: (r.impact as string) || "",
      })),
      error: d.error as string | undefined,
    },
  };
}
```

- [ ] **Step 3: Update launchSimulation to pass through new optional fields**

In `frontend/app/actions/simulation.ts`, update the `launchSimulation` function payload to include new optional fields. After the existing `scheduled_events` mapping, add:

```typescript
    // New optional fields (pass through if present)
    scenario_id: config.scenarioId,
    attack_path: config.attackPath ? {
      kill_chain: config.attackPath.killChain.map((k) => ({
        step: k.step,
        tactic: k.tactic,
        technique: k.technique,
        target: k.target,
        description: k.description,
      })),
    } : undefined,
    cascading_effects: config.cascadingEffects ? {
      first_order: config.cascadingEffects.firstOrder,
      second_order: config.cascadingEffects.secondOrder,
      third_order: config.cascadingEffects.thirdOrder,
    } : undefined,
    threat_actor_profile: config.threatActorProfile,
```

And update the `scheduled_events` mapping to include new fields:

```typescript
    scheduled_events: config.scheduledEvents.map((e) => ({
      round: e.round,
      description: e.description,
      kill_chain_step: e.killChainStep,
      condition: e.condition ? {
        unless: e.condition.unless,
        keywords: e.condition.keywords,
        target_systems: e.condition.targetSystems,
        alternative: e.condition.alternative,
      } : undefined,
    })),
```

And update the `agent_profiles` mapping to include new fields:

```typescript
    agent_profiles: config.agents.map((a) => ({
      name: a.name,
      role: a.role,
      persona: a.persona,
      stress_profile: a.stressProfile,
      incident_memory: a.incidentMemory,
      decision_bias: a.decisionBias,
    })),
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/actions/scenarios.ts frontend/app/actions/report.ts frontend/app/actions/simulation.ts
git commit -m "feat: add frontend server actions for predictive pipeline"
```

---

### Task 9: Create ScenarioCards component

**Files:**
- Create: `frontend/app/components/configure/ScenarioCards.tsx`

- [ ] **Step 1: Create the scenario selection component**

This shows 3-4 scenario cards with probability badges, severity, summary, and checkboxes for selection.

```typescript
// frontend/app/components/configure/ScenarioCards.tsx
"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import type { ScenarioVariant } from "@/app/types";

const severityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

interface ScenarioCardsProps {
  scenarios: ScenarioVariant[];
  onGenerate: (scenarioIds: string[]) => void;
  generating: boolean;
}

export default function ScenarioCards({ scenarios, onGenerate, generating }: ScenarioCardsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else if (next.size < 3) {
      next.add(id);
    }
    setSelected(next);
  };

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            className={`text-left rounded-lg border-2 p-4 transition-colors ${
              selected.has(s.id)
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-sm leading-tight">{s.title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${severityColors[s.severity] || severityColors.medium}`}>
                {s.severity}
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground font-mono">
              <span>{Math.round(s.probability * 100)}% likely</span>
              <span>·</span>
              <span>{s.affectedTeams.join(", ")}</span>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-3">{s.summary}</p>

            {s.evidence.length > 0 && (
              <div className="text-xs text-muted-foreground/70">
                <span className="font-medium">Evidence:</span>
                <ul className="mt-1 space-y-0.5">
                  {s.evidence.slice(0, 3).map((e, i) => (
                    <li key={i} className="pl-2 border-l-2 border-muted">{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selected.size === 0
            ? "Select 1-3 scenarios to simulate"
            : `${selected.size} scenario${selected.size > 1 ? "s" : ""} selected`}
        </p>
        <Button
          onClick={() => onGenerate(Array.from(selected))}
          disabled={selected.size === 0 || generating}
        >
          {generating ? "Generating..." : "Generate Configs"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/components/configure/ScenarioCards.tsx
git commit -m "feat: add ScenarioCards component for scenario selection"
```

---

### Task 10: Extend configure project page for new statuses

**Files:**
- Modify: `frontend/app/configure/project/[projectId]/page.tsx`

This is the most complex frontend change. The page needs to handle `analyzing_threats`, `scenarios_ready`, `generating_configs`, and `configs_ready` statuses.

- [ ] **Step 1: Add imports and state for new features**

Add to the existing imports at the top of the file:

```typescript
import ScenarioCards from "@/app/components/configure/ScenarioCards";
import { getScenarios, generateConfigs, getConfigs, launchScenarios } from "@/app/actions/scenarios";
import type { ScenarioVariant, SimulationConfig as FullConfig } from "@/app/types";
```

Add new state variables alongside the existing ones:

```typescript
  const [scenarios, setScenarios] = useState<ScenarioVariant[]>([]);
  const [configs, setConfigs] = useState<FullConfig[]>([]);
  const [activeConfigIdx, setActiveConfigIdx] = useState(0);
  const [generatingConfigs, setGeneratingConfigs] = useState(false);
```

- [ ] **Step 2: Extend the useEffect for new statuses**

In the `load` function inside the first `useEffect`, after the existing `config_ready` handling, add cases for new statuses:

```typescript
      if (statusResult.data.status === "scenarios_ready") {
        const scenarioResult = await getScenarios(projectId);
        if ("data" in scenarioResult) {
          setScenarios(scenarioResult.data.scenarios);
        }
      }

      if (statusResult.data.status === "configs_ready") {
        const configsResult = await getConfigs(projectId);
        if ("data" in configsResult) {
          setConfigs(configsResult.data);
          if (configsResult.data.length > 0) {
            setConfig(configsResult.data[0]);
          }
        }
      }
```

- [ ] **Step 3: Extend the polling useEffect for new statuses**

The existing polling watches for `generating_config`. Add `analyzing_threats` and `generating_configs` to the polling condition:

```typescript
  useEffect(() => {
    if (!project || !["generating_config", "analyzing_threats", "generating_configs"].includes(project.status)) return;
    const interval = setInterval(async () => {
      const result = await getProjectStatus(projectId);
      if ("data" in result) {
        setProject(result.data);
        if (result.data.status === "config_ready") {
          const configResult = await getProjectConfig(projectId);
          if ("data" in configResult) setConfig(configResult.data);
        }
        if (result.data.status === "scenarios_ready") {
          const scenarioResult = await getScenarios(projectId);
          if ("data" in scenarioResult) setScenarios(scenarioResult.data.scenarios);
        }
        if (result.data.status === "configs_ready") {
          const configsResult = await getConfigs(projectId);
          if ("data" in configsResult) {
            setConfigs(configsResult.data);
            if (configsResult.data.length > 0) setConfig(configsResult.data[0]);
          }
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [project?.status, projectId]);
```

- [ ] **Step 4: Add handler functions**

Add after the existing `handleLaunch`:

```typescript
  const handleGenerateConfigs = async (scenarioIds: string[]) => {
    setGeneratingConfigs(true);
    const result = await generateConfigs(projectId, scenarioIds);
    if ("error" in result) {
      setError(result.error);
      setGeneratingConfigs(false);
      return;
    }
    // Polling will pick up the status change
    setProject((prev) => prev ? { ...prev, status: "generating_configs" } : prev);
  };

  const handleLaunchAll = async () => {
    setLaunching(true);
    const result = await launchScenarios(projectId);
    if ("error" in result) {
      setError(result.error);
      setLaunching(false);
      return;
    }
    // Navigate to first simulation
    if (result.data.simIds.length > 0) {
      router.push(`/simulation/${result.data.simIds[0]}`);
    }
  };
```

- [ ] **Step 5: Add JSX for new statuses in the render**

In the main return JSX, add sections for the new statuses. Before the existing config display section, add:

```tsx
        {/* Threat Analysis in progress */}
        {project?.status === "analyzing_threats" && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Threat Analysis</h2>
            <div className="rounded-lg border p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">{project.progressMessage}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${project.progress}%` }} />
              </div>
            </div>
          </section>
        )}

        {/* Scenario Selection */}
        {project?.status === "scenarios_ready" && scenarios.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Scenario Variants</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select 1-3 scenarios to simulate. Each will generate a separate simulation with its own config.
            </p>
            <ScenarioCards
              scenarios={scenarios}
              onGenerate={handleGenerateConfigs}
              generating={generatingConfigs}
            />
          </section>
        )}

        {/* Config Generation in progress */}
        {project?.status === "generating_configs" && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Generating Configs</h2>
            <div className="rounded-lg border p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">{project.progressMessage}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${project.progress}%` }} />
              </div>
            </div>
          </section>
        )}

        {/* Multi-config review with tabs */}
        {project?.status === "configs_ready" && configs.length > 0 && (
          <section className="mb-8">
            {configs.length > 1 && (
              <div className="flex gap-2 mb-4">
                {configs.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setActiveConfigIdx(i); setConfig(c); }}
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                      i === activeConfigIdx
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    {c.threatActorProfile || c.scenarioId || `Scenario ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
```

Update the launch button to use `handleLaunchAll` when in `configs_ready` status:

In the existing launch button section, wrap with a condition:

```tsx
        {(project?.status === "configs_ready" || project?.status === "config_ready") && config && (
          /* existing config display (AgentCards, WorldList, etc.) */
          /* Change the launch button onClick: */
          <Button onClick={project.status === "configs_ready" ? handleLaunchAll : handleLaunch} disabled={launching}>
            {launching ? "Launching..." : configs.length > 1 ? `Launch All (${configs.length} scenarios)` : "Launch Simulation"}
          </Button>
        )}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/configure/project/[projectId]/page.tsx
git commit -m "feat: extend configure page for threat analysis and scenario selection"
```

---

### Task 11: Create comparative report page

**Files:**
- Create: `frontend/app/report/comparative/[projectId]/page.tsx`

- [ ] **Step 1: Create the comparative report page**

```typescript
// frontend/app/report/comparative/[projectId]/page.tsx
"use client";

import { useEffect, useState, use } from "react";
import Header from "@/app/components/layout/Header";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import { Button } from "@/app/components/ui/button";
import { generateComparativeReport, getComparativeReport } from "@/app/actions/report";
import type { ComparativeReportResponse } from "@/app/actions/report";
import ReactMarkdown from "react-markdown";

export default function ComparativeReportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [report, setReport] = useState<ComparativeReportResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await getComparativeReport(projectId);
      if ("data" in result) {
        setReport(result.data);
        if (result.data.status === "generating") setGenerating(true);
      }
    };
    load();
  }, [projectId]);

  // Poll while generating
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(async () => {
      const result = await getComparativeReport(projectId);
      if ("data" in result && result.data.status === "complete") {
        setReport(result.data);
        setGenerating(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [generating, projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    const result = await generateComparativeReport(projectId);
    if ("error" in result) {
      setError(result.error);
      setGenerating(false);
    }
  };

  const dimensionLabels: Record<string, string> = {
    responseSpeed: "Response Speed",
    containmentEffectiveness: "Containment",
    communicationQuality: "Communication",
    complianceAdherence: "Compliance",
    leadershipDecisiveness: "Leadership",
  };

  return (
    <>
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <Breadcrumbs items={[
          { label: "Home", href: "/" },
          { label: "Comparative Analysis" },
        ]} />

        <h1 className="text-2xl font-bold mb-6">Comparative Analysis</h1>

        {!report?.executiveSummary && !generating && (
          <div className="rounded-lg border p-8 text-center">
            <p className="text-muted-foreground mb-4">
              Generate a comparative analysis across all simulations for this project.
            </p>
            <Button onClick={handleGenerate}>Generate Comparative Report</Button>
          </div>
        )}

        {generating && (
          <div className="rounded-lg border p-6 flex items-center gap-3">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Generating comparative analysis...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {report?.status === "complete" && (
          <div className="space-y-8">
            {/* Executive Summary */}
            {report.executiveSummary && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Executive Summary</h2>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{report.executiveSummary}</ReactMarkdown>
                </div>
              </section>
            )}

            {/* Comparison Matrix */}
            {report.comparisonMatrix && report.comparisonMatrix.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Scenario Comparison</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 border-b font-medium">Scenario</th>
                        {Object.entries(dimensionLabels).map(([key, label]) => (
                          <th key={key} className="text-center p-2 border-b font-medium">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.comparisonMatrix.map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2 font-medium">{row.scenario}</td>
                          {Object.keys(dimensionLabels).map((key) => {
                            const val = row[key as keyof typeof row] as number;
                            const color = val >= 7 ? "text-green-700" : val >= 4 ? "text-yellow-700" : "text-red-700";
                            return (
                              <td key={key} className={`text-center p-2 font-mono font-medium ${color}`}>
                                {val}/10
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Consistent Weaknesses */}
            {report.consistentWeaknesses && report.consistentWeaknesses.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Consistent Weaknesses</h2>
                <p className="text-sm text-muted-foreground mb-2">Issues found across ALL scenarios — structural problems to address.</p>
                <ul className="space-y-2">
                  {report.consistentWeaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-destructive mt-0.5 font-bold">!</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Recommendations */}
            {report.recommendations && report.recommendations.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Priority Recommendations</h2>
                <div className="space-y-3">
                  {report.recommendations.map((rec, i) => (
                    <div key={i} className="rounded-lg border p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">
                          P{rec.priority}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Addresses: {rec.addressesScenarios.join(", ")}
                        </span>
                      </div>
                      <p className="text-sm">{rec.recommendation}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/report/comparative/[projectId]/page.tsx
git commit -m "feat: add comparative report page"
```

---

### Task 12: Extend project status action for backward compatibility

**Files:**
- Modify: `frontend/app/actions/project.ts`

- [ ] **Step 1: Add simIds to the getProjectStatus transform**

In the `getProjectStatus` function, add after the `simId` line:

```typescript
      simIds: (d.sim_ids as string[]) || [],
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/actions/project.ts
git commit -m "feat: add simIds to project status transform"
```

---

### Task 13: End-to-end verification

- [ ] **Step 1: Verify backend imports**

Run: `cd backend && uv run python -c "from app.services.threat_analyzer import run_threat_analysis; from app.services.config_expander import run_config_expansion; from app.services.comparative_report_agent import run_comparative_report; from app.api.crucible import crucible_bp; print('All imports OK')"`
Expected: `All imports OK`

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Verify existing preset flow still works**

Run: `cd backend && uv run python -c "from app.services.crucible_manager import list_presets, get_preset_config; print(f'Presets: {len(list_presets())}'); print('Preset flow OK')"`
Expected: `Presets: 1` (or more) and `Preset flow OK`

- [ ] **Step 4: Verify existing config generator still works**

Run: `cd backend && uv run python -c "from app.services.config_generator import run_config_generation; print('Legacy config gen OK')"`
Expected: `Legacy config gen OK`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete predictive config generation pipeline

Multi-step pipeline replaces single-shot config generation:
- Phase 2: threat_analyzer.py (4 focused LLM calls)
- Phase 4: config_expander.py (5 LLM calls per scenario)
- Phase 7: comparative_report_agent.py
- 6 new API endpoints
- Conditional inject evaluation in simulation runner
- Scenario selection UI + comparative report page
- All existing functionality preserved"
```
