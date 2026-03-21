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
