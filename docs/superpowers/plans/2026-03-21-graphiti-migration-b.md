# Graphiti Migration (Sub-spec B) — Agent Memory + Rich Report Agent

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Crucible simulations intelligent — agents query Graphiti for memory before each action, and the report agent uses temporal graph queries to produce evidence-based after-action reports.

**Architecture:** The simulation runner (`run_crucible_simulation.py`) is modified to initialize a Graphiti instance, push each action as an episode, and query Graphiti for agent-specific context before each LLM call. A new `crucible_report_agent.py` service queries the graph per-section to generate a structured JSON report. The Flask report endpoint is updated to use the new report agent.

**Tech Stack:** graphiti-core 0.28.2 (already installed), kuzu, Python 3.12, OpenAI SDK

**Spec:** `docs/superpowers/specs/2026-03-21-graphiti-migration-b-design.md`
**Depends on:** Sub-spec A (graphiti_manager.py, Kuzu setup — already implemented)

---

## File Structure

### New Files
```
backend/app/services/crucible_report_agent.py   # Rich report agent with Graphiti queries
```

### Modified Files
```
backend/scripts/run_crucible_simulation.py       # Add Graphiti memory: push episodes + query before actions
backend/app/api/crucible.py                      # Report endpoint uses new report agent
```

---

## Task 1: Add Graphiti Memory to Simulation Runner

The biggest change. The simulation runner gets three new capabilities:
1. Initialize Graphiti at simulation start (reusing the project's Kuzu DB)
2. Push each action as a temporal episode after it happens
3. Query Graphiti for agent-specific context before each LLM call

**Files:**
- Modify: `backend/scripts/run_crucible_simulation.py`

- [ ] **Step 1: Add Graphiti imports and initialization**

At the top of `run_crucible_simulation.py`, after the existing imports, add:

```python
from datetime import timezone as tz
# Graphiti imports for agent memory
try:
    from graphiti_core import Graphiti
    from graphiti_core.driver.kuzu_driver import KuzuDriver
    from graphiti_core.llm_client import OpenAIClient, LLMConfig
    from graphiti_core.embedder import OpenAIEmbedder
    from graphiti_core.embedder.openai import OpenAIEmbedderConfig
    from graphiti_core.nodes import EpisodeType
    HAS_GRAPHITI = True
except ImportError:
    HAS_GRAPHITI = False
```

- [ ] **Step 2: Add Graphiti initialization in run_simulation()**

Inside `run_simulation()`, after the OpenAI client setup (around line 172), add:

```python
    # Initialize Graphiti for agent memory (if project has a graph)
    graphiti = None
    project_id = None
    if HAS_GRAPHITI and sim_id.startswith("proj_"):
        project_id = sim_id.replace("_sim", "")
        graphiti_db = str(Path(__file__).parent.parent / "backend" / "data" / "graphiti" / project_id)
        # Also check relative to cwd
        if not Path(graphiti_db).exists():
            graphiti_db = str(Path("data") / "graphiti" / project_id)
        if Path(graphiti_db).exists():
            try:
                kuzu_driver = KuzuDriver(db=graphiti_db)
                llm_client_g = OpenAIClient(LLMConfig(
                    api_key=os.environ.get("LLM_API_KEY", ""),
                    base_url=os.environ.get("LLM_BASE_URL"),
                    model=os.environ.get("LLM_MODEL_NAME", "gpt-4o-mini"),
                ))
                embedder_g = OpenAIEmbedder(OpenAIEmbedderConfig(
                    api_key=os.environ.get("LLM_API_KEY", ""),
                    base_url=os.environ.get("LLM_BASE_URL"),
                ))
                graphiti = Graphiti(graph_driver=kuzu_driver, llm_client=llm_client_g, embedder=embedder_g)
                await graphiti.build_indices_and_constraints()
                print(f"  Graphiti memory enabled (project: {project_id})")
            except Exception as e:
                print(f"  Graphiti memory unavailable: {e}")
                graphiti = None
```

- [ ] **Step 3: Add helper function for agent memory query**

Add this function before `run_simulation()`:

```python
async def _get_agent_memory(graphiti, agent_name: str, world_name: str, project_id: str) -> str:
    """Query Graphiti for agent-specific context."""
    if not graphiti:
        return ""
    try:
        query = f"What has {agent_name} discussed and what decisions have been made in {world_name}?"
        edges = await graphiti.search(
            query=query,
            group_ids=[project_id] if project_id else None,
            num_results=8,
        )
        if not edges:
            return ""
        facts = []
        for edge in edges:
            if edge.fact:
                facts.append(f"- {edge.fact}")
        if not facts:
            return ""
        return "From your memory of previous discussions:\n" + "\n".join(facts[:8])
    except Exception:
        return ""
```

- [ ] **Step 4: Add episode pushing after each action**

Inside the main loop, after the action is logged to actions.jsonl (after line 335), add:

```python
                    # Push action to Graphiti as temporal episode
                    if graphiti and project_id:
                        try:
                            episode_body = ""
                            if action_name in ("send_message", "reply_in_thread"):
                                content = action_args.get("content", "")[:500]
                                episode_body = f"{agent['name']} ({agent['role']}) said in {world_name}: {content}"
                            elif action_name in ("send_email", "reply_email"):
                                subj = action_args.get("subject", "")
                                body_text = action_args.get("body", "")[:300]
                                episode_body = f"{agent['name']} ({agent['role']}) emailed about '{subj}': {body_text}"
                            if episode_body:
                                await graphiti.add_episode(
                                    name=f"{agent['name'].replace(' ', '_')}_r{round_num}_{action_name}",
                                    episode_body=episode_body,
                                    source=EpisodeType.message,
                                    source_description=f"Round {round_num} — {world_name}",
                                    reference_time=datetime.now(timezone.utc),
                                    group_id=project_id,
                                )
                        except Exception as e:
                            print(f"  (Graphiti push failed: {e})")
```

- [ ] **Step 5: Inject memory context into agent prompt**

Inside the main loop, before the LLM call (before line 267), add the memory query and inject it into user_msg:

After building `user_msg` (around line 264), add:

```python
                    # Query Graphiti for agent memory context
                    memory_text = ""
                    if graphiti and project_id:
                        memory_text = await _get_agent_memory(graphiti, agent["name"], world_name, project_id)

                    if memory_text:
                        user_msg = user_msg + f"\n\n{memory_text}"
```

- [ ] **Step 6: Verify script still runs**

```bash
cd backend && uv run python scripts/run_crucible_simulation.py --help
```
Expected: shows help without errors.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/run_crucible_simulation.py
git commit -m "feat: add Graphiti memory to simulation runner — agents query graph before each action"
```

---

## Task 2: Create Rich Report Agent

**Files:**
- Create: `backend/app/services/crucible_report_agent.py`

- [ ] **Step 1: Create crucible_report_agent.py**

```python
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
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && uv run python -c "from app.services.crucible_report_agent import run_report_generation; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/crucible_report_agent.py
git commit -m "feat(backend): add rich report agent with Graphiti-backed evidence queries"
```

---

## Task 3: Wire Report Agent into Flask Endpoint

Replace the old report generation (which called `generate_after_action_report.py` as a subprocess) with the new `crucible_report_agent`.

**Files:**
- Modify: `backend/app/api/crucible.py`

- [ ] **Step 1: Replace the report POST endpoint**

In `backend/app/api/crucible.py`, find the `generate_report(sim_id)` function and replace its body with:

```python
@crucible_bp.route("/simulations/<sim_id>/report", methods=["POST"])
def generate_report(sim_id):
    """Trigger after-action report generation using the report agent."""
    sim_dir = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id
    config_path = sim_dir / "config.json"
    actions_path = sim_dir / "actions.jsonl"
    report_path = sim_dir / "report.json"

    if not config_path.exists() or not actions_path.exists():
        return jsonify({"error": "Simulation data not found"}), 404

    if report_path.exists():
        return jsonify({"data": {"status": "complete"}}), 200

    from ..services.crucible_report_agent import run_report_generation
    run_report_generation(sim_id)
    return jsonify({"data": {"status": "generating"}}), 202
```

This replaces the old subprocess-based approach. The GET endpoint stays the same (reads report.json).

- [ ] **Step 2: Verify Flask app starts**

```bash
cd backend && uv run python -c "from app import create_app; app = create_app(); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/crucible.py
git commit -m "feat(backend): wire report agent into Flask endpoint, replace subprocess approach"
```

---

## Task 4: Integration Test

- [ ] **Step 1: Clean previous data**

```bash
rm -rf backend/data/graphiti/*
rm -rf backend/uploads/crucible_projects/*
rm -rf backend/uploads/simulations/proj_*
```

- [ ] **Step 2: Start servers**

```bash
./start.sh
```

- [ ] **Step 3: Full flow test**

1. Open http://localhost:3000
2. Enter a company URL (e.g. `https://stripe.com`) → Start Research
3. Wait for research to complete → verify dossier shows
4. Click "Confirm & Generate Config" → verify config generates
5. Review config → Launch Simulation
6. Watch simulation dashboard — verify:
   - Messages appear in Slack/Email tabs (scrollable)
   - Graph grows with new nodes on each Refresh
   - Console shows "Graphiti memory enabled" on sim start
7. After completion → View Report
8. Verify report has:
   - Executive summary with specific evidence
   - Timeline entries
   - Agent scorecards with individual scores
   - Recommendations

- [ ] **Step 4: Verify build**

```bash
cd frontend && pnpm build
```

- [ ] **Step 5: Commit any fixes**

```bash
git add -A && git commit -m "fix: address integration test issues for agent memory + report"
```
