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


def _extract_list(result) -> list:
    """Extract a list from chat_json result — handles wrapper objects."""
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        for v in result.values():
            if isinstance(v, list):
                return v
    return []


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

    # Normalize agent profiles — LLM sometimes uses "role_id" instead of "role"
    for agent in agents:
        if "role_id" in agent and "role" not in agent:
            agent["role"] = agent.pop("role_id")
        if "role" not in agent:
            agent["role"] = agent.get("name", "unknown").lower().replace(" ", "_")

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

    return _extract_list(llm.chat_json([{"role": "user", "content": prompt}]))


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

    return _extract_list(llm.chat_json([{"role": "user", "content": prompt}]))


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

ONLY these platform types are available (no others exist):
- slack: real-time coordination, quick decisions, incident war rooms
- email: formal communication, external parties, legal, regulatory disclosure

REQUIREMENTS:
- Always include slack and email (exactly 2 platforms)
- Do NOT use any other type (no pagerduty, siem, servicenow, edr, teams)
- Each platform name should be descriptive of its role in THIS incident"""

    return _extract_list(llm.chat_json([{"role": "user", "content": prompt}]))


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
- The total simulated time (rounds x hours) should match the realistic incident duration"""

    return llm.chat_json([{"role": "user", "content": prompt}])
