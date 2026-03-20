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
    roles_desc = "\n".join(
        f"- {r['title']} in {r['department']}, reports to {r['reportsTo']}"
        for r in org.get("roles", [])
    )
    systems_desc = "\n".join(
        f"- {s['name']} ({s['category']}, criticality: {s['criticality']})"
        for s in dossier.get("systems", [])
    )
    compliance_desc = ", ".join(dossier.get("compliance", []))
    risks_desc = "\n".join(
        f"- {r['name']} (likelihood: {r['likelihood']}, impact: {r['impact']})"
        for r in dossier.get("risks", [])
    )
    events_desc = "\n".join(
        f"- [{e['date']}] {e['description']}"
        for e in dossier.get("recentEvents", [])
    )

    prompt = f"""You are a simulation architect. Generate a complete enterprise incident response simulation config for the following company.

## Company
Name: {company.get('name', 'Unknown')}
Industry: {company.get('industry', 'Unknown')}
Size: {company.get('size', 'medium')}
Products: {', '.join(company.get('products', []))}
Geography: {company.get('geography', 'Unknown')}

## Org Structure
{roles_desc}

## Technology Stack
{systems_desc}

## Compliance Requirements
{compliance_desc}

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
