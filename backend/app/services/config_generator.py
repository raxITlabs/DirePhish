# backend/app/services/config_generator.py
"""
Config Generator — reads Zep graph + company dossier and generates a full
SimulationConfig via LLM, matching the format run_crucible_simulation.py expects.
"""
import json
import threading

from ..utils.llm_client import LLMClient
from ..utils.logger import get_logger
from . import project_manager

logger = get_logger("config_generator")


def run_config_generation(project_id: str) -> None:
    """Generate simulation config in a background thread."""
    thread = threading.Thread(target=_generate_pipeline, args=(project_id,), daemon=True)
    thread.start()


def _generate_pipeline(project_id: str) -> None:
    """Generate a full SimulationConfig from the dossier."""
    try:
        project_manager.update_project(
            project_id,
            status="generating_config",
            progress=10,
            progress_message="Generating simulation config...",
        )

        dossier = project_manager.get_dossier(project_id)
        if not dossier:
            raise ValueError("No dossier found for project")

        project = project_manager.get_project(project_id)
        user_context = project.get("user_context", "")

        config = _generate_config(dossier, user_context, project_id)
        project_manager.save_config(project_id, config)

        project_manager.update_project(
            project_id,
            status="config_ready",
            progress=100,
            progress_message="Config ready.",
        )
    except Exception as e:
        logger.error(f"Config generation failed for {project_id}: {e}")
        project_manager.update_project(
            project_id,
            status="failed",
            error_message=str(e),
            progress_message="Config generation failed.",
        )


def _generate_config(dossier: dict, user_context: str, project_id: str) -> dict:
    """Use LLM to generate a full simulation config from the dossier."""
    llm = LLMClient()

    company = dossier.get("company", {})
    org = dossier.get("org", {})

    # -- Company section with enriched fields --
    size_parts = [company.get("size", "medium")]
    if company.get("employeeCount"):
        size_parts.append(f"~{company['employeeCount']} employees")
    if company.get("founded"):
        size_parts.append(f"founded {company['founded']}")
    if company.get("revenue"):
        size_parts.append(f"~{company['revenue']} revenue")
    size_line = " (".join([size_parts[0], ", ".join(size_parts[1:])]) + ")" if len(size_parts) > 1 else size_parts[0]

    company_lines = [
        f"Name: {company.get('name', 'Unknown')}",
        f"Industry: {company.get('industry', 'Unknown')}",
        f"Size: {size_line}",
        f"Products: {', '.join(company.get('products', []))}",
        f"Geography: {company.get('geography', 'Unknown')}",
    ]
    if company.get("description"):
        company_lines.append(f"Description: {company['description']}")
    company_desc = "\n".join(company_lines)

    # -- Org Structure with name and responsibilities --
    role_lines = []
    for r in org.get("roles", []):
        title = r.get("title", "Unknown")
        dept = r.get("department", "Unknown")
        reports_to = r.get("reportsTo", "Unknown")
        name = r.get("name")
        responsibilities = r.get("responsibilities")

        if name:
            line = f"- {name} ({title}) in {dept}, reports to {reports_to}"
        else:
            line = f"- {title} in {dept}, reports to {reports_to}"
        if responsibilities:
            line += f" — {responsibilities}"
        role_lines.append(line)
    roles_desc = "\n".join(role_lines)

    # -- Technology Stack with vendor and description --
    system_lines = []
    for s in dossier.get("systems", []):
        line = f"- {s.get('name', 'Unknown')} ({s.get('category', 'unknown')}, criticality: {s.get('criticality', 'unknown')})"
        vendor = s.get("vendor")
        if vendor:
            line += f" [Vendor: {vendor}]"
        desc = s.get("description")
        if desc:
            line += f" — {desc}"
        system_lines.append(line)
    systems_desc = "\n".join(system_lines)

    compliance_desc = ", ".join(dossier.get("compliance", []))

    # -- Security Posture (new section, only if present) --
    security_posture_section = ""
    sec = dossier.get("securityPosture")
    if sec:
        sp_lines = []
        if sec.get("certifications"):
            sp_lines.append(f"Certifications: {', '.join(sec['certifications'])}")
        if sec.get("securityTeamSize"):
            sp_lines.append(f"Security Team: {sec['securityTeamSize']} people")
        if sec.get("tools"):
            sp_lines.append(f"Tools: {', '.join(sec['tools'])}")
        if sec.get("irPlan") is not None:
            sp_lines.append(f"IR Plan: {'Yes' if sec['irPlan'] else 'No'}")
        if sec.get("bugBounty") is not None:
            sp_lines.append(f"Bug Bounty: {'Yes' if sec['bugBounty'] else 'No'}")
        if sp_lines:
            security_posture_section = "\n\n## Security Posture\n" + "\n".join(sp_lines)

    # -- Risk Profile with description, affected systems, mitigations --
    risk_lines = []
    for r in dossier.get("risks", []):
        line = f"- {r.get('name', 'Unknown')} (likelihood: {r.get('likelihood', 'unknown')}, impact: {r.get('impact', 'unknown')})"
        desc = r.get("description")
        if desc:
            line += f" — {desc}"
        affected = r.get("affectedSystems")
        if affected:
            line += f" Affects: {', '.join(affected)}."
        mitigations = r.get("mitigations")
        if mitigations:
            line += f" Mitigations: {', '.join(mitigations) if isinstance(mitigations, list) else mitigations}"
        risk_lines.append(line)
    risks_desc = "\n".join(risk_lines)

    # -- Recent Events with category and impact --
    event_lines = []
    for e in dossier.get("recentEvents", []):
        date = e.get("date", "unknown")
        description = e.get("description", "")
        category = e.get("category")
        impact = e.get("impact")

        line = f"- [{date}]"
        if category:
            line += f" [{category}]"
        line += f" {description}"
        if impact:
            line += f" Impact: {impact}"
        event_lines.append(line)
    events_desc = "\n".join(event_lines)

    prompt = f"""You are a simulation architect. Generate a complete enterprise incident response simulation config for the following company.

## Company
{company_desc}

## Org Structure
{roles_desc}

## Technology Stack
{systems_desc}

## Compliance Requirements
{compliance_desc}{security_posture_section}

## Risk Profile
{risks_desc}

## Recent Events
{events_desc}

## User Context
{user_context if user_context else "No specific scenario requested — choose the most realistic incident for this company."}

## Output Format
Return ONLY valid JSON matching this EXACT structure:
{{
  "simulation_id": "{project_id}_sim",
  "company_name": "{company.get('name', 'Company')}",
  "total_rounds": 5,
  "hours_per_round": 1.0,
  "scenario": "A detailed 3-5 sentence description of the opening incident situation...",
  "worlds": [
    {{ "type": "slack", "name": "IR War Room" }},
    {{ "type": "email", "name": "Corporate Email" }}
  ],
  "scheduled_events": [
    {{ "round": 3, "description": "A realistic escalation event..." }},
    {{ "round": 4, "description": "An external pressure event..." }}
  ],
  "pressures": [
    {{
      "name": "Pressure Name",
      "type": "countdown|threshold|deadline|triggered",
      "affects_roles": ["role1", "role2"],
      "hours": 72,
      "severity_at_50pct": "high",
      "severity_at_25pct": "critical"
    }}
  ],
  "agent_profiles": [
    {{
      "name": "Realistic Full Name",
      "role": "role_id",
      "persona": "A detailed 2-3 sentence personality description with experience, communication style, biases, and tensions..."
    }}
  ]
}}

REQUIREMENTS:
- Generate 5-8 agent profiles with realistic diverse names and detailed personas
- Include at least 2 worlds (Slack + Email)
- Include 2-3 pressures based on the compliance requirements
- Include 2-3 scheduled events that escalate across rounds
- The scenario should be specific to this company's industry and risk profile
- Each persona should include potential tensions with other team members"""

    config = llm.chat_json([{"role": "user", "content": prompt}])
    return config
