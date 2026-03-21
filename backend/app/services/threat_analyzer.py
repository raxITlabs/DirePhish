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


def _extract_list(result) -> list:
    """Extract a list from chat_json result — handles both bare arrays and wrapper objects.
    JSON mode often requires a top-level object, so the LLM may wrap arrays like {"threats": [...]}."""
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        # Return the first list value found
        for v in result.values():
            if isinstance(v, list):
                return v
    return []


def run_threat_analysis(project_id: str) -> None:
    """Run threat analysis in a background thread."""
    thread = threading.Thread(target=_analysis_pipeline, args=(project_id,), daemon=True)
    thread.start()


def _analysis_pipeline(project_id: str) -> None:
    """Execute the 4-step threat intelligence pipeline."""
    try:
        project_manager.update_project(project_id,
            status="analyzing_threats", progress=10,
            progress_message="Analyzing threat landscape...")
        # Safe: the auto-chain hook only fires on transition TO "research_complete",
        # so setting "analyzing_threats" here won't re-trigger it.

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

    return _extract_list(llm.chat_json([{"role": "user", "content": prompt}]))


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

    return _extract_list(llm.chat_json([{"role": "user", "content": prompt}]))


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

    return _extract_list(llm.chat_json([{"role": "user", "content": prompt}]))


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
