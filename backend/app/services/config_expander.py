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


MODE_CAPS = {
    "test":     {"agents": 7,  "worlds": 3, "events": 5, "max_rounds": 10, "total_rounds": 6},
    "quick":    {"agents": 10, "worlds": 4, "events": 6, "max_rounds": 15, "total_rounds": 8},
    "standard": {"agents": 99, "worlds": 99, "events": 99, "max_rounds": 30, "total_rounds": None},
    "deep":     {"agents": 99, "worlds": 99, "events": 99, "max_rounds": 30, "total_rounds": None},
}


def run_config_expansion(project_id: str, scenario_ids: list[str], test_mode: bool = False, mode: str | None = None, callback_token: str | None = None) -> None:
    """Expand selected scenarios into full configs in a background thread."""
    # mode takes precedence over test_mode for backward compat
    effective_mode = mode if mode and mode in MODE_CAPS else ("test" if test_mode else "standard")
    thread = threading.Thread(
        target=_expansion_pipeline,
        args=(project_id, scenario_ids, effective_mode),
        kwargs={"callback_token": callback_token},
        daemon=True,
    )
    thread.start()


def _expansion_pipeline(project_id: str, scenario_ids: list[str], mode: str = "standard", callback_token: str | None = None) -> None:
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
        threats = analysis.get("threats", [])
        vulnerabilities = analysis.get("vulnerabilities", [])

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

            # Build threat context for this scenario
            threat_context = _build_threat_context(scenario, threats, vulnerabilities)

            try:
                config = _expand_single_scenario(
                    project_id, dossier, scenario, attack_path, cost_tracker, sid,
                    threat_context,
                )
                # Apply mode-based caps
                caps = MODE_CAPS.get(mode, MODE_CAPS["standard"])
                config["_pipeline_mode"] = mode
                if mode in ("test", "quick"):
                    config["_test_mode"] = True
                # Cap agents (keep threat actors)
                agents = config.get("agent_profiles", [])
                if len(agents) > caps["agents"]:
                    threat_actors = [a for a in agents if a.get("role") == "threat_actor" or a.get("agent_type") == "threat_actor"]
                    defenders = [a for a in agents if a not in threat_actors]
                    config["agent_profiles"] = defenders[:caps["agents"] - len(threat_actors)] + threat_actors
                # Cap worlds (keep c2 and email worlds, trim slack overflow)
                worlds = config.get("worlds", [])
                if len(worlds) > caps["worlds"]:
                    c2_worlds = [w for w in worlds if w.get("name", "").startswith("c2")]
                    email_worlds = [w for w in worlds if w.get("type") == "email" and w not in c2_worlds]
                    slack_worlds = [w for w in worlds if w not in c2_worlds and w not in email_worlds]
                    protected = email_worlds + c2_worlds
                    slack_slots = max(caps["worlds"] - len(protected), 1)
                    config["worlds"] = slack_worlds[:slack_slots] + protected
                # Cap scheduled events
                events = config.get("scheduled_events", [])
                if len(events) > caps["events"]:
                    config["scheduled_events"] = events[:caps["events"]]
                # Cap adaptive depth rounds
                ad = config.get("adaptive_depth", {})
                if ad.get("enabled"):
                    ad["max_rounds"] = min(ad.get("max_rounds", 30), caps["max_rounds"])
                    config["adaptive_depth"] = ad
                # Cap total rounds (None = use LLM value)
                if caps["total_rounds"] is not None:
                    config["total_rounds"] = min(config.get("total_rounds", 6), caps["total_rounds"])
                logger.info(f"{mode} mode: {len(config.get('agent_profiles',[]))} agents, "
                            f"{len(config.get('worlds',[]))} worlds, "
                            f"max {ad.get('max_rounds', caps['max_rounds'])} rounds")

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
            if callback_token:
                from .workflow_callback import resume_workflow_hook
                resume_workflow_hook(callback_token, {"status": "failed", "error": f"All scenario expansions failed: {failed_scenarios}", "project_id": project_id})
        else:
            msg = f"{completed} config(s) ready."
            if failed_scenarios:
                msg += f" ({len(failed_scenarios)} failed: {failed_scenarios})"
            project_manager.update_project(project_id,
                status="configs_ready", progress=100,
                progress_message=msg)
            if callback_token:
                from .workflow_callback import resume_workflow_hook
                resume_workflow_hook(callback_token, {"status": "configs_ready", "project_id": project_id})

    except Exception as e:
        logger.error(f"Config expansion pipeline failed for {project_id}: {e}")
        project_manager.update_project(project_id,
            status="failed", error_message=str(e),
            progress_message="Config generation failed.")
        if callback_token:
            from .workflow_callback import resume_workflow_hook
            resume_workflow_hook(callback_token, {"status": "failed", "error": str(e), "project_id": project_id})


def _build_threat_context(scenario: dict, threats: list[dict], vulnerabilities: list[dict]) -> str:
    """Build a threat intelligence context string from analysis data."""
    sections = []

    # Scenario metadata
    prob = scenario.get("probability", 0)
    severity = scenario.get("severity", "unknown")
    affected = scenario.get("affected_teams", [])
    evidence = scenario.get("evidence", [])

    if prob or severity != "unknown":
        sections.append(f"Scenario Probability: {prob*100:.0f}% | Severity: {severity}")
    if affected:
        sections.append(f"Primarily Affected Teams: {', '.join(affected)}")
    if evidence:
        sections.append("Supporting Evidence from Dossier:")
        for e in evidence[:5]:
            sections.append(f"  - {e[:150]}")

    # Relevant threat actors
    if threats:
        sections.append("\nThreat Intelligence:")
        for t in threats[:5]:
            name = t.get("name", t.get("threat_name", "Unknown"))
            actors = t.get("threat_actors", [])
            techniques = t.get("mitre_techniques", [])
            reasoning = t.get("reasoning", "")
            sections.append(f"  Threat: {name}")
            if actors:
                sections.append(f"    Known Actors: {', '.join(actors[:3])}")
            if techniques:
                sections.append(f"    MITRE Techniques: {', '.join(techniques[:5])}")
            if reasoning:
                sections.append(f"    Reasoning: {reasoning[:150]}")

    # Vulnerability gaps
    if vulnerabilities:
        sections.append("\nIdentified Vulnerability Gaps:")
        for v in vulnerabilities[:5]:
            gap = v.get("gap", v.get("vulnerability", "Unknown"))
            sev = v.get("severity", "medium")
            systems = v.get("affected_systems", [])
            sections.append(f"  [{sev.upper()}] {gap}")
            if systems:
                sections.append(f"    Affected Systems: {', '.join(systems[:3])}")

    return "\n".join(sections)


def _expand_single_scenario(
    project_id: str,
    dossier: dict,
    scenario: dict,
    attack_path: dict | None,
    cost_tracker: CostTracker,
    scenario_id: str,
    threat_context: str = "",
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
    cascading = _generate_cascading_pressures(llm, dossier, scenario, attack_path, threat_context)
    _track("cascading_pressures")

    # Call 6: Timed Injects
    events = _generate_timed_injects(llm, scenario, attack_path, cascading, threat_context, project_id)
    _track("timed_injects")

    # Call 7: Agent Personas
    agents = _generate_agent_personas(llm, dossier, scenario, cascading, threat_context, project_id)
    _track("agent_personas")

    # Normalize agent profiles — LLM sometimes uses "role_id" instead of "role"
    for agent in agents:
        if "role_id" in agent and "role" not in agent:
            agent["role"] = agent.pop("role_id")
        if "role" not in agent:
            agent["role"] = agent.get("name", "unknown").lower().replace(" ", "_")

    # Call 8: World Design
    worlds = _generate_worlds(llm, scenario, agents)
    # Ensure at least one email world exists (LLM sometimes skips it)
    has_email = any(w.get("type") == "email" for w in worlds)
    if not has_email:
        legal_roles = [a["role"] for a in agents if any(k in a.get("role", "").lower() for k in ("legal", "compliance", "ceo", "cfo", "privacy"))]
        if not legal_roles:
            legal_roles = [agents[0]["role"]] if agents else ["ceo"]
        worlds.append({
            "type": "email",
            "name": "Regulatory Disclosure",
            "description": "Formal regulatory notifications, legal holds, and board communications",
            "participants": legal_roles[:4],
        })
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
    config = _inject_adversarial_and_adaptive(config)
    return config


def _generate_cascading_pressures(llm: LLMClient, dossier: dict, scenario: dict,
                                   attack_path: dict | None, threat_context: str = "") -> dict:
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

## Threat Intelligence & Vulnerability Context
{threat_context}

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
- Each cascading order should escalate from the previous
- Ground pressures in the specific vulnerability gaps identified above — reference the actual defense gaps and their severity
- Pressures should reflect the scenario's probability and severity level"""

    return llm.chat_json([{"role": "user", "content": prompt}])


def _generate_timed_injects(llm: LLMClient, scenario: dict, attack_path: dict | None,
                            cascading: dict, threat_context: str = "",
                            project_id: str = "") -> list[dict]:
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

## Threat Intelligence & Vulnerability Context
{threat_context}

Generate 8-15 timed injects that follow the kill chain progression. Space them across all rounds. For rounds 3 and later, add conditional branching where defender actions can change the outcome.

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
- Space injects across rounds — not all in round 1
- Ground inject descriptions in specific threat actor techniques and vulnerability gaps from the threat intelligence above
- Inject alerts should reference specific systems, tools, and MITRE techniques that the threat actors are known to use"""

    try:
        from .graph_context import GraphContext
        graph_ctx = GraphContext(project_id)
        sys_deps = graph_ctx.system_dependencies()
        if sys_deps:
            prompt += f"\n\nSystem architecture (for realistic lateral movement paths):\n{sys_deps}"
    except Exception:
        pass

    return _extract_list(llm.chat_json([{"role": "user", "content": prompt}]))


def _generate_agent_personas(llm: LLMClient, dossier: dict, scenario: dict,
                              cascading: dict, threat_context: str = "",
                              project_id: str = "") -> list[dict]:
    """Call 7: Select roles and generate rich personas for this scenario."""
    org = dossier.get("org", {})
    roles = org.get("roles", [])
    events = dossier.get("recentEvents") or dossier.get("recent_events", [])
    pressures = cascading.get("pressures", [])

    # Dynamic agent count based on company size
    company_size = dossier.get("company", {}).get("size", "large")
    if company_size in ("small", "startup"):
        agent_range = "6-8"
    elif company_size in ("medium",):
        agent_range = "8-10"
    else:
        agent_range = "10-14"

    roles_text = "\n".join(
        f"- {r.get('name', '')} — {r.get('title', '?')} in {r.get('department', '?')}"
        + (f" ({r.get('responsibilities', '')})" if r.get("responsibilities") else "")
        for r in roles
    )
    events_text = "\n".join(
        f"- [{e.get('date', '?')}] {e.get('description', '')}"
        for e in events[:8]
    )

    prompt = f"""You are an organizational psychologist designing a crisis simulation. Select {agent_range} people from this company who would be most critical during this incident, and give each a detailed persona.

## Scenario
{scenario.get("summary", "")}

## Available Roles
{roles_text}

## Recent Company Events (affects morale, context)
{events_text}

## Active Pressures During This Incident
{json.dumps([p.get("name", "") for p in pressures])}

## Threat Intelligence & Vulnerability Context
{threat_context}

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
- {agent_range} agents. You MUST cover ALL of these functional areas:
  1. Executive leadership (CEO or COO — 1 agent)
  2. Security leadership (CISO or VP Security — 1 agent)
  3. Technical response (SOC lead, cloud/security engineer, or forensics analyst — 2-3 agents minimum)
  4. Legal & Compliance (General Counsel, Compliance Officer, DPO — 1-2 agents)
  5. Communications (PR/Comms lead or Investor Relations — 1 agent)
  6. Affected business unit (head of the impacted business line — 1 agent)
  7. Technology leadership (CTO or Head of Engineering — 1 agent)
- Personas must reference specific company context (recent events, org changes, company size)
- Each agent should have a realistic reason to be stressed or conflicted during THIS scenario
- At least 3 pairs of agents should have natural tension (e.g., CISO wants containment, CEO wants uptime, Legal wants forensic hold)
- incident_memory should be scenario-specific, not generic
- Ensure agents represent the affected teams identified in the threat analysis above
- Personas should reference awareness of specific threat actors and vulnerability gaps where relevant"""

    # Add organizational context from knowledge graph
    try:
        from .graph_context import GraphContext
        graph_ctx = GraphContext(project_id)
        org_context = graph_ctx.org_hierarchy()
        if org_context:
            prompt += f"\n\nOrganizational structure from knowledge graph:\n{org_context}"
    except Exception:
        pass  # Graph context is optional

    return _extract_list(llm.chat_json([{"role": "user", "content": prompt}]))


def _generate_worlds(llm: LLMClient, scenario: dict, agents: list[dict]) -> list[dict]:
    """Call 8: Design multi-channel communication environment."""
    roles = [a.get("role", "") for a in agents]
    roles_text = ", ".join(roles)

    prompt = f"""You are designing a realistic communication environment for an incident response simulation. Create MULTIPLE channels to emulate how a real organization coordinates during a crisis.

## Scenario
{scenario.get("title", "")}: {scenario.get("summary", "")[:200]}

## Agent Roles Available
{roles_text}

Design 3-5 communication channels using these platform types:
- slack: real-time coordination channels (war rooms, team-specific channels, alert channels)
- email: formal communication threads (regulatory disclosure, client communications, executive updates)

Create SEPARATE channels for different purposes — a real organization doesn't put everyone in one Slack channel. Examples:
- "IR War Room" (slack) — SOC, CISO, engineers — tactical containment decisions
- "Executive Strategy" (slack) — CEO, CTO, CLO — strategic decisions and business impact
- "SOC-Engineering" (slack) — SOC team, engineers — technical triage and alert discussion
- "Regulatory Disclosure" (email) — Legal, Compliance, CEO — formal regulatory notifications
- "Client Communications" (email) — PR, Client Services, CEO — external stakeholder messaging

Return ONLY valid JSON — an array:
[
  {{
    "type": "slack",
    "name": "IR War Room",
    "description": "Tactical containment coordination for security and engineering teams",
    "participants": ["soc_lead", "ciso", "cloud_security_engineer", "cto"]
  }},
  {{
    "type": "email",
    "name": "Regulatory Disclosure",
    "description": "Formal regulatory communications and disclosure preparation",
    "participants": ["chief_legal_officer", "head_of_compliance", "ceo"]
  }}
]

REQUIREMENTS:
- 3-5 channels total (mix of slack and email)
- ONLY use types "slack" and "email" — no other platform types
- Each channel has a clear purpose (description) and target audience (participants)
- participants must use role IDs from the agent list above (lowercase, underscored)
- NOT every agent in every channel — create natural information silos
- At least 1 tactical channel (SOC/engineering focused) and 1 strategic channel (executive focused)
- MANDATORY: Include exactly 1 email thread (type "email") for formal/regulatory/legal communication. Real incidents always involve formal written communications to regulators, legal counsel, or the board. This is NOT optional.
- Channels should create realistic coordination challenges — teams need to bridge between channels"""

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
- total_rounds must be between 8 and 15
- hours_per_round must be between 0.5 and 4.0
- Scale rounds to incident type: ransomware/DDoS (8-10), insider threat (10-12), supply chain/data exfiltration (12-15)
- More agents means more interactions per round — account for this
- The total simulated time (rounds x hours) should match realistic incident duration
- Enough rounds to fit all injects with breathing room for response"""

    return llm.chat_json([{"role": "user", "content": prompt}])


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
    try:
        from .graph_context import GraphContext
        graph_ctx = GraphContext(config.get("project_id", ""))
        atk_ctx = graph_ctx.attacker_context()
        if atk_ctx:
            threat_actor["persona"] += f"\n\nTarget intelligence:\n{atk_ctx}"
    except Exception:
        pass

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
