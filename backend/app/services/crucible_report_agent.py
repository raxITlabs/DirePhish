# backend/app/services/crucible_report_agent.py
"""
Crucible Report Agent — generates structured after-action reports by querying
the Graphiti temporal knowledge graph for evidence-based analysis.
"""
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from ..config import Config
from ..utils.llm_client import LLMClient
from ..utils.logger import get_logger
from . import project_manager, graphiti_manager

logger = get_logger("crucible_report_agent")


def run_report_generation(sim_id: str) -> None:
    """Generate a report in a background thread."""
    thread = threading.Thread(target=_generate_report, args=(sim_id,), daemon=True)
    thread.start()


def _generate_report(sim_id: str) -> None:
    """Full report generation pipeline."""
    try:
        sim_dir = Path(Config.UPLOAD_FOLDER) / "simulations" / sim_id
        config_path = sim_dir / "config.json"
        actions_path = sim_dir / "actions.jsonl"
        report_path = sim_dir / "report.json"

        if not config_path.exists() or not actions_path.exists():
            logger.error(f"Missing config or actions for {sim_id}")
            return

        with open(config_path) as f:
            config = json.load(f)
        actions = _read_actions(actions_path)

        # Derive project_id for Graphiti queries
        project_id = sim_id.replace("_sim", "") if sim_id.startswith("proj_") else None

        # Query Graphiti for evidence (if available)
        graph_context = {}
        if project_id:
            graph_context = _query_graph_for_report(project_id, config, actions)

        # Generate each report section via LLM
        llm = LLMClient()
        company = config.get("company_name", "Company")
        scenario = config.get("scenario", "")
        agents = config.get("agent_profiles", [])
        timeline_text = _format_timeline(actions)

        # Executive Summary
        summary = _generate_section(llm, "executive_summary", company, scenario, timeline_text, graph_context)

        # Timeline entries
        timeline = _generate_timeline_entries(llm, actions, graph_context)

        # Communication Analysis
        comm = _generate_section(llm, "communication", company, scenario, timeline_text, graph_context)

        # Tensions
        tensions = _generate_section(llm, "tensions", company, scenario, timeline_text, graph_context)

        # Agent Scorecards
        agent_scores = _generate_agent_scores(llm, agents, actions, graph_context)

        # Recommendations
        recs = _generate_recommendations(llm, company, scenario, timeline_text, graph_context)

        report = {
            "simId": sim_id,
            "status": "complete",
            "companyName": company,
            "scenarioName": scenario[:100],
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "duration": f"{config.get('total_rounds', 5)} rounds",
            "executiveSummary": summary,
            "timeline": timeline,
            "communicationAnalysis": comm,
            "tensions": tensions,
            "agentScores": agent_scores,
            "recommendations": recs,
        }

        with open(report_path, "w") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        logger.info(f"Report generated for {sim_id}")

    except Exception as e:
        logger.error(f"Report generation failed for {sim_id}: {e}")
        # Write error report so frontend knows
        report_path = Path(Config.UPLOAD_FOLDER) / "simulations" / sim_id / "report.json"
        with open(report_path, "w") as f:
            json.dump({"simId": sim_id, "status": "failed", "error": str(e)}, f)


def _query_graph_for_report(project_id: str, config: dict, actions: list[dict]) -> dict:
    """Query Graphiti for evidence to enrich the report."""
    context = {"key_facts": [], "agent_facts": {}, "temporal_facts": []}

    try:
        graphiti = graphiti_manager._get_graphiti(project_id)

        # Key facts about the overall situation
        key_edges = graphiti_manager._run_async(graphiti.search(
            query="What were the major events, decisions, and outcomes?",
            group_ids=[project_id],
            num_results=15,
        ))
        context["key_facts"] = [e.fact for e in (key_edges or []) if e.fact]

        # Per-agent facts
        for agent in config.get("agent_profiles", []):
            name = agent["name"]
            agent_edges = graphiti_manager._run_async(graphiti.search(
                query=f"What did {name} do and contribute?",
                group_ids=[project_id],
                num_results=8,
            ))
            context["agent_facts"][name] = [e.fact for e in (agent_edges or []) if e.fact]

        # Temporal analysis — what changed over time
        temporal_edges = graphiti_manager._run_async(graphiti.search(
            query="How did the team's approach and understanding change over time?",
            group_ids=[project_id],
            num_results=10,
        ))
        context["temporal_facts"] = [e.fact for e in (temporal_edges or []) if e.fact]

    except Exception as e:
        logger.warning(f"Graph query failed for report: {e}")

    return context


def _generate_section(llm: LLMClient, section: str, company: str, scenario: str,
                      timeline: str, graph_context: dict) -> str:
    """Generate a single report section via LLM."""
    key_facts = "\n".join(f"- {f}" for f in graph_context.get("key_facts", [])[:10])
    temporal_facts = "\n".join(f"- {f}" for f in graph_context.get("temporal_facts", [])[:5])

    prompts = {
        "executive_summary": f"""Write an executive summary (3-4 paragraphs) of this incident response simulation for {company}.

Scenario: {scenario}

Key facts from the knowledge graph:
{key_facts}

Temporal evolution:
{temporal_facts}

Timeline of actions:
{timeline[:3000]}

Write a professional executive summary covering: what happened, how the team responded, key decisions and their impact, and the outcome. Reference specific agent actions and decisions.""",

        "communication": f"""Analyze the communication effectiveness during this simulation for {company}.

Key facts:
{key_facts}

Timeline:
{timeline[:3000]}

Analyze: How well did agents coordinate across Slack and Email? Were there communication gaps? Did the right people get the right information at the right time? Be specific with examples.""",

        "tensions": f"""Identify the key tensions and conflicts during this simulation for {company}.

Key facts:
{key_facts}

Temporal evolution:
{temporal_facts}

Timeline:
{timeline[:3000]}

Identify: Where did agents disagree? What were the core tensions (e.g., speed vs. safety, containment vs. uptime)? How were conflicts resolved? Be specific with quotes and examples.""",
    }

    prompt = prompts.get(section, f"Analyze the {section} of this simulation.")
    try:
        return llm.chat([{"role": "user", "content": prompt}])
    except Exception as e:
        logger.warning(f"LLM call failed for section {section}: {e}")
        return f"Analysis unavailable: {e}"


def _generate_timeline_entries(llm: LLMClient, actions: list[dict], graph_context: dict) -> list[dict]:
    """Generate structured timeline entries from actions."""
    entries = []
    seen_rounds = set()
    for action in actions:
        round_num = action.get("round", 0)
        if round_num not in seen_rounds:
            seen_rounds.add(round_num)
            # Find the most significant action in this round
            round_actions = [a for a in actions if a.get("round") == round_num]
            if round_actions:
                first = round_actions[0]
                content = ""
                if first.get("action") in ("send_message", "reply_in_thread"):
                    content = first.get("args", {}).get("content", "")[:200]
                elif first.get("action") == "send_email":
                    content = first.get("args", {}).get("subject", "")
                entries.append({
                    "round": round_num,
                    "timestamp": first.get("timestamp", ""),
                    "description": f"{first.get('agent', '')} — {content}" if content else f"Round {round_num} began",
                    "significance": "critical" if round_num == 1 or round_num == len(seen_rounds) else "normal",
                    "agent": first.get("agent", ""),
                })
    return entries


def _generate_agent_scores(llm: LLMClient, agents: list[dict], actions: list[dict],
                           graph_context: dict) -> list[dict]:
    """Generate per-agent scorecards with Graphiti evidence."""
    scores = []
    for agent in agents:
        name = agent["name"]
        role = agent["role"]
        agent_actions = [a for a in actions if a.get("agent") == name]
        agent_facts = graph_context.get("agent_facts", {}).get(name, [])

        # Count actions by world
        world_breakdown = {}
        for a in agent_actions:
            w = a.get("world", "Unknown")
            world_breakdown[w] = world_breakdown.get(w, 0) + 1

        # Generate score via LLM
        facts_text = "\n".join(f"- {f}" for f in agent_facts[:5])
        actions_summary = "\n".join(
            f"- R{a['round']} {a['world']}: {a['action']}({json.dumps(a.get('args', {}), ensure_ascii=False)[:100]})"
            for a in agent_actions[:10]
        )

        prompt = f"""Score this agent's performance in an incident response simulation (1-10).

Agent: {name} ({role})
Persona: {agent.get('persona', '')}

Their actions:
{actions_summary}

Knowledge graph facts about them:
{facts_text}

Return ONLY valid JSON:
{{"score": 7, "strengths": ["strength1", "strength2"], "weaknesses": ["weakness1"]}}"""

        try:
            result = llm.chat_json([{"role": "user", "content": prompt}])
            scores.append({
                "name": name,
                "role": role,
                "score": result.get("score", 5),
                "strengths": result.get("strengths", []),
                "weaknesses": result.get("weaknesses", []),
                "actionCount": len(agent_actions),
                "worldBreakdown": world_breakdown,
            })
        except Exception:
            scores.append({
                "name": name,
                "role": role,
                "score": 5,
                "strengths": [],
                "weaknesses": [],
                "actionCount": len(agent_actions),
                "worldBreakdown": world_breakdown,
            })

    return scores


def _generate_recommendations(llm: LLMClient, company: str, scenario: str,
                               timeline: str, graph_context: dict) -> list[str]:
    """Generate improvement recommendations."""
    key_facts = "\n".join(f"- {f}" for f in graph_context.get("key_facts", [])[:10])
    temporal_facts = "\n".join(f"- {f}" for f in graph_context.get("temporal_facts", [])[:5])

    prompt = f"""Based on this incident response simulation for {company}, generate 5-7 specific, actionable recommendations for improvement.

Scenario: {scenario}

Key facts:
{key_facts}

Temporal evolution:
{temporal_facts}

Timeline:
{timeline[:2000]}

Return ONLY a JSON array of strings: ["recommendation 1", "recommendation 2", ...]"""

    try:
        result = llm.chat_json([{"role": "user", "content": prompt}])
        if isinstance(result, list):
            return result
        return result.get("recommendations", []) if isinstance(result, dict) else []
    except Exception:
        return ["Review and improve incident response procedures based on simulation findings."]


def _format_timeline(actions: list[dict]) -> str:
    """Format actions into a readable timeline for LLM prompts."""
    lines = []
    current_round = 0
    for a in actions:
        if a.get("round", 0) != current_round:
            current_round = a["round"]
            lines.append(f"\n--- Round {current_round} ---")
        detail = ""
        if a.get("action") == "send_message":
            detail = a.get("args", {}).get("content", "")[:200]
        elif a.get("action") == "send_email":
            detail = f"Email: {a.get('args', {}).get('subject', '')}"
        elif a.get("action") == "reply_in_thread":
            detail = f"(thread) {a.get('args', {}).get('content', '')[:200]}"
        lines.append(f"[{a.get('agent', '?')}] {a.get('world', '?')}: {detail}")
    return "\n".join(lines)


def _read_actions(path: Path) -> list[dict]:
    """Read actions.jsonl."""
    actions = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    actions.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return actions
