# backend/app/services/exercise_report_agent.py
"""
Exercise Report Agent — generates an executive-grade, legally-safe unified
exercise report. Uses multiple focused LLM calls enriched with graph data,
MITRE ATT&CK kill chains, cascading effects, and raw simulation evidence.

All output uses PREDICTIVE language — this is a simulation exercise, not a
post-incident review.
"""
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from ..config import Config
from ..utils.llm_client import LLMClient
from ..utils.cost_tracker import CostTracker
from ..utils.logger import get_logger
from google.cloud import firestore
from google.cloud.firestore_v1 import FieldFilter
from . import project_manager

logger = get_logger("exercise_report")

SIMULATIONS_DIR = Path(Config.UPLOAD_FOLDER) / "simulations"

# ─── Legal preamble injected into every LLM prompt ───

LEGAL_PREAMBLE = """CRITICAL FRAMING RULES — YOU MUST FOLLOW THESE:
- This is a PREDICTIVE SIMULATION EXERCISE, not a real incident
- Use language: "the simulation predicts", "our model suggests", "the exercise indicates", "based on simulated outcomes"
- NEVER write as if events actually occurred — always frame as predictions
- NEVER name specific individuals — use functional roles/teams only (e.g., "executive leadership" not "David Solomon")
- Frame findings as "predicted organizational gaps" not "failures" or "weaknesses"
- All recommendations are "suggested improvements based on simulated outcomes"
- This report may be shared with a board of directors — ensure it cannot be misread as describing a real breach

EXECUTIVE COMMUNICATION RULES:
- Write for a board audience — explain every technical concept in plain business language FIRST, then cite the technical reference in parentheses
- BAD: "mapped to MITRE ATT&CK techniques T1199, T1136.003"
- GOOD: "an attacker exploiting trusted third-party relationships to gain initial access, then creating persistent cloud accounts to maintain a foothold (MITRE ATT&CK: T1199, T1136.003)"
- BAD: "TTP analysis indicates lateral movement via T1021.002"
- GOOD: "the attacker would likely move between internal systems using legitimate remote access tools (a technique known as lateral movement, ref: T1021.002)"
- Always lead with the business impact, then explain the mechanism, then cite the technical reference
- Technical acronyms (TTP, IOC, IAM, CI/CD, etc.) must be spelled out on first use
- Assume the reader is a CEO or board member who understands risk but not cybersecurity jargon"""

# ─── Role classification ───

ROLE_TO_TEAM = {
    "CEO": "Leadership", "CISO": "Leadership", "CTO": "Leadership",
    "CFO": "Leadership", "COO": "Leadership",
    "SOC Analyst": "Technical Response", "IT Admin": "Technical Response",
    "Security Engineer": "Technical Response", "Incident Responder": "Technical Response",
    "PR Manager": "Communications & Compliance", "Legal Counsel": "Communications & Compliance",
    "Compliance Officer": "Communications & Compliance", "General Counsel": "Communications & Compliance",
}


def _classify_role(role: str) -> str:
    """Map a role string to a team name."""
    if role in ROLE_TO_TEAM:
        return ROLE_TO_TEAM[role]
    role_lower = role.lower().replace("_", " ")
    if any(w in role_lower for w in ("legal", "compliance", "counsel", "pr ", "communications", "hr ")):
        return "Communications & Compliance"
    if any(w in role_lower for w in ("risk", "security", "engineer", "analyst", "admin",
                                      "devops", "soc", "responder", "network", "sysadmin")):
        return "Technical Response"
    for key, team in ROLE_TO_TEAM.items():
        if key.lower() in role_lower:
            return team
    if any(w in role_lower for w in ("chief", "officer", "president", "vp", "director", "head", "ceo", "cto")):
        return "Leadership"
    return "Communications & Compliance"


def _format_role(slug: str) -> str:
    """Convert role_slug to Title Case."""
    return slug.replace("_", " ").title()


def _track_call(llm: LLMClient, cost_tracker: CostTracker, description: str):
    """Track an LLM call immediately after it happens."""
    if llm.last_usage:
        cost_tracker.track_llm(
            "exercise_report", llm.model,
            llm.last_usage["input_tokens"],
            llm.last_usage["output_tokens"],
            description,
            cached_tokens=llm.last_usage.get("cached_tokens", 0),
        )


# ─── Synthesis helpers (fallbacks when MC/stress data is unavailable) ───

def _synthesize_mc_stats_from_sim(sim_data_list: list[dict]) -> dict | None:
    """Produce MC-stats-compatible dict from raw simulation action data.

    Reuses the same keyword classification as monte_carlo_aggregator so that
    containment/escalation detection is consistent.
    """
    import statistics
    from .monte_carlo_aggregator import (
        CONTAINMENT_KEYWORDS,
        ESCALATION_KEYWORDS,
        _action_text,
    )

    if not sim_data_list:
        return None

    outcome_counts: dict[str, int] = {
        "contained_early": 0,
        "contained_late": 0,
        "not_contained": 0,
        "escalated": 0,
    }
    containment_rounds: list[int] = []

    for sim in sim_data_list:
        actions = sim.get("actions", [])
        if not actions:
            continue

        total_rounds = max((a.get("round", 0) for a in actions), default=1) or 1
        midpoint = total_rounds / 2.0
        containment_round: int | None = None
        has_escalation = False

        for action in actions:
            text = _action_text(action)
            rnd = action.get("round", 0)

            if ESCALATION_KEYWORDS.search(text):
                has_escalation = True
            if containment_round is None and CONTAINMENT_KEYWORDS.search(text):
                containment_round = rnd

        if has_escalation and containment_round is None:
            outcome_counts["escalated"] += 1
        elif containment_round is not None:
            label = "contained_early" if containment_round <= midpoint else "contained_late"
            outcome_counts[label] += 1
            containment_rounds.append(containment_round)
        else:
            outcome_counts["not_contained"] += 1

    containment_round_stats = None
    if containment_rounds:
        histogram: dict[str, int] = {}
        for r in containment_rounds:
            histogram[str(r)] = histogram.get(str(r), 0) + 1
        containment_round_stats = {
            "mean": statistics.mean(containment_rounds),
            "median": statistics.median(containment_rounds),
            "std": statistics.stdev(containment_rounds) if len(containment_rounds) >= 2 else 0.0,
            "min": min(containment_rounds),
            "max": max(containment_rounds),
            "histogram": histogram,
        }

    return {
        "iteration_count": len(sim_data_list),
        "outcome_distribution": outcome_counts,
        "containment_round_stats": containment_round_stats,
        "decision_divergence_points": [],
        "agent_consistency": {},
        "source": "synthesized",
    }


def _synthesize_resilience_from_teams(team_scores: list[dict], sim_data_list: list[dict]) -> dict | None:
    """Derive a resilience estimate from team performance scores (1-10 scale).

    Maps the 5 team dimensions to the 4 resilience dimensions the frontend
    expects, scaling from 1-10 to 0-100.
    """
    import statistics

    if not team_scores:
        return None

    # Collect per-dimension averages across all teams
    dims_raw: dict[str, list[float]] = {
        "responseSpeed": [],
        "containmentEffectiveness": [],
        "communicationQuality": [],
        "complianceAdherence": [],
    }
    for team in team_scores:
        scores = team.get("scores", {})
        for key in dims_raw:
            val = scores.get(key)
            if val is not None:
                dims_raw[key].append(float(val))

    if not any(dims_raw.values()):
        return None

    def _avg(vals: list[float]) -> float:
        return (sum(vals) / len(vals)) * 10 if vals else 50.0

    dimensions = {
        "detection_speed": round(_avg(dims_raw["responseSpeed"]), 1),
        "containment_speed": round(_avg(dims_raw["containmentEffectiveness"]), 1),
        "communication_quality": round(_avg(dims_raw["communicationQuality"]), 1),
        "compliance_adherence": round(_avg(dims_raw["complianceAdherence"]), 1),
    }

    dim_values = list(dimensions.values())
    overall = statistics.mean(dim_values)
    std = statistics.stdev(dim_values) if len(dim_values) >= 2 else 0.0

    weakest_link = min(dimensions, key=dimensions.get)  # type: ignore[arg-type]

    return {
        "overall": round(overall, 1),
        "dimensions": dimensions,
        "robustness_index": round(max(0, overall - std), 1),
        "weakest_link": weakest_link,
        "failure_modes": [],
        "source": "synthesized",
    }


# ─── Data collection helpers ───

def _load_sim_data(sim_id: str) -> dict:
    """Load raw simulation data: config, actions, and existing report if any."""
    sim_dir = SIMULATIONS_DIR / sim_id
    config_path = sim_dir / "config.json"
    actions_path = sim_dir / "actions.jsonl"
    report_path = sim_dir / "report.json"

    data = {"simId": sim_id}

    # Config (always needed)
    if config_path.exists():
        with open(config_path) as f:
            data["config"] = json.load(f)
    else:
        data["config"] = {}

    # Raw actions
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
    data["actions"] = actions
    data["actionCount"] = len(actions)

    # Existing report (for pre-generated summaries)
    if report_path.exists():
        with open(report_path) as f:
            report = json.load(f)
        if report.get("status") == "complete":
            data["existingReport"] = report

    # Extract rich fields from config
    config = data["config"]
    data["scenarioName"] = config.get("threat_actor_profile", config.get("scenario", "Unknown")[:100])
    data["companyName"] = config.get("company_name", "Company")
    data["totalRounds"] = config.get("total_rounds", 5)
    data["attackPath"] = config.get("attack_path", {})
    data["cascadingEffects"] = config.get("cascading_effects", {})
    data["pressures"] = config.get("pressures", [])
    data["agentProfiles"] = config.get("agent_profiles", [])
    data["scenario"] = config.get("scenario", "")
    data["worlds"] = config.get("worlds", [])

    return data


def _get_graph_data(project_id: str) -> dict:
    """Query Firestore for graph nodes and edges."""
    db = firestore.Client()
    nodes = []
    for doc in db.collection("graph_nodes").where(
        filter=FieldFilter("sim_id", "==", project_id)
    ).stream():
        nodes.append({"id": doc.id, **doc.to_dict()})
    edges = []
    for doc in db.collection("graph_edges").where(
        filter=FieldFilter("sim_id", "==", project_id)
    ).stream():
        edges.append({"id": doc.id, **doc.to_dict()})
    return {"nodes": nodes, "edges": edges}


def _get_embedding_usage(project_id: str) -> dict:
    """Return stub embedding usage — Graphiti-specific metrics no longer available."""
    return {"provider": "gemini", "model": "gemini-embedding-001", "note": "See cost_tracker for token counts"}


def _get_reranker_usage(project_id: str) -> dict:
    """Return empty dict — reranker not used with Firestore vector search."""
    return {}


def _query_graph_data(project_id: str) -> dict:
    """Query the knowledge graph for structured evidence."""
    try:
        graph_data = _get_graph_data(project_id)
        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])

        # Classify nodes by type
        classified = {
            "threats": [],
            "compliance": [],
            "systems": [],
            "agents": [],
            "organizations": [],
        }
        node_map = {}
        for n in nodes:
            node_map[n["id"]] = n
            node_type = n.get("type", "unknown")
            summary = n.get("attributes", {}).get("summary", "")
            entry = {"name": n.get("name", ""), "summary": summary}
            if node_type == "threat":
                classified["threats"].append(entry)
            elif node_type == "compliance":
                classified["compliance"].append(entry)
            elif node_type == "system":
                classified["systems"].append(entry)
            elif node_type in ("person", "agent"):
                classified["agents"].append(entry)
            elif node_type in ("organization", "org"):
                classified["organizations"].append(entry)

        # Extract key relationships
        relationships = []
        for e in edges[:50]:  # Limit to avoid prompt bloat
            src = node_map.get(e.get("source"), {})
            tgt = node_map.get(e.get("target"), {})
            if src and tgt:
                relationships.append(
                    f"{src.get('name', '?')} --[{e.get('label', '?')}]--> {tgt.get('name', '?')}"
                )

        classified["relationships"] = relationships
        classified["nodeCount"] = len(nodes)
        classified["edgeCount"] = len(edges)

        logger.info(f"Graph data: {len(nodes)} nodes, {len(edges)} edges")
        return classified

    except Exception as e:
        logger.warning(f"Graph query failed: {e}")
        return {"threats": [], "compliance": [], "systems": [], "agents": [],
                "organizations": [], "relationships": [], "nodeCount": 0, "edgeCount": 0}


def _build_rich_context(sim_data_list: list[dict], graph_data: dict) -> str:
    """Build a rich context string from all available data sources."""
    sections = []

    # Scenario overviews
    for sd in sim_data_list:
        sections.append(f"## Scenario: {sd['scenarioName']}")
        sections.append(f"Description: {sd['scenario'][:500]}")

        # Attack path with MITRE techniques
        attack = sd.get("attackPath", {})
        if attack:
            sections.append(f"\nAttack Path: {attack.get('title', 'Unknown')}")
            sections.append(f"Threat: {attack.get('threat_name', 'Unknown')}")
            kill_chain = attack.get("kill_chain", [])
            for step in kill_chain:
                sections.append(
                    f"  Step {step.get('step', '?')}: [{step.get('tactic', '?')}] "
                    f"{step.get('technique', '?')} → {step.get('target', '?')}: "
                    f"{step.get('description', '')[:150]}"
                )

        # Cascading effects
        effects = sd.get("cascadingEffects", {})
        if effects:
            sections.append("\nPredicted Cascading Effects:")
            for order in ["first_order", "second_order", "third_order"]:
                items = effects.get(order, [])
                if items:
                    sections.append(f"  {order.replace('_', ' ').title()}:")
                    for item in items[:3]:
                        sections.append(f"    - {item[:150]}")

        # Pressures
        pressures = sd.get("pressures", [])
        if pressures:
            sections.append("\nActive Pressures:")
            for p in pressures:
                sections.append(f"  - {p.get('name', '?')}: {p.get('type', '?')}, "
                              f"{p.get('hours', '?')}h, severity escalates to {p.get('severity_at_25pct', '?')}")

        # Key actions (sample from each round)
        actions = sd.get("actions", [])
        if actions:
            sections.append(f"\nSimulation Actions ({len(actions)} total):")
            rounds = set(a.get("round", 0) for a in actions)
            for r in sorted(rounds)[:6]:
                round_actions = [a for a in actions if a.get("round") == r]
                sections.append(f"  Round {r}:")
                for a in round_actions[:3]:
                    content = a.get("args", {}).get("content", a.get("args", {}).get("subject", ""))[:150]
                    sections.append(f"    [{_format_role(a.get('role', '?'))}] "
                                  f"{a.get('world', '?')}: {content}")

        # Existing report analysis (if available)
        existing = sd.get("existingReport", {})
        if existing:
            if existing.get("communicationAnalysis"):
                sections.append(f"\nCommunication Analysis: {existing['communicationAnalysis'][:600]}")
            if existing.get("tensions"):
                sections.append(f"\nTensions Observed: {existing['tensions'][:600]}")

        sections.append("")

    # Graph evidence
    if graph_data.get("nodeCount", 0) > 0:
        sections.append("## Knowledge Graph Evidence")
        sections.append(f"Total: {graph_data['nodeCount']} entities, {graph_data['edgeCount']} relationships\n")

        if graph_data.get("threats"):
            sections.append("Threat Intelligence:")
            for t in graph_data["threats"][:10]:
                sections.append(f"  - {t['name']}: {t['summary'][:120]}")

        if graph_data.get("compliance"):
            sections.append("\nRegulatory Frameworks:")
            for c in graph_data["compliance"][:10]:
                sections.append(f"  - {c['name']}: {c['summary'][:120]}")

        if graph_data.get("relationships"):
            sections.append("\nKey Relationships:")
            for r in graph_data["relationships"][:15]:
                sections.append(f"  {r}")

    return "\n".join(sections)


# ─── Playbook generation (5-step pipeline) ───

_PLAYBOOK_PREAMBLE = """You are an incident response playbook generator following NIST SP 800-61r2.
ALL output must be specific to the simulation exercise data provided.
Reference ACTUAL system names, ACTUAL attack techniques, ACTUAL team responses from the exercise.
Do NOT produce generic boilerplate — every item must be grounded in the evidence below.
Output valid JSON matching the schema exactly."""


def _playbook_scope_and_evidence(
    llm: LLMClient,
    sim_data_list: list[dict],
    graph_data: dict,
    cost_tracker: CostTracker,
) -> dict:
    """Step 1: Determine incident scope and evidence acquisition plan."""
    # Collect specific data for this step
    attack_paths = []
    for sd in sim_data_list:
        ap = sd.get("attackPath", {})
        if ap:
            attack_paths.append({
                "title": ap.get("title", ""),
                "threat_name": ap.get("threat_name", ""),
                "kill_chain": ap.get("kill_chain", []),
            })

    systems = [{"name": s["name"], "summary": s.get("summary", "")} for s in graph_data.get("systems", [])]
    compliance = [{"name": c["name"], "summary": c.get("summary", "")} for c in graph_data.get("compliance", [])]
    threats = [{"name": t["name"], "summary": t.get("summary", "")} for t in graph_data.get("threats", [])]
    relationships = graph_data.get("relationships", [])[:30]

    prompt = f"""{_PLAYBOOK_PREAMBLE}

TASK: Generate the Overview and Evidence Acquisition sections of an incident response playbook.

ATTACK PATHS FROM EXERCISE:
{json.dumps(attack_paths, indent=2)}

SYSTEMS IN ORGANIZATION (from knowledge graph):
{json.dumps(systems, indent=2)}

COMPLIANCE REQUIREMENTS (from knowledge graph):
{json.dumps(compliance, indent=2)}

THREATS IDENTIFIED:
{json.dumps(threats, indent=2)}

KEY RELATIONSHIPS:
{chr(10).join(relationships[:20])}

Output JSON:
{{
  "overview": {{
    "incidentType": "specific incident type from the attack path",
    "scope": "which systems are affected, what data is at risk — reference actual system names",
    "regulatoryContext": "compliance requirements that apply — reference actual compliance nodes"
  }},
  "evidenceAcquisition": {{
    "logSources": ["specific log source for each affected system — e.g., 'CloudTrail for IAM activity on [system]'"],
    "awsSpecific": ["specific AWS log queries/filters for the attack techniques used"],
    "chainOfCustody": ["evidence handling requirements based on compliance context"],
    "dataClassification": "classification of data at risk based on actual systems"
  }}
}}"""

    result = llm.chat_json([{"role": "user", "content": prompt}])
    _track_call(llm, cost_tracker, "playbook_1_scope_evidence")
    return result


def _playbook_containment(
    llm: LLMClient,
    sim_data_list: list[dict],
    previous: dict,
    root_causes: list,
    cost_tracker: CostTracker,
) -> dict:
    """Step 2: Map containment actions from successful simulation outcomes."""
    # Extract containment-related actions from simulation
    containment_actions = []
    cascading_effects = {}
    for sd in sim_data_list:
        cascading_effects = sd.get("cascadingEffects", {})
        for action in sd.get("actions", []):
            content = (action.get("args", {}).get("content", "") or
                       action.get("description", "") or "")
            content_lower = content.lower()
            if any(kw in content_lower for kw in
                   ("isolat", "contain", "block", "revok", "suspend", "quarantin",
                    "lockdown", "shut", "disable", "restrict")):
                containment_actions.append({
                    "round": action.get("round"),
                    "agent": action.get("agent", action.get("role", "Unknown")),
                    "action": content[:200],
                })

    root_cause_summary = json.dumps(
        [{"issue": rc.get("issue"), "rootCause": rc.get("rootCause")} for rc in root_causes[:5]],
        indent=2,
    )

    prompt = f"""{_PLAYBOOK_PREAMBLE}

TASK: Generate the Containment section. Base it on containment actions that ACTUALLY WORKED in the simulation.

INCIDENT SCOPE (from previous step):
{json.dumps(previous.get("overview", {}), indent=2)}

EVIDENCE PLAN (from previous step):
{json.dumps(previous.get("evidenceAcquisition", {}), indent=2)}

CONTAINMENT ACTIONS OBSERVED IN SIMULATION ({len(containment_actions)} found):
{json.dumps(containment_actions[:15], indent=2)}

ROOT CAUSES IDENTIFIED:
{root_cause_summary}

PREDICTED CASCADING EFFECTS:
{json.dumps(cascading_effects, indent=2)}

Output JSON:
{{
  "containment": {{
    "immediateActions": ["specific actions from simulation's successful containment — reference the agent and round"],
    "iamRevocation": ["specific IAM roles/policies to revoke based on the attack path"],
    "networkIsolation": ["specific network segments to isolate based on affected systems"],
    "serviceSuspension": ["specific services to suspend, considering cascading effects"]
  }}
}}"""

    result = llm.chat_json([{"role": "user", "content": prompt}])
    _track_call(llm, cost_tracker, "playbook_2_containment")
    return result


def _playbook_eradication(
    llm: LLMClient,
    sim_data_list: list[dict],
    previous: dict,
    root_causes: list,
    cost_tracker: CostTracker,
) -> dict:
    """Step 3: Tie eradication to specific root causes and MITRE techniques."""
    attack_paths = []
    for sd in sim_data_list:
        ap = sd.get("attackPath", {})
        if ap:
            attack_paths.append(ap)

    rc_mitre = json.dumps(
        [{"issue": rc.get("issue"), "rootCause": rc.get("rootCause"),
          "mitreReference": rc.get("mitreReference", ""),
          "preventionStrategies": rc.get("preventionStrategies", [])}
         for rc in root_causes], indent=2,
    )
    ap_techniques = json.dumps(
        [{"kill_chain": ap.get("kill_chain", []), "threat_name": ap.get("threat_name", "")}
         for ap in attack_paths], indent=2,
    )

    prompt = f"""{_PLAYBOOK_PREAMBLE}

TASK: Generate the Eradication section. Tie each remediation step to a specific root cause from the exercise.

CONTAINMENT ACTIONS TAKEN (from previous step):
{json.dumps(previous.get("containment", {}), indent=2)}

ROOT CAUSES WITH MITRE REFERENCES:
{rc_mitre}

ATTACK PATH TECHNIQUES:
{ap_techniques}

Output JSON:
{{
  "eradication": {{
    "rootCauseRemoval": ["for each root cause: specific removal step referencing the cause and MITRE technique"],
    "credentialRotation": ["specific credentials to rotate based on compromised systems"],
    "patchRequirements": ["specific patches needed based on attack techniques used"],
    "configRemediation": ["specific configuration changes to prevent recurrence"]
  }}
}}"""

    result = llm.chat_json([{"role": "user", "content": prompt}])
    _track_call(llm, cost_tracker, "playbook_3_eradication")
    return result


def _playbook_recovery(
    llm: LLMClient,
    sim_data_list: list[dict],
    graph_data: dict,
    previous: dict,
    conclusions: dict,
    cost_tracker: CostTracker,
) -> dict:
    """Step 4: Recovery based on system dependencies and communication patterns."""
    worlds = []
    agent_profiles = []
    for sd in sim_data_list:
        worlds.extend(sd.get("worlds", []))
        agent_profiles.extend(sd.get("agentProfiles", []))

    # Deduplicate worlds
    seen_worlds = set()
    unique_worlds = []
    for w in worlds:
        name = w.get("name", "")
        if name not in seen_worlds:
            seen_worlds.add(name)
            unique_worlds.append(w)

    action_items = conclusions.get("actionItems", conclusions.get("priorityRecommendations", []))
    systems = graph_data.get("systems", [])
    compliance = graph_data.get("compliance", [])
    relationships = graph_data.get("relationships", [])[:20]

    worlds_summary = json.dumps(
        [{"name": w.get("name"), "type": w.get("type", ""), "description": w.get("description", "")} for w in unique_worlds], indent=2,
    )
    roles_summary = json.dumps(
        [{"name": ap.get("name"), "role": ap.get("role")} for ap in agent_profiles[:10]], indent=2,
    )
    systems_summary = json.dumps(
        [{"name": s.get("name"), "summary": s.get("summary", "")} for s in systems], indent=2,
    )
    compliance_summary = json.dumps(
        [{"name": c.get("name"), "summary": c.get("summary", "")} for c in compliance], indent=2,
    )

    prompt = f"""{_PLAYBOOK_PREAMBLE}

TASK: Generate the Recovery section. Base restoration on actual system dependencies and communication patterns from the exercise.

ERADICATION STEPS TAKEN (from previous step):
{json.dumps(previous.get("eradication", {}), indent=2)}

COMMUNICATION CHANNELS USED IN EXERCISE:
{worlds_summary}

TEAM ROLES IN EXERCISE:
{roles_summary}

SYSTEM DEPENDENCIES (from knowledge graph):
{systems_summary}
{chr(10).join(relationships)}

COMPLIANCE REQUIREMENTS:
{compliance_summary}

ACTION ITEMS FROM EXERCISE CONCLUSIONS:
{json.dumps(action_items[:5], indent=2)}

Output JSON:
{{
  "recovery": {{
    "restorationSequence": ["ordered steps referencing actual systems and their dependencies"],
    "verificationSteps": ["specific verification for each restored system"],
    "communicationPlan": ["who communicates what, via which channel — reference actual worlds/roles"],
    "regulatoryTimeline": ["notification deadlines based on actual compliance requirements"]
  }}
}}"""

    result = llm.chat_json([{"role": "user", "content": prompt}])
    _track_call(llm, cost_tracker, "playbook_4_recovery")
    return result


def _playbook_post_incident(
    llm: LLMClient,
    previous_sections: dict,
    conclusions: dict,
    mc_aggregation: dict | None,
    cost_tracker: CostTracker,
) -> dict:
    """Step 5: Synthesize lessons learned from all analysis."""
    key_findings = conclusions.get("keyFindings", [])
    action_items = conclusions.get("actionItems", conclusions.get("priorityRecommendations", []))

    mc_summary = ""
    if mc_aggregation:
        mc_summary = (
            f"Outcome distribution: {json.dumps(mc_aggregation.get('outcome_distribution', {}))}\n"
            f"Agent consistency: {json.dumps(mc_aggregation.get('agent_consistency', {}))}"
        )

    findings_summary = json.dumps(
        [{"finding": f.get("finding"), "severity": f.get("severity"), "businessImpact": f.get("businessImpact", "")}
         for f in key_findings[:5]], indent=2,
    )

    prompt = f"""{_PLAYBOOK_PREAMBLE}

TASK: Generate the Post-Incident section. Synthesize lessons from the entire exercise.

PLAYBOOK SECTIONS SO FAR:
- Incident type: {previous_sections.get("overview", {}).get("incidentType", "Unknown")}
- Scope: {previous_sections.get("overview", {}).get("scope", "Unknown")}
- Containment actions: {len(previous_sections.get("containment", {}).get("immediateActions", []))} steps
- Eradication steps: {len(previous_sections.get("eradication", {}).get("rootCauseRemoval", []))} root causes addressed
- Recovery sequence: {len(previous_sections.get("recovery", {}).get("restorationSequence", []))} systems

KEY FINDINGS FROM EXERCISE:
{findings_summary}

STRATEGIC ACTION ITEMS:
{json.dumps(action_items[:5], indent=2)}

MONTE CARLO STATISTICS:
{mc_summary if mc_summary else "Not available for this exercise run"}

Output JSON:
{{
  "postIncident": {{
    "lessonsLearned": ["specific lessons from this exercise — reference actual findings and outcomes"],
    "policyUpdates": ["specific policy changes needed — tied to root causes found"],
    "trainingRecommendations": ["specific training needs based on team performance gaps"],
    "nextExerciseSchedule": "recommended schedule and focus for next exercise"
  }}
}}"""

    result = llm.chat_json([{"role": "user", "content": prompt}])
    _track_call(llm, cost_tracker, "playbook_5_post_incident")
    return result


def _generate_playbook(
    llm: LLMClient,
    sim_data_list: list[dict],
    graph_data: dict,
    root_causes: list,
    conclusions: dict,
    mc_aggregation: dict | None,
    cost_tracker: CostTracker,
) -> dict | None:
    """Generate NIST SP 800-61r2 playbook via 5-step evidence-grounded pipeline."""
    playbook = {}

    try:
        # Step 1: Scope & Evidence
        logger.info("Playbook step 1/5: Scope & Evidence Acquisition...")
        step1 = _playbook_scope_and_evidence(llm, sim_data_list, graph_data, cost_tracker)
        playbook.update(step1)
    except Exception as e:
        logger.warning(f"Playbook step 1 failed: {e}")
        playbook["overview"] = {"incidentType": "Unknown", "scope": "Unable to determine", "regulatoryContext": "Review required"}
        playbook["evidenceAcquisition"] = {"logSources": [], "awsSpecific": [], "chainOfCustody": [], "dataClassification": "Review required"}

    try:
        # Step 2: Containment
        logger.info("Playbook step 2/5: Containment...")
        step2 = _playbook_containment(llm, sim_data_list, playbook, root_causes, cost_tracker)
        playbook.update(step2)
    except Exception as e:
        logger.warning(f"Playbook step 2 failed: {e}")
        playbook["containment"] = {"immediateActions": [], "iamRevocation": [], "networkIsolation": [], "serviceSuspension": []}

    try:
        # Step 3: Eradication
        logger.info("Playbook step 3/5: Eradication...")
        step3 = _playbook_eradication(llm, sim_data_list, playbook, root_causes, cost_tracker)
        playbook.update(step3)
    except Exception as e:
        logger.warning(f"Playbook step 3 failed: {e}")
        playbook["eradication"] = {"rootCauseRemoval": [], "credentialRotation": [], "patchRequirements": [], "configRemediation": []}

    try:
        # Step 4: Recovery
        logger.info("Playbook step 4/5: Recovery...")
        step4 = _playbook_recovery(llm, sim_data_list, graph_data, playbook, conclusions, cost_tracker)
        playbook.update(step4)
    except Exception as e:
        logger.warning(f"Playbook step 4 failed: {e}")
        playbook["recovery"] = {"restorationSequence": [], "verificationSteps": [], "communicationPlan": [], "regulatoryTimeline": []}

    try:
        # Step 5: Post-Incident
        logger.info("Playbook step 5/5: Post-Incident...")
        step5 = _playbook_post_incident(llm, playbook, conclusions, mc_aggregation, cost_tracker)
        playbook.update(step5)
    except Exception as e:
        logger.warning(f"Playbook step 5 failed: {e}")
        playbook["postIncident"] = {"lessonsLearned": [], "policyUpdates": [], "trainingRecommendations": [], "nextExerciseSchedule": "TBD"}

    # Check if we got meaningful content
    has_content = any(
        isinstance(v, dict) and any(
            (isinstance(sv, list) and len(sv) > 0) or (isinstance(sv, str) and len(sv) > 10)
            for sv in v.values()
        )
        for v in playbook.values()
        if isinstance(v, dict)
    )

    if has_content:
        logger.info("Playbook generated successfully (5-step pipeline)")
        return playbook
    else:
        logger.warning("Playbook pipeline produced no meaningful content")
        return None


# ─── Attack-Path Playbook (per-step with MC evidence) ───

_ATTACK_PATH_PLAYBOOK_PREAMBLE = """You are generating an incident response playbook step for a cybersecurity exercise simulation.
ALL output must be specific to the simulation exercise data provided.
Reference ACTUAL system names, ACTUAL attack techniques, ACTUAL team responses from the exercise.
Evidence chips must reference Monte Carlo simulation results where available.
Output valid JSON matching the schema exactly."""


def _generate_attack_path_step(
    llm: LLMClient,
    step: dict,
    step_index: int,
    all_steps: list[dict],
    mc_stats: dict | None,
    sim_data_list: list[dict],
    graph_data: dict,
    cost_tracker: CostTracker,
) -> dict:
    """Generate per-step playbook entry with response actions and MC evidence."""

    # Extract relevant MC data for this step
    mc_context = ""
    if mc_stats:
        iteration_count = mc_stats.get("iteration_count", 0)
        outcome_dist = mc_stats.get("outcome_distribution", {})
        containment_stats = mc_stats.get("containment_round_stats", {})
        divergence_points = mc_stats.get("decision_divergence_points", [])
        agent_consistency = mc_stats.get("agent_consistency", {})

        # Find divergence points near this step's expected round
        relevant_divergence = [
            dp for dp in divergence_points
            if abs(dp.get("round", 0) - (step_index + 1)) <= 1
        ]

        mc_context = f"""
MONTE CARLO SIMULATION DATA ({iteration_count} iterations):
- Outcome distribution: {json.dumps(outcome_dist)}
- Containment stats: mean={containment_stats.get('mean', 'N/A')} rounds, std={containment_stats.get('std', 'N/A')}
- Divergence points near this step: {json.dumps(relevant_divergence) if relevant_divergence else 'None'}
- Agent consistency scores: {json.dumps(agent_consistency)}
"""

    # Extract systems and compliance from graph
    systems = [s.get("name", "") for s in graph_data.get("systems", [])]
    compliance = [c.get("name", "") for c in graph_data.get("compliance", [])]

    prompt = f"""{_ATTACK_PATH_PLAYBOOK_PREAMBLE}

KILL CHAIN STEP {step_index + 1} of {len(all_steps)}:
  Tactic: {step.get('tactic', '')}
  Technique: {step.get('technique', '')}
  Target: {step.get('target', '')}
  Description: {step.get('description', '')}

FULL KILL CHAIN CONTEXT (all steps for sequencing):
{json.dumps(all_steps, indent=2)}
{mc_context}
ORGANIZATION SYSTEMS: {json.dumps(systems)}
COMPLIANCE REQUIREMENTS: {json.dumps(compliance)}

Generate a playbook entry for THIS kill chain step. Include:
1. Evidence attribution (infer from MC aggregate data how this step contributes to containment)
2. 2-4 response actions ranked by containment impact, each with specific CLI commands
3. 1-2 what-if alternate scenarios (one negative delay, one positive acceleration)
4. Regulatory timeline deadlines
5. Per-step risk assessment

VALIDATION: Per-step evidence must be consistent with overall MC stats. Mark all evidence as inferred (is_inferred: true) since we are attributing aggregate MC data to individual steps.

Output JSON:
{{
  "attack_path_index": 0,
  "step_index": {step_index},
  "tactic": "{step.get('tactic', '')}",
  "technique_id": "{step.get('technique', '')}",
  "description": "{step.get('description', '').replace('"', '\\"')}",
  "evidence": {{
    "containment_rate": "X/Y format — infer from MC data",
    "avg_detection_round": 0,
    "systems_affected": 0,
    "divergence_pct": 0,
    "is_inferred": true
  }},
  "response_actions": [
    {{
      "title": "action title",
      "description": "what to do and why, referencing simulation evidence",
      "commands": ["specific CLI command for target cloud/system"],
      "priority": "critical|high|medium",
      "owner": "role title (e.g., DevOps Lead, IAM Team, SOC Analyst)",
      "sla": "time window (e.g., 15 minutes, 1 hour)",
      "evidence_chips": [
        {{"label": "evidence text referencing MC data", "type": "success|warning|danger|info", "is_inferred": true}}
      ],
      "regulatory_refs": ["specific regulation references"]
    }}
  ],
  "team_performance": {{"team_name": 0}},
  "what_if": [
    {{
      "scenario": "what happens if response is delayed",
      "containment_delta": "percentage change",
      "rounds_delta": 0,
      "exposure_delta": "dollar amount change",
      "direction": "negative",
      "source": "estimated"
    }}
  ],
  "regulatory_timeline": [
    {{"time": "T+1hr", "action": "regulatory action required"}}
  ],
  "risk_at_step": {{
    "score": 0,
    "description": "risk description at this phase",
    "fair_increment": "$X per hour of delay",
    "is_inferred": true
  }}
}}"""

    result = llm.chat_json([{"role": "user", "content": prompt}])
    _track_call(llm, cost_tracker, f"attack_path_step_{step_index}")
    return result


def _generate_attack_path_playbook(
    llm: LLMClient,
    methodology: dict,
    mc_aggregation: dict | None,
    sim_data_list: list[dict],
    graph_data: dict,
    cost_tracker: CostTracker,
) -> list[dict] | None:
    """Generate per-step attack-path playbook with MC evidence for all kill chain steps."""

    attack_paths = methodology.get("attackPaths", [])
    if not attack_paths:
        logger.warning("No attack paths found in methodology — skipping attack path playbook")
        return None

    kill_chain = attack_paths[0].get("killChain", [])
    if not kill_chain:
        logger.warning("No kill chain steps found — skipping attack path playbook")
        return None

    logger.info(f"Generating attack-path playbook for {len(kill_chain)} kill chain steps...")

    steps = []
    # Generate in parallel using threads
    results = [None] * len(kill_chain)
    errors = [None] * len(kill_chain)

    def generate_step(idx, kc_step):
        try:
            results[idx] = _generate_attack_path_step(
                llm, kc_step, idx, kill_chain,
                mc_aggregation, sim_data_list, graph_data, cost_tracker,
            )
        except Exception as e:
            logger.warning(f"Attack path step {idx} failed: {e}")
            errors[idx] = str(e)

    threads = []
    for idx, kc_step in enumerate(kill_chain):
        t = threading.Thread(target=generate_step, args=(idx, kc_step))
        threads.append(t)
        t.start()

    for t in threads:
        t.join(timeout=60)

    for idx in range(len(kill_chain)):
        if results[idx]:
            steps.append(results[idx])
        elif errors[idx]:
            # Partial failure — include a stub so the UI knows this step exists but failed
            steps.append({
                "attack_path_index": 0,
                "step_index": idx,
                "tactic": kill_chain[idx].get("tactic", ""),
                "technique_id": kill_chain[idx].get("technique", ""),
                "description": kill_chain[idx].get("description", ""),
                "error": errors[idx],
                "evidence": {"containment_rate": "N/A", "avg_detection_round": 0, "systems_affected": 0, "divergence_pct": 0, "is_inferred": True},
                "response_actions": [],
                "team_performance": {},
                "what_if": [],
                "regulatory_timeline": [],
                "risk_at_step": {"score": 0, "description": "Generation failed", "fair_increment": "N/A", "is_inferred": True},
            })

    if steps:
        logger.info(f"Attack-path playbook generated: {len(steps)} steps ({sum(1 for e in errors if e)} failures)")
        return steps
    else:
        logger.warning("Attack-path playbook produced no steps")
        return None


# ─── Main pipeline ───

def run_exercise_report(
    project_id: str,
    batch_id: str | None = None,
    branch_ids: list[str] | None = None,
    callback_token: str | None = None,
) -> None:
    """Generate unified exercise report in a background thread."""
    thread = threading.Thread(
        target=_generate_exercise_report,
        args=(project_id,),
        kwargs={"batch_id": batch_id, "branch_ids": branch_ids, "callback_token": callback_token},
        daemon=True,
    )
    thread.start()


def _generate_exercise_report(
    project_id: str,
    batch_id: str | None = None,
    branch_ids: list[str] | None = None,
    callback_token: str | None = None,
) -> None:
    """Full exercise report generation pipeline with multiple focused LLM calls."""
    out_dir = SIMULATIONS_DIR / f"exercise_{project_id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "report.json"

    with open(report_path, "w") as f:
        json.dump({"projectId": project_id, "status": "generating"}, f)

    try:
        project = project_manager.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        sim_ids = project.get("sim_ids", [])
        if not sim_ids:
            if project.get("sim_id"):
                sim_ids = [project["sim_id"]]
            else:
                raise ValueError("No simulations found for project")

        logger.info(f"Starting exercise report for {project_id} with {len(sim_ids)} simulations")

        llm = LLMClient()
        cost_tracker = CostTracker(f"exercise_{project_id}")

        # ─── Step 1: Collect all raw data ───
        logger.info("Step 1: Loading raw simulation data...")
        sim_data_list = []
        for sid in sim_ids:
            try:
                sim_data_list.append(_load_sim_data(sid))
                logger.info(f"Loaded data for {sid}: {sim_data_list[-1]['actionCount']} actions")
            except Exception as e:
                logger.warning(f"Failed to load {sid}: {e}")

        if not sim_data_list:
            raise ValueError("No simulation data could be loaded")

        company_name = sim_data_list[0].get("companyName", "Company")

        # ─── Step 2: Query knowledge graph ───
        logger.info("Step 2: Querying knowledge graph...")
        graph_data = _query_graph_data(project_id)

        # Embedding/reranker usage stubs (Graphiti removed, now using Firestore)
        embed_usage = _get_embedding_usage(project_id)
        logger.info("Embedding provider: %s (%s)", embed_usage.get("provider"), embed_usage.get("note"))
        reranker_usage = _get_reranker_usage(project_id)
        if reranker_usage:
            logger.info("Reranker usage: %s", reranker_usage)

        # ─── Step 3: Build rich context ───
        logger.info("Step 3: Building rich context from all data sources...")
        rich_context = _build_rich_context(sim_data_list, graph_data)

        # ─── Step 4: Team aggregation + scoring ───
        logger.info("Step 4: Scoring teams...")
        teams = _aggregate_teams(sim_data_list)
        team_scores = _generate_team_scores(llm, teams, rich_context, cost_tracker)

        # ─── Step 5: Heatmap ───
        logger.info("Step 5: Building heatmap...")
        heatmap_data = _build_heatmap_data(llm, sim_data_list, rich_context, cost_tracker)

        # ─── Step 6: Root cause analysis with MITRE + graph evidence ───
        logger.info("Step 6: Running 5 Whys root cause analysis...")
        root_causes = _generate_root_causes(llm, sim_data_list, rich_context, cost_tracker)
        logger.info(f"Step 6 complete: {len(root_causes)} root causes")

        # ─── Step 7: Conclusions with action table ───
        logger.info("Step 7: Generating conclusions + action table...")
        conclusions = _generate_conclusions(llm, company_name, team_scores, root_causes, rich_context, cost_tracker)

        # ─── Step 8: Executive summary (written last, uses everything) ───
        logger.info("Step 8: Writing executive summary...")
        exec_summary = _generate_executive_summary(
            llm, company_name, conclusions, team_scores, root_causes, sim_data_list, cost_tracker
        )

        # ─── Step 9: Methodology (no LLM needed) ───
        logger.info("Step 9: Building methodology...")
        methodology = _build_methodology(sim_data_list, project)

        # ─── Step 10: Appendix (LLM-powered per-scenario analysis) ───
        logger.info("Step 10: Generating appendix analysis...")
        appendix = _generate_appendix(llm, sim_data_list, cost_tracker)

        # ─── Step 11: Load MC aggregation data (3-tier fallback) ───
        mc_aggregation = None
        projects_dir = Path(Config.UPLOAD_FOLDER) / "crucible_projects" / project_id

        # Tier 1a: Use provided batch_id
        if batch_id:
            agg_path = projects_dir / "monte_carlo" / batch_id / "aggregation.json"
            if agg_path.exists():
                with open(agg_path) as f:
                    mc_aggregation = json.load(f)
                logger.info(f"Loaded MC aggregation from {agg_path}")

        # Tier 1b: Auto-detect newest batch with aggregation.json
        if mc_aggregation is None:
            mc_root = projects_dir / "monte_carlo"
            if mc_root.exists():
                for batch_dir in sorted(mc_root.iterdir(), reverse=True):
                    if not batch_dir.is_dir() or batch_dir.name.startswith("."):
                        continue
                    agg_path = batch_dir / "aggregation.json"
                    if agg_path.exists():
                        with open(agg_path) as f:
                            mc_aggregation = json.load(f)
                        logger.info(f"Auto-detected MC aggregation from {agg_path}")
                        break

        # Tier 1c: On-the-fly aggregate from MC iteration dirs on disk
        if mc_aggregation is None:
            mc_root = projects_dir / "monte_carlo"
            if mc_root.exists():
                from dataclasses import asdict as _asdict
                from .monte_carlo_aggregator import (
                    aggregate_batch as _aggregate_batch,
                    IterationResult as _IterationResult,
                    _action_text as _at,
                )
                for batch_dir in sorted(mc_root.iterdir(), reverse=True):
                    if not batch_dir.is_dir() or batch_dir.name.startswith("."):
                        continue
                    iter_results = []
                    for iter_dir in sorted(batch_dir.iterdir()):
                        if not iter_dir.is_dir() or "_iter_" not in iter_dir.name:
                            continue
                        actions_path = iter_dir / "actions.jsonl"
                        summary_path = iter_dir / "summary.json"
                        if not summary_path.exists():
                            continue
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
                        with open(summary_path) as f:
                            summary = json.load(f)
                        iter_results.append(_IterationResult(
                            iteration_id=iter_dir.name,
                            seed=summary.get("seed", 0),
                            total_rounds=summary.get("total_rounds", 0),
                            total_actions=summary.get("total_actions", len(actions)),
                            actions=actions,
                            summary=summary,
                            cost_usd=summary.get("cost_usd", 0),
                            variation_description=summary.get("variation_description", ""),
                            completed_at=summary.get("completed_at", ""),
                            output_dir=str(iter_dir),
                        ))
                    if iter_results:
                        try:
                            agg = _aggregate_batch(iter_results)
                            mc_aggregation = _asdict(agg)
                            # Write back so next time Tier 1b picks it up
                            agg_out = batch_dir / "aggregation.json"
                            with open(agg_out, "w") as f:
                                json.dump(mc_aggregation, f, indent=2, default=str)
                            logger.info(f"On-the-fly aggregated {len(iter_results)} iteration(s) from {batch_dir}")
                            break
                        except Exception as e:
                            logger.warning(f"On-the-fly aggregation failed for {batch_dir}: {e}")

        # Tier 2: Synthesize from original simulation data
        if mc_aggregation is None:
            mc_aggregation = _synthesize_mc_stats_from_sim(sim_data_list)
            if mc_aggregation:
                logger.info("Synthesized MC stats from simulation data")

        # ─── Step 12: Load stress test results + resilience score ───
        stress_results = []
        resilience = None
        stress_dir = projects_dir / "stress_test"
        if stress_dir.exists():
            from .config_mutator import ConfigMutator
            for entry in sorted(stress_dir.iterdir()):
                summary_path = entry / "summary.json"
                if summary_path.exists():
                    with open(summary_path) as f:
                        stress_results.append(json.load(f))
            if stress_results:
                try:
                    resilience = ConfigMutator.score_resilience(stress_results)
                    logger.info(f"Resilience score: {resilience.get('overall', 'N/A')}")
                except Exception as e:
                    logger.warning(f"Resilience scoring failed: {e}")

        # Fallback: synthesize resilience from team performance scores
        if resilience is None and team_scores:
            resilience = _synthesize_resilience_from_teams(team_scores, sim_data_list)
            if resilience:
                logger.info(f"Synthesized resilience score: {resilience.get('overall', 'N/A')}")

        # ─── Step 13: Load counterfactual comparison ───
        cf_comparison = None
        if branch_ids:
            try:
                from .counterfactual_engine import CounterfactualEngine
                original_sim_id = sim_ids[0] if sim_ids else None
                if original_sim_id:
                    cf_comparison = CounterfactualEngine.compare_branches(original_sim_id, branch_ids)
                    logger.info(f"Loaded CF comparison: {len(branch_ids)} branches")
            except Exception as e:
                logger.warning(f"Counterfactual comparison failed: {e}")

        # ─── Step 14: Generate playbook ───
        logger.info("Step 14: Generating incident response playbook...")
        playbook = _generate_playbook(
            llm, sim_data_list, graph_data, root_causes, conclusions,
            mc_aggregation, cost_tracker,
        )

        # ─── Step 15: Generate attack-path playbook (per-step with MC evidence) ───
        attack_path_playbook = None
        try:
            logger.info("Step 15: Generating attack-path playbook...")
            attack_path_playbook = _generate_attack_path_playbook(
                llm, methodology, mc_aggregation, sim_data_list, graph_data, cost_tracker,
            )
            if attack_path_playbook:
                logger.info(f"Attack-path playbook: {len(attack_path_playbook)} steps generated")
            else:
                logger.warning("Attack-path playbook returned None — will fall back to generic playbook in frontend")
        except Exception as e:
            logger.warning(f"Attack-path playbook generation failed: {e} — frontend will use generic playbook")

        # ─── Step 16: Collect pipeline costs ───
        # Save exercise report costs first so _collect_pipeline_costs can read them
        cost_tracker.save(str(out_dir))
        logger.info("Step 16: Collecting pipeline costs...")
        costs = _collect_pipeline_costs(project_id, sim_data_list)

        # ─── Assemble ───
        report = {
            "projectId": project_id,
            "status": "complete",
            "companyName": company_name,
            "generatedAt": datetime.now(timezone.utc).isoformat(),

            "disclaimer": (
                f"This report presents findings from a predictive simulation exercise "
                f"conducted on {datetime.now(timezone.utc).strftime('%B %d, %Y')}. "
                f"All findings represent modeled outcomes based on simulated attack "
                f"scenarios and should not be interpreted as assessments of actual "
                f"security posture or descriptions of real incidents. Simulated agent "
                f"behaviors are AI-generated approximations and may not reflect actual "
                f"organizational responses."
            ),

            "executiveSummary": exec_summary,
            "conclusions": conclusions,

            "teamPerformance": {
                "teams": team_scores,
                "heatmapData": heatmap_data,
            },

            "rootCauseAnalysis": root_causes,
            "methodology": methodology,
            "appendix": appendix,
            "costs": costs,

            # New 4-view report data
            "monteCarloStats": mc_aggregation,
            "stressTestResults": stress_results if stress_results else None,
            "resilience": resilience,
            "counterfactualComparison": cf_comparison,
            "playbook": playbook,
            "attackPathPlaybook": attack_path_playbook,
        }

        with open(report_path, "w") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        cost_tracker.save(str(out_dir))

        logger.info(f"Exercise report generated for {project_id}")
        if callback_token:
            from .workflow_callback import resume_workflow_hook
            resume_workflow_hook(callback_token, {"status": "complete", "project_id": project_id})

    except Exception as e:
        logger.error(f"Exercise report failed for {project_id}: {e}")
        with open(report_path, "w") as f:
            json.dump({"projectId": project_id, "status": "failed", "error": str(e)}, f)
        if callback_token:
            from .workflow_callback import resume_workflow_hook
            resume_workflow_hook(callback_token, {"status": "failed", "error": str(e), "project_id": project_id})


# ─── Cost aggregation ───

# Map internal phase keys to human-readable names
_PHASE_DISPLAY_NAMES = {
    "research": "Company Research",
    "threat_analysis": "Threat Analysis",
    "config_expansion": "Config Generation",
    "simulation": "Simulation",
    "exercise_report": "Report Generation",
}

# Phases that are project-level (should only be counted once, not per-sim)
_PROJECT_LEVEL_PHASES = {"research", "threat_analysis"}


def _collect_pipeline_costs(project_id: str, sim_data_list: list[dict]) -> dict:
    """Aggregate costs from all simulation and exercise-report costs.json files."""
    _empty_breakdown = lambda: {
        "usd": 0.0, "inputTokens": 0, "outputTokens": 0,
        "cachedTokens": 0, "searchQueries": 0, "searchUsd": 0.0,
        "embeddingTokens": 0, "embeddingUsd": 0.0, "llmUsd": 0.0,
    }
    breakdown: dict[str, dict] = {}
    seen_project_phases = False
    model_name: str | None = None

    def _merge_phases(costs_data: dict, allowed_phases: set[str] | None = None):
        nonlocal model_name
        phases = costs_data.get("phases", {})
        for phase_key, phase_data in phases.items():
            if allowed_phases is not None and phase_key not in allowed_phases:
                continue
            display = _PHASE_DISPLAY_NAMES.get(phase_key, phase_key.replace("_", " ").title())
            if display not in breakdown:
                breakdown[display] = _empty_breakdown()
            b = breakdown[display]
            b["usd"] += phase_data.get("cost_usd", 0.0)
            b["inputTokens"] += phase_data.get("llm_input_tokens", 0)
            b["outputTokens"] += phase_data.get("llm_output_tokens", 0)
            b["cachedTokens"] += phase_data.get("llm_cached_tokens", 0)
            b["searchQueries"] += phase_data.get("search_queries", 0)
            b["searchUsd"] += phase_data.get("search_cost_usd", 0.0)
            b["embeddingTokens"] += phase_data.get("embedding_tokens", 0)
            b["embeddingUsd"] += phase_data.get("embedding_cost_usd", 0.0)
            b["llmUsd"] += phase_data.get("llm_cost_usd", 0.0)

        # Try to extract model name from entries
        if not model_name:
            for entry in costs_data.get("entries", []):
                if entry.get("model"):
                    model_name = entry["model"]
                    break

    # Load costs from each simulation directory
    for sd in sim_data_list:
        sim_id = sd.get("simId", "")
        if not sim_id:
            continue
        costs_data = CostTracker.load(sim_id)
        if not costs_data:
            continue

        if not seen_project_phases:
            # First sim: include project-level phases (research, threat_analysis)
            _merge_phases(costs_data, None)  # all phases
            seen_project_phases = True
        else:
            # Subsequent sims: only sim-level phases (skip project-level to avoid duplication)
            sim_phases = {k for k in costs_data.get("phases", {}) if k not in _PROJECT_LEVEL_PHASES}
            _merge_phases(costs_data, sim_phases)

    # Load exercise report costs
    exercise_costs = CostTracker.load(f"exercise_{project_id}")
    if exercise_costs:
        _merge_phases(exercise_costs, {"exercise_report"})

    # Build ordered breakdown list
    phase_order = list(_PHASE_DISPLAY_NAMES.values())
    breakdown_list = []

    def _format_phase(display_name: str, b: dict) -> dict:
        return {
            "phase": display_name,
            "usd": round(b["usd"], 4),
            "inputTokens": b["inputTokens"],
            "outputTokens": b["outputTokens"],
            "cachedTokens": b["cachedTokens"],
            "llmUsd": round(b["llmUsd"], 4),
            "searchQueries": b["searchQueries"],
            "searchUsd": round(b["searchUsd"], 4),
            "embeddingTokens": b["embeddingTokens"],
            "embeddingUsd": round(b["embeddingUsd"], 4),
        }

    for display_name in phase_order:
        if display_name in breakdown:
            breakdown_list.append(_format_phase(display_name, breakdown[display_name]))
    for display_name, b in breakdown.items():
        if display_name not in phase_order:
            breakdown_list.append(_format_phase(display_name, b))

    total_usd = round(sum(b["usd"] for b in breakdown_list), 4)
    total_input = sum(b["inputTokens"] for b in breakdown_list)
    total_output = sum(b["outputTokens"] for b in breakdown_list)

    # Service-level aggregation
    total_llm_usd = round(sum(b["llmUsd"] for b in breakdown_list), 4)
    total_search_usd = round(sum(b["searchUsd"] for b in breakdown_list), 4)
    total_embed_usd = round(sum(b["embeddingUsd"] for b in breakdown_list), 4)
    total_search_queries = sum(b["searchQueries"] for b in breakdown_list)
    total_cached = sum(b["cachedTokens"] for b in breakdown_list)
    total_embed_tokens = sum(b["embeddingTokens"] for b in breakdown_list)

    result: dict = {
        "totalUsd": total_usd,
        "breakdown": breakdown_list,
        "totalInputTokens": total_input,
        "totalOutputTokens": total_output,
        "totalCachedTokens": total_cached,
        "serviceBreakdown": {
            "llm": {
                "usd": total_llm_usd,
                "inputTokens": total_input,
                "outputTokens": total_output,
                "cachedTokens": total_cached,
            },
            "searchGrounding": {
                "usd": total_search_usd,
                "queries": total_search_queries,
            },
            "embedding": {
                "usd": total_embed_usd,
                "tokens": total_embed_tokens,
            },
        },
    }
    if model_name:
        result["model"] = model_name

    return result


# ─── LLM-powered sections (each a focused call) ───

def _aggregate_teams(sim_data_list: list[dict]) -> dict[str, list[dict]]:
    """Group agents into functional teams."""
    teams: dict[str, list[dict]] = {}
    seen = set()
    for sd in sim_data_list:
        for agent in sd.get("agentProfiles", []):
            name = agent["name"]
            role = agent.get("role", "Unknown")
            team_name = _classify_role(role)
            if name not in seen:
                seen.add(name)
                teams.setdefault(team_name, []).append({"name": name, "role": role})
    return teams


def _generate_team_scores(llm: LLMClient, teams: dict[str, list[dict]],
                          rich_context: str, cost_tracker: CostTracker) -> list[dict]:
    """Score each team with predictive language."""
    team_results = []
    for team_name, members in teams.items():
        roles = [m["role"] for m in members]
        roles_display = ", ".join(_format_role(m["role"]) for m in members)

        prompt = f"""{LEGAL_PREAMBLE}

You are assessing the predicted performance of the "{team_name}" functional team based on a simulation exercise.

Team roles: {roles_display}

{rich_context[:4000]}

Score this TEAM on each dimension (1-10) based on what the simulation predicts about organizational readiness:
- responseSpeed: How quickly would this team likely react?
- containmentEffectiveness: How effectively would containment likely proceed?
- communicationQuality: How well would cross-functional communication likely flow?
- complianceAdherence: How well would regulatory requirements likely be met?
- leadershipDecisiveness: How decisively would this team likely act?

Write a 2-3 sentence narrative using predictive language about what the simulation suggests regarding this team's organizational readiness. Reference specific evidence from the simulation data. Do NOT name individuals.

IMPORTANT: Derive scores from the simulation evidence. Each team should have DIFFERENT scores reflecting their specific strengths and weaknesses. Do NOT use the same scores for every team.

Return ONLY valid JSON:
{{"responseSpeed": <1-10>, "containmentEffectiveness": <1-10>, "communicationQuality": <1-10>, "complianceAdherence": <1-10>, "leadershipDecisiveness": <1-10>, "narrative": "2-3 sentence assessment with evidence"}}"""

        try:
            result = llm.chat_json([{"role": "user", "content": prompt}])
            _track_call(llm, cost_tracker, f"team_score_{team_name}")
            team_results.append({
                "name": team_name,
                "roles": roles,
                "scores": {
                    "responseSpeed": result.get("responseSpeed", 5),
                    "containmentEffectiveness": result.get("containmentEffectiveness", 5),
                    "communicationQuality": result.get("communicationQuality", 5),
                    "complianceAdherence": result.get("complianceAdherence", 5),
                    "leadershipDecisiveness": result.get("leadershipDecisiveness", 5),
                },
                "narrative": result.get("narrative", ""),
            })
        except Exception as e:
            logger.warning(f"Team scoring failed for {team_name}: {e}")
            team_results.append({
                "name": team_name, "roles": roles,
                "scores": {k: 5 for k in ("responseSpeed", "containmentEffectiveness",
                                           "communicationQuality", "complianceAdherence",
                                           "leadershipDecisiveness")},
                "narrative": "Assessment unavailable.",
            })

    return team_results


def _build_heatmap_data(llm: LLMClient, sim_data_list: list[dict],
                        rich_context: str, cost_tracker: CostTracker) -> list[dict]:
    """Build heatmap: scenarios × dimensions."""
    scenario_names = [sd["scenarioName"] for sd in sim_data_list]

    prompt = f"""{LEGAL_PREAMBLE}

Based on this simulation exercise data, rate each scenario's predicted organizational response across 5 dimensions (1-10).

{rich_context[:3000]}

Scenarios to rate: {json.dumps(scenario_names)}

Dimensions: responseSpeed, containmentEffectiveness, communicationQuality, complianceAdherence, leadershipDecisiveness

Return ONLY a JSON array:
[{{"scenario": "Scenario Name", "responseSpeed": 7, "containmentEffectiveness": 5, "communicationQuality": 6, "complianceAdherence": 4, "leadershipDecisiveness": 8}}]"""

    try:
        result = llm.chat_json([{"role": "user", "content": prompt}])
        _track_call(llm, cost_tracker, "heatmap_data")
        if isinstance(result, list):
            heatmap = []
            dims = ["responseSpeed", "containmentEffectiveness", "communicationQuality",
                    "complianceAdherence", "leadershipDecisiveness"]
            for entry in result:
                scenario = entry.get("scenario", "Unknown")
                for dim in dims:
                    heatmap.append({"scenario": scenario, "dimension": dim, "score": entry.get(dim, 5)})
            return heatmap
        return []
    except Exception as e:
        logger.warning(f"Heatmap generation failed: {e}")
        return []


def _generate_root_causes(llm: LLMClient, sim_data_list: list[dict],
                          rich_context: str, cost_tracker: CostTracker) -> list[dict]:
    """5 Whys with MITRE references, business impact, and graph evidence."""
    # Compile MITRE techniques from all scenarios
    mitre_context = ""
    for sd in sim_data_list:
        attack = sd.get("attackPath", {})
        if attack:
            mitre_context += f"\nScenario '{sd['scenarioName']}' — Attack: {attack.get('title', '')}\n"
            for step in attack.get("kill_chain", []):
                mitre_context += f"  {step.get('technique', '?')} ({step.get('tactic', '?')}): {step.get('description', '')[:100]}\n"

    scenario_names = [sd["scenarioName"] for sd in sim_data_list]

    prompt = f"""{LEGAL_PREAMBLE}

You are conducting a 5 Whys root cause analysis based on a predictive simulation exercise.

{rich_context[:5000]}

MITRE ATT&CK Techniques Used in Simulated Scenarios:
{mitre_context}

Identify the top 3-5 predicted systemic gaps. For each, perform 5 Whys analysis tracing from the predicted surface symptom to the organizational root cause.

Rules:
- Frame everything as predictions: "The simulation predicts this gap would likely..."
- Focus on systemic/organizational issues, NOT individual performance
- Each "Why" must logically follow from the previous
- Include a predictedBusinessImpact — what would this cost the organization if it played out? (regulatory penalties, remediation costs, reputational damage)
- Include mitreReference if applicable (e.g., "T1199 — Trusted Relationship")
- Reference which scenarios surfaced this gap

Return ONLY valid JSON:
[
  {{
    "issue": "Brief description of the predicted gap",
    "severity": "critical",
    "fiveWhys": [
      {{"level": 1, "question": "Why would X likely occur?", "answer": "The simulation suggests..."}},
      {{"level": 2, "question": "Why?", "answer": "..."}},
      {{"level": 3, "question": "Why?", "answer": "..."}},
      {{"level": 4, "question": "Why?", "answer": "..."}},
      {{"level": 5, "question": "Why?", "answer": "..."}}
    ],
    "rootCause": "The predicted fundamental organizational gap",
    "predictedBusinessImpact": "Estimated regulatory penalties of $X, plus remediation costs and reputational risk",
    "mitreReference": "T1199 — Trusted Relationship",
    "scenariosAffected": {json.dumps(scenario_names)}
  }}
]"""

    try:
        result = llm.chat_json([{"role": "user", "content": prompt}])
        _track_call(llm, cost_tracker, "root_cause_analysis")
        return result if isinstance(result, list) else []
    except Exception as e:
        logger.warning(f"Root cause analysis failed: {e}")
        return []


def _generate_conclusions(llm: LLMClient, company: str, team_scores: list[dict],
                          root_causes: list[dict], rich_context: str,
                          cost_tracker: CostTracker) -> dict:
    """Executive conclusions with action table, business impact, and regulatory exposure."""
    teams_text = ""
    for t in team_scores:
        teams_text += f"\n{t['name']}: {t['scores']}\n  {t.get('narrative', '')}\n"

    root_causes_text = ""
    for rc in root_causes:
        root_causes_text += f"\n- {rc.get('issue', '?')} [{rc.get('severity', '?')}]"
        root_causes_text += f"\n  Root cause: {rc.get('rootCause', '?')}"
        root_causes_text += f"\n  Business impact: {rc.get('predictedBusinessImpact', 'Not assessed')}"

    prompt = f"""{LEGAL_PREAMBLE}

You are writing the conclusions section of a board-ready exercise report for {company}. Executives read this first.

Team Performance Predictions:
{teams_text}

Predicted Root Causes:
{root_causes_text}

Simulation Context:
{rich_context[:3000]}

IMPORTANT DEDUPLICATION RULES:
- The HEADLINE must be a punchy verdict sentence — NOT the opening sentence of the executive summary. The executive summary is shown separately above this section, so the headline must add new value (e.g., a quantified risk statement or a decision framing).
- KEY FINDINGS describe the BUSINESS IMPACT of each gap (what would it cost?). The Root Cause Analysis section (shown later) already explains WHY these gaps exist organizationally. Do NOT repeat the root cause explanation here — focus on the predicted consequences.
- ACTION ITEMS are STRATEGIC DECISIONS (who owns it, when, budget level). The appendix has separate tactical recommendations per scenario. Do NOT duplicate those here — keep action items at the executive decision level.

Write:
1. A HEADLINE: A punchy one-sentence verdict that frames the key decision for leadership. NOT a restated summary.
   Example: "Three strategic investments totaling an estimated $X over 12 months could reduce the firm's predicted regulatory exposure by 70-80%."

2. KEY FINDINGS (3-6): Each with severity, predicted business impact (quantified), regulatory exposure (cite specific regulations like GDPR Art. 33, SEC S-K 1.05, SOX), and which scenarios. Add an evidenceRef field pointing to the appendix (e.g., "See Appendix — The Legal Gateway Breach"). Focus on CONSEQUENCES, not causes.

3. ACTION ITEMS (3-5): Strategic decisions for the executive team. Each item needs:
   - action: A strategic initiative (NOT a tactical step like "install tool X")
   - predictedRiskReduction: Quantified where possible
   - suggestedOwner: Which executive role should own this
   - suggestedTimeline: When (e.g., "Q2 2026", "Immediate", "Next 90 days")
   - investmentLevel: "High", "Medium", or "Low"
   - addressesFindings: Which finding IDs this addresses

Return ONLY valid JSON:
{{
  "headline": "...",
  "keyFindings": [
    {{"id": "F1", "finding": "...", "severity": "critical", "businessImpact": "...", "regulatoryExposure": "...", "scenariosAffected": [...], "evidenceRef": "..."}}
  ],
  "actionItems": [
    {{"priority": 1, "action": "...", "predictedRiskReduction": "...", "suggestedOwner": "...", "suggestedTimeline": "...", "investmentLevel": "High", "addressesFindings": ["F1"]}}
  ]
}}"""

    try:
        result = llm.chat_json([{"role": "user", "content": prompt}])
        _track_call(llm, cost_tracker, "conclusions")
        return result
    except Exception as e:
        logger.warning(f"Conclusions generation failed: {e}")
        return {"headline": "Exercise report generated.", "keyFindings": [], "actionItems": []}


def _generate_executive_summary(llm: LLMClient, company: str, conclusions: dict,
                                 team_scores: list[dict], root_causes: list[dict],
                                 sim_data_list: list[dict],
                                 cost_tracker: CostTracker) -> str:
    """Board-ready executive summary — written last, uses all prior analysis."""
    scenario_list = ", ".join(sd["scenarioName"] for sd in sim_data_list)
    headline = conclusions.get("headline", "")
    finding_count = len(conclusions.get("keyFindings", []))
    critical_count = sum(1 for f in conclusions.get("keyFindings", []) if f.get("severity") == "critical")
    action_count = len(conclusions.get("actionItems", []))
    root_cause_count = len(root_causes)

    # Collect MITRE techniques with plain-language descriptions
    techniques = []
    for sd in sim_data_list:
        for step in sd.get("attackPath", {}).get("kill_chain", []):
            t = step.get("technique", "")
            if t:
                techniques.append(f"{step.get('description', '')[:80]} ({t}, {step.get('tactic', '')})")

    prompt = f"""{LEGAL_PREAMBLE}

Write a 2-3 paragraph EXECUTIVE SUMMARY for a board-ready simulation exercise report for {company}.

An executive should understand in 60 seconds:
- What was simulated (scenarios: {scenario_list})
- What the model predicts would happen
- The top risks (headline: {headline})
- What decisions need to be made ({action_count} action items proposed)

Key data points:
- {len(sim_data_list)} attack scenarios simulated
- {finding_count} key findings ({critical_count} critical)
- {root_cause_count} organizational root causes identified
- {len(team_scores)} functional teams assessed
- Attack techniques simulated (explain each in plain language, cite MITRE reference in parentheses):
{chr(10).join(f'  - {t}' for t in techniques[:6])}

IMPORTANT: This summary is for a CEO/board audience. Every technical concept must be explained in plain business language FIRST, with the technical reference in parentheses after. For example:
- "attackers exploiting a trusted law firm's credentials to access cloud infrastructure (a technique known as Trusted Relationship abuse, MITRE ref: T1199)"
- NOT: "T1199 initial access via trusted relationship"

Write in predictive language. Be specific about predicted business impact. Do NOT name individuals.
Keep it to 2-3 short paragraphs. No bullet points — this is prose for a board deck.

Return the summary as a plain text string (not JSON)."""

    try:
        result = llm.chat([{"role": "user", "content": prompt}])
        _track_call(llm, cost_tracker, "executive_summary")
        return result
    except Exception as e:
        logger.warning(f"Executive summary failed: {e}")
        return "Executive summary generation unavailable."


def _build_methodology(sim_data_list: list[dict], project: dict) -> dict:
    """Build methodology section with attack paths and regulatory context."""
    scenarios = []
    total_rounds = 0
    total_actions = 0
    agent_names = set()
    attack_paths = []
    regulatory_context = set()

    for sd in sim_data_list:
        config = sd.get("config", {})
        rounds = sd.get("totalRounds", 5)
        actions = sd.get("actionCount", 0)
        total_rounds += rounds
        total_actions += actions

        for agent in sd.get("agentProfiles", []):
            agent_names.add(agent["name"])

        # Get summary from existing report if available
        summary = ""
        existing = sd.get("existingReport", {})
        if existing:
            summary = existing.get("executiveSummary", "")[:300]

        scenarios.append({
            "id": sd.get("simId", ""),
            "title": sd["scenarioName"],
            "summary": summary,
            "rounds": rounds,
        })

        # Attack paths
        attack = sd.get("attackPath", {})
        if attack and attack.get("kill_chain"):
            attack_paths.append({
                "title": attack.get("title", ""),
                "threatName": attack.get("threat_name", ""),
                "killChain": [
                    {
                        "step": s.get("step", 0),
                        "tactic": s.get("tactic", ""),
                        "technique": s.get("technique", ""),
                        "target": s.get("target", ""),
                        "description": s.get("description", ""),
                    }
                    for s in attack.get("kill_chain", [])
                ],
            })

    # Extract regulatory context from graph
    # (compliance nodes are already collected but we get them from the graph query)

    # Build per-scenario world architecture from actions data
    worlds_per_scenario = []
    for sd in sim_data_list:
        sim_actions = sd.get("actions", [])
        config = sd.get("config", {})
        worlds_cfg = config.get("worlds", [])

        # Count actions per world
        world_action_counts: dict[str, int] = {}
        for a in sim_actions:
            w = a.get("world", "Unknown")
            world_action_counts[w] = world_action_counts.get(w, 0) + 1

        worlds_detail = []
        for w in worlds_cfg:
            name = w.get("name", "Unknown")
            participants = w.get("participants", [])
            worlds_detail.append({
                "name": name,
                "type": w.get("type", "slack"),
                "description": w.get("description", ""),
                "participantCount": len(participants) if participants else len(config.get("agent_profiles", [])),
                "actionCount": world_action_counts.get(name, 0),
            })

        worlds_per_scenario.append({
            "scenarioTitle": sd["scenarioName"],
            "worlds": worlds_detail,
            "totalActions": len(sim_actions),
        })

    # Pipeline lifecycle steps
    pipeline_steps = [
        {
            "step": "Company Research",
            "description": f"AI-powered research on the target organization's public profile, technology stack, security posture, and recent events.",
        },
        {
            "step": "Threat Analysis",
            "description": f"Identified {len(scenarios)} threat scenarios with MITRE ATT&CK mapped attack paths based on the company's specific risk profile.",
        },
        {
            "step": "Simulation Design",
            "description": f"Generated {len(agent_names)} agent personas across {sum(len(ws['worlds']) for ws in worlds_per_scenario)} communication channels with role-based access filtering.",
        },
        {
            "step": "Agent-Based Simulation",
            "description": f"Ran {len(scenarios)} scenarios × {total_rounds // len(scenarios) if scenarios else 0} rounds = {total_actions} total agent interactions across Slack and Email channels.",
        },
        {
            "step": "Cross-Scenario Analysis",
            "description": "Root cause analysis using 5 Whys technique, team performance scoring, and executive action recommendations.",
        },
    ]

    return {
        "scenarioCount": len(scenarios),
        "scenarios": scenarios,
        "simulationApproach": (
            f"This predictive exercise simulated {len(scenarios)} incident response "
            f"scenario(s) using AI-driven agent-based modeling. {len(agent_names)} agents "
            f"representing key organizational roles interacted via "
            f"{sum(len(ws['worlds']) for ws in worlds_per_scenario)} simulated communication "
            f"channels while responding to evolving threat conditions over {total_rounds} rounds, "
            f"producing {total_actions} total interactions. The simulation models predict how the "
            f"organization would likely respond based on its current structure, policies, and capabilities."
        ),
        "agentCount": len(agent_names),
        "totalRounds": total_rounds,
        "totalActions": total_actions,
        "attackPaths": attack_paths,
        "worldsPerScenario": worlds_per_scenario,
        "pipelineSteps": pipeline_steps,
    }


def _generate_appendix(llm: LLMClient, sim_data_list: list[dict],
                       cost_tracker: CostTracker) -> dict:
    """Generate detailed per-scenario appendix with LLM analysis of raw actions."""
    scenario_details = []

    for sd in sim_data_list:
        sim_id = sd.get("simId", "")
        title = sd["scenarioName"]
        actions = sd.get("actions", [])

        # Check for existing report first (fast path)
        existing = sd.get("existingReport", {})
        if existing.get("executiveSummary") and existing.get("communicationAnalysis"):
            logger.info(f"Appendix: using existing report for {sim_id}")
            scenario_details.append({
                "scenarioId": sim_id,
                "title": title,
                "executiveSummary": existing.get("executiveSummary", ""),
                "timeline": existing.get("timeline", []),
                "communicationAnalysis": existing.get("communicationAnalysis", ""),
                "tensions": existing.get("tensions", ""),
                "recommendations": existing.get("recommendations", []),
            })
            continue

        # Build timeline from raw actions (no LLM needed)
        timeline = _build_timeline_from_actions(actions)

        # Build actions transcript for LLM context
        actions_text = _format_actions_for_prompt(actions)

        # Single LLM call per scenario for all analysis sections
        logger.info(f"Appendix: generating analysis for {title} ({len(actions)} actions)")

        attack = sd.get("attackPath", {})
        attack_text = ""
        if attack:
            attack_text = f"\nAttack Path: {attack.get('title', '')}\n"
            for step in attack.get("kill_chain", []):
                attack_text += f"  Step {step.get('step')}: {step.get('description', '')[:100]}\n"

        effects = sd.get("cascadingEffects", {})
        effects_text = ""
        if effects:
            for order in ["first_order", "second_order"]:
                items = effects.get(order, [])
                if items:
                    effects_text += f"\n{order.replace('_', ' ').title()}:\n"
                    for item in items[:3]:
                        effects_text += f"  - {item[:120]}\n"

        prompt = f"""{LEGAL_PREAMBLE}

You are writing the detailed appendix analysis for one scenario in a simulation exercise report.

Scenario: {title}
Description: {sd.get('scenario', '')[:400]}
{attack_text}
Predicted Cascading Effects: {effects_text}

Simulation Transcript ({len(actions)} actions across {sd.get('totalRounds', 6)} rounds):
{actions_text}

Write THREE analysis sections for this scenario. Use predictive language throughout.

1. EXECUTIVE SUMMARY (2-3 paragraphs): What the simulation predicts would happen in this scenario. Describe the simulated attack, the predicted organizational response, key decision points, and predicted outcome. Explain technical concepts in plain language.

2. COMMUNICATION ANALYSIS (2-3 paragraphs): How the simulation predicts teams would coordinate. Analyze channel usage (which channels were used for what), information flow gaps, coordination effectiveness, and whether the right roles would receive the right information at the right time.

3. TENSIONS (2-3 paragraphs): Predicted friction points between functional teams. Identify where the simulation suggests competing priorities would create conflict (e.g., speed vs. compliance, containment vs. forensic preservation). How would these tensions likely be resolved?

Return ONLY valid JSON:
{{
  "executiveSummary": "...",
  "communicationAnalysis": "...",
  "tensions": "...",
  "recommendations": ["rec1", "rec2", "rec3", "rec4", "rec5"]
}}"""

        try:
            result = llm.chat_json([{"role": "user", "content": prompt}])
            if llm.last_usage:
                cost_tracker.track_llm(
                    "exercise_report", llm.model,
                    llm.last_usage["input_tokens"],
                    llm.last_usage["output_tokens"],
                    f"appendix_{sim_id}",
                )

            scenario_details.append({
                "scenarioId": sim_id,
                "title": title,
                "executiveSummary": result.get("executiveSummary", sd["scenario"][:500]),
                "timeline": timeline,
                "communicationAnalysis": result.get("communicationAnalysis", ""),
                "tensions": result.get("tensions", ""),
                "recommendations": result.get("recommendations", []),
            })
        except Exception as e:
            logger.warning(f"Appendix analysis failed for {title}: {e}")
            scenario_details.append({
                "scenarioId": sim_id,
                "title": title,
                "executiveSummary": sd["scenario"][:500],
                "timeline": timeline,
                "communicationAnalysis": "",
                "tensions": "",
                "recommendations": [],
            })

    # ─── Cross-scenario comparison (LLM-powered) ───
    cross_scenario = _generate_cross_scenario_comparison(llm, scenario_details, cost_tracker)

    return {
        "scenarioDetails": scenario_details,
        "crossScenarioComparison": cross_scenario,
    }


def _generate_cross_scenario_comparison(
    llm: LLMClient, scenario_details: list[dict], cost_tracker: CostTracker
) -> dict:
    """Generate cross-scenario comparison by analysing all scenario appendix details."""
    if not scenario_details:
        return {"consistentWeaknesses": [], "scenarioFindings": []}

    # Build context from per-scenario analyses
    scenarios_context = ""
    for sd in scenario_details:
        scenarios_context += f"\n### {sd['title']}\n"
        scenarios_context += f"Executive Summary: {sd.get('executiveSummary', '')[:600]}\n"
        scenarios_context += f"Tensions: {sd.get('tensions', '')[:400]}\n"
        recs = sd.get("recommendations", [])
        if recs:
            scenarios_context += f"Recommendations: {'; '.join(recs[:5])}\n"

    prompt = f"""{LEGAL_PREAMBLE}

You are writing the cross-scenario comparison section of a simulation exercise report appendix.

Below are the per-scenario analyses from {len(scenario_details)} simulated incident scenarios:
{scenarios_context}

Analyse ACROSS all scenarios to identify:

1. CONSISTENT WEAKNESSES (3-6): Predicted organizational gaps that appear in MULTIPLE scenarios. These are systemic — not scenario-specific. Each should be a concrete, actionable finding (not vague). Example: "Predicted 45+ minute delay in escalation to executive leadership across both scenarios due to unclear severity classification criteria."

2. PER-SCENARIO FINDINGS: For EACH scenario, list:
   - strengths (2-3): What the organization is predicted to do well
   - weaknesses (2-3): Scenario-specific gaps (distinct from consistent weaknesses above)
   - notableMoments (2-3): Specific predicted decision points or pivotal moments

Return ONLY valid JSON:
{{
  "consistentWeaknesses": ["weakness1", "weakness2", ...],
  "scenarioFindings": [
    {{
      "scenario": "scenario title",
      "strengths": ["strength1", ...],
      "weaknesses": ["weakness1", ...],
      "notableMoments": ["moment1", ...]
    }}
  ]
}}"""

    try:
        logger.info("Generating cross-scenario comparison...")
        result = llm.chat_json([{"role": "user", "content": prompt}])
        if llm.last_usage:
            cost_tracker.track_llm(
                "exercise_report", llm.model,
                llm.last_usage["input_tokens"],
                llm.last_usage["output_tokens"],
                "appendix_cross_scenario",
            )
        return {
            "consistentWeaknesses": result.get("consistentWeaknesses", []),
            "scenarioFindings": result.get("scenarioFindings", []),
        }
    except Exception as e:
        logger.warning(f"Cross-scenario comparison failed: {e}")
        return {
            "consistentWeaknesses": [],
            "scenarioFindings": [
                {"scenario": d["title"], "strengths": [], "weaknesses": [], "notableMoments": []}
                for d in scenario_details
            ],
        }


def _build_timeline_from_actions(actions: list[dict]) -> list[dict]:
    """Build structured timeline entries from raw simulation actions."""
    timeline = []
    seen_rounds: set[int] = set()

    for action in actions:
        round_num = action.get("round", 0)
        if round_num not in seen_rounds:
            seen_rounds.add(round_num)
            # Find the most significant action in this round (first action)
            round_actions = [a for a in actions if a.get("round") == round_num]
            if round_actions:
                first = round_actions[0]
                content = ""
                if first.get("action") in ("send_message", "reply_in_thread"):
                    content = first.get("args", {}).get("content", "")[:200]
                elif first.get("action") == "send_email":
                    content = first.get("args", {}).get("subject", "")
                timeline.append({
                    "round": round_num,
                    "timestamp": first.get("timestamp", ""),
                    "description": f"{_format_role(first.get('role', '?'))} — {content}" if content else f"Round {round_num} began",
                    "significance": "critical" if round_num <= 2 or round_num == max(seen_rounds) else "normal",
                    "agent": _format_role(first.get("role", "")),
                })
    return timeline


def _format_actions_for_prompt(actions: list[dict]) -> str:
    """Format raw actions into a readable transcript for LLM prompts."""
    lines = []
    current_round = 0
    for a in actions:
        r = a.get("round", 0)
        if r != current_round:
            current_round = r
            lines.append(f"\n--- Round {current_round} ---")
        role = _format_role(a.get("role", "?"))
        world = a.get("world", "?")
        content = ""
        if a.get("action") in ("send_message", "reply_in_thread"):
            content = a.get("args", {}).get("content", "")[:250]
        elif a.get("action") == "send_email":
            subject = a.get("args", {}).get("subject", "")
            body = a.get("args", {}).get("body", "")[:200]
            content = f"Email: {subject} — {body}"
        elif a.get("action") == "reply_email":
            content = a.get("args", {}).get("body", "")[:250]
        lines.append(f"[{role}] ({world}): {content}")
    return "\n".join(lines[:200])  # Cap to avoid prompt bloat
