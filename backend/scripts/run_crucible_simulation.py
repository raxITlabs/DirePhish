#!/usr/bin/env python3
"""Crucible simulation runner for DirePhish.

Takes a JSON config describing agents, worlds, and pressures, then runs
a multi-round simulation where each agent interacts with each world
via LLM-driven tool calls.

Usage:
    uv run python scripts/run_crucible_simulation.py \
        --config uploads/test_crucible_config.json \
        --output outputs/sim_run_001
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
_env_path = Path(__file__).parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path, override=True)

from openai import AsyncOpenAI, OpenAI

# Firestore memory (replaces Graphiti)
try:
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from app.services.firestore_memory import FirestoreMemory
    HAS_FIRESTORE = True
except ImportError:
    HAS_FIRESTORE = False

try:
    from app.utils.console import MissionControl as mc
except ImportError:
    mc = None  # Fallback for direct script execution

import crucible
from crucible import (
    AgentInfo,
    CrucibleEnv,
    ManualAction,
    PlatformConfig,
    PressureConfig,
    load_platform_config,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CRUCIBLE_BUILTINS = Path(crucible.__file__).parent / "builtins" / "channels"


def _load_world_config(world_type: str) -> PlatformConfig:
    """Load a builtin platform YAML config by world type (e.g. 'slack')."""
    yaml_path = CRUCIBLE_BUILTINS / f"{world_type}.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(
            f"No builtin channel config for type '{world_type}' at {yaml_path}"
        )
    return load_platform_config(str(yaml_path))


def _actions_to_openai_tools(actions: list) -> list[dict]:
    """Convert Crucible ActionConfig list to OpenAI function-calling tools."""
    tools = []
    for act in actions:
        properties = {}
        required = []
        for param in act.parameters:
            properties[param.name] = {
                "type": param.type if param.type in ("string", "number", "boolean") else "string",
                "description": param.description,
            }
            required.append(param.name)

        tools.append(
            {
                "type": "function",
                "function": {
                    "name": act.name,
                    "description": act.description,
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": required,
                    },
                },
            }
        )
    return tools


async def _call_llm_async(
    client: AsyncOpenAI,
    model: str,
    system_message: str,
    user_message: str,
    tools: list[dict] | None = None,
    temperature: float = 0.7,
) -> tuple[str, dict, dict]:
    """Async LLM call. Returns (action_name, action_args, usage).

    Falls back to 'do_nothing' if the model doesn't produce a tool call.
    """
    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    response = await client.chat.completions.create(**kwargs)

    usage = {}
    if response.usage:
        usage = {
            "input_tokens": response.usage.prompt_tokens or 0,
            "output_tokens": response.usage.completion_tokens or 0,
        }

    message = response.choices[0].message

    if message.tool_calls:
        tc = message.tool_calls[0]
        action_name = tc.function.name
        try:
            action_args = json.loads(tc.function.arguments)
        except json.JSONDecodeError:
            action_args = {}
        return action_name, action_args, usage

    # No tool call -- treat as do_nothing
    return "do_nothing", {}, usage


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


# ---------------------------------------------------------------------------
# Firestore memory helper
# ---------------------------------------------------------------------------

def _get_agent_memory_sync(memory: "FirestoreMemory | None", sim_id: str, agent_name: str, world_name: str) -> str:
    """Query Firestore for agent-specific context."""
    if not memory:
        return ""
    try:
        return memory.get_agent_memory(sim_id, agent_name, world_name)
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Arbiter (Adaptive Depth)
# ---------------------------------------------------------------------------

async def _arbiter_evaluate_async(
    client: AsyncOpenAI,
    model: str,
    all_actions: list[dict],
    round_num: int,
    total_rounds: int,
    active_events: list[str],
    config: dict,
    temperature: float = 0.3,
) -> dict:
    """Evaluate whether the simulation should continue (async).

    Returns: {"continue": bool, "reason": str, "stop_condition": str|None, "inject_complication": str|None}
    """
    # Build concise summary of last 3 rounds
    recent_rounds = [a for a in all_actions if a.get("round", 0) > round_num - 3]
    recent_summary = []
    for a in recent_rounds[-15:]:  # cap to 15 entries
        recent_summary.append(
            f"R{a.get('round')} {a.get('agent')} in {a.get('world')}: {a.get('action')}"
        )

    # Stagnation score: unique action types / total actions in last 3 rounds
    recent_action_types = [a.get("action", "") for a in recent_rounds]
    stagnation_score = (
        len(set(recent_action_types)) / len(recent_action_types)
        if recent_action_types
        else 1.0
    )

    # Active pressures from config
    active_pressures = [p.get("name", p.get("type", "")) for p in config.get("pressures", [])]

    prompt = f"""You are a simulation arbiter. Decide whether a cybersecurity tabletop simulation should CONTINUE or STOP.

Current state:
- Round: {round_num} / {total_rounds} (max)
- Stagnation score: {stagnation_score:.2f} (lower = more repetitive; <0.3 is very stagnant)
- Active pressures: {', '.join(active_pressures) or 'none'}
- Active events: {', '.join(active_events) or 'none'}

Last 3 rounds of actions:
{chr(10).join(recent_summary) or '(no actions yet)'}

Stop conditions (use these exact labels):
- "contained": Defenders have identified AND isolated the threat AND started communications
- "stagnant": Agents are repeating the same actions (stagnation score < 0.3 for multiple rounds)
- "catastrophic": Data exfiltration confirmed AND no containment AND regulatory deadline pressure expired

You may also inject a complication to keep the simulation interesting (a new event that changes the situation).

Respond with JSON only:
{{"continue": true/false, "reason": "brief explanation", "stop_condition": null or "contained"/"stagnant"/"catastrophic", "inject_complication": null or "description of new event"}}"""

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a simulation arbiter. Respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
        )
        raw = response.choices[0].message.content or ""
        # Strip markdown fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
        result = json.loads(raw)
        # Ensure required keys
        result.setdefault("continue", True)
        result.setdefault("reason", "")
        result.setdefault("stop_condition", None)
        result.setdefault("inject_complication", None)
        return result
    except (json.JSONDecodeError, Exception) as e:
        print(f"  ⚠ Arbiter parse error: {e}, defaulting to continue")
        return {"continue": True, "reason": f"parse error: {e}", "stop_condition": None, "inject_complication": None}


# ---------------------------------------------------------------------------
# Main simulation loop
# ---------------------------------------------------------------------------

async def run_single_iteration(
    config: dict,
    output_dir: str,
    client: "AsyncOpenAI | OpenAI | None" = None,
    model: str | None = None,
    cost_tracker: "CostTracker | None" = None,
    memory: "FirestoreMemory | None" = None,
    temperature_override: float | None = None,
    iteration_id: str | None = None,
) -> dict:
    """Run a single simulation iteration. Returns IterationResult dict.

    Accepts pre-created dependencies for Monte Carlo orchestration.
    When called standalone (e.g. via ``run_simulation``), dependencies are
    created automatically from environment variables.
    """
    from app.utils.cost_tracker import CostTracker

    start_time = time.time()
    if mc:
        mc.phase("SIMULATION", iteration_id or config.get("simulation_id", ""))

    # --- Dependency defaults (backward compat) --------------------------------
    if client is None:
        client = AsyncOpenAI(
            api_key=os.environ.get("LLM_API_KEY", ""),
            base_url=os.environ.get("LLM_BASE_URL"),
        )
    elif isinstance(client, OpenAI) and not isinstance(client, AsyncOpenAI):
        # Backward compat: wrap sync client into async with same config
        client = AsyncOpenAI(
            api_key=client.api_key,
            base_url=str(client.base_url) if client.base_url else None,
        )
    if model is None:
        model = os.environ.get("LLM_MODEL_NAME", "gpt-4o-mini")

    sim_id = config["simulation_id"]

    if cost_tracker is None:
        cost_tracker = CostTracker(sim_id)
        # Load existing costs from research phase if available
        config_project_id = config.get("project_id")
        if config_project_id:
            research_costs_path = os.path.join("uploads", "crucible_projects", config_project_id, "costs.json")
            if os.path.exists(research_costs_path):
                with open(research_costs_path) as _f:
                    prev = json.load(_f)
                    cost_tracker.entries = prev.get("entries", [])

    if memory is None and HAS_FIRESTORE:
        try:
            memory = FirestoreMemory(cost_tracker=cost_tracker)
            if mc: mc.research_step(sim_id, "Firestore memory enabled")
        except Exception as e:
            if mc: mc.warning(f"Firestore memory unavailable: {e}")
            memory = None

    # Pre-create GraphContext once for all agent calls (singleton Firestore client underneath)
    graph_ctx = None
    try:
        from app.services.graph_context import GraphContext
        graph_ctx = GraphContext(config.get("project_id", sim_id))
    except Exception:
        pass  # Graph context is optional

    # Resolve effective temperature
    effective_temperature = temperature_override or config.get("_temperature_override", 0.7)

    total_rounds = config["total_rounds"]
    hours_per_round = config.get("hours_per_round", 1.0)
    worlds_cfg = config["worlds"]
    pressures_cfg = config["pressures"]
    agent_profiles = config["agent_profiles"]

    # Partition agents into attackers and defenders
    from app.services.adversarial_agent import (
        partition_agents,
        build_adversarial_system_prompt,
        build_defender_observation,
        detect_defender_actions,
        attacker_actions_to_injects,
    )
    attacker_agents, defender_agents = partition_agents(agent_profiles)
    has_adversarial = len(attacker_agents) > 0
    if has_adversarial:
        if mc: mc.research_step(sim_id, f"Adversarial mode: {len(attacker_agents)} attacker(s), {len(defender_agents)} defender(s)")

    # Prepare output directory
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    actions_log = out / "actions.jsonl"
    db_dir = str(out / "dbs")
    Path(db_dir).mkdir(parents=True, exist_ok=True)

    # Load platform configs from builtins, override name with world name
    world_configs: list[PlatformConfig] = []
    world_participants: dict[str, list[str]] = {}
    for w in worlds_cfg:
        pc = _load_world_config(w["type"])
        pc = pc.model_copy(update={"name": w["name"]})
        world_configs.append(pc)
        # Store participant filtering (new: agents only act in their channels)
        if w.get("participants"):
            world_participants[w["name"]] = w["participants"]

    # Build pressure configs
    pressure_configs = [PressureConfig(**p) for p in pressures_cfg]

    # Create CrucibleEnv with per-world participant filtering
    env = CrucibleEnv(
        world_configs=world_configs,
        pressure_configs=pressure_configs,
        db_dir=db_dir,
        hours_per_round=hours_per_round,
        world_participants=world_participants,
    )

    # Pre-build tools per world
    tools_per_world: dict[str, list[dict]] = {}
    for wc in world_configs:
        tools_per_world[wc.name] = _actions_to_openai_tools(wc.actions)

    # Keep template strings per world
    templates_per_world: dict[str, str] = {}
    for wc in world_configs:
        templates_per_world[wc.name] = wc.system_prompt_template

    await env.start()

    all_actions: list[dict] = []
    summary_actions: list[dict] = []

    # Conversation memory per world — agents see what others have said
    world_history: dict[str, list[str]] = {wc.name: [] for wc in world_configs}

    # Scenario context from config (if provided)
    scenario = config.get("scenario", "")

    # Scheduled events (injects that fire at specific rounds)
    scheduled_events: dict[int, list[dict]] = {}
    for event in config.get("scheduled_events", []):
        r = event["round"]
        scheduled_events.setdefault(r, []).append(event)

    # Track active events for context
    active_events: list[str] = []

    # Adaptive depth configuration
    adaptive_cfg = config.get("adaptive_depth", {})
    adaptive_enabled = adaptive_cfg.get("enabled", False)
    min_rounds = adaptive_cfg.get("min_rounds", 3)
    max_rounds = adaptive_cfg.get("max_rounds", total_rounds)  # fallback to config total_rounds
    stagnation_threshold = adaptive_cfg.get("stagnation_threshold", 0.3)
    stagnation_count = 0
    last_verdict: dict = {"continue": True}

    try:
        round_num = 0
        while round_num < (max_rounds if adaptive_enabled else total_rounds):
            round_num += 1
            round_cost_before = cost_tracker.total_cost() if cost_tracker else 0
            # Check for scheduled injects this round
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
                    if mc: mc.inject(inject_text)

            # Tick pressure engine each round
            env.pressure_engine.tick()

            if mc: mc.round_header(sim_id, round_num, max_rounds if adaptive_enabled else total_rounds)

            # --- Pre-fetch ALL agent memories in parallel (Layer 3) ---
            # Includes both attackers and defenders so everyone benefits from batch fetch
            memory_cache: dict[str, str] = {}
            pending_episodes: list[dict] = []
            if memory:
                try:
                    agent_queries = [(a["name"], f"What has {a['name']} discussed?") for a in agent_profiles]
                    results = await memory.batch_search(sim_id, [q for _, q in agent_queries])
                    for (name, _), result_docs in zip(agent_queries, results):
                        facts = [f"- {r.get('action_summary', '')[:200]}" for r in result_docs if r.get("action_summary")]
                        memory_cache[name] = "From your memory of previous discussions:\n" + "\n".join(facts[:8]) if facts else ""
                except Exception as e:
                    if mc: mc.warning(f"Batch memory fetch failed: {e}")

            # Shared state locks for parallel world execution
            actions_lock = asyncio.Lock()
            active_agents = defender_agents if has_adversarial else agent_profiles

            # --- Attacker phase (runs before defenders) ---
            if has_adversarial:
                for agent in attacker_agents:
                    # Get worlds this attacker can ACT in (c2_world from config)
                    attacker_action_worlds = [agent.get("c2_world", "c2_channel")]
                    # Get worlds this attacker can OBSERVE
                    observable = agent.get("observable_worlds", [])

                    # Build observation of defender channels
                    defender_obs = build_defender_observation(world_history, observable)

                    # Detect if defenders are onto us
                    detection_signals = detect_defender_actions(all_actions)

                    # Build attacker system prompt
                    atk_system_msg = build_adversarial_system_prompt(
                        agent, defender_obs, round_num, total_rounds
                    )

                    # Append detection signals to system prompt if any
                    if detection_signals:
                        atk_system_msg += (
                            "\n\n== DETECTION WARNING ==\n"
                            "Defenders may be aware of your presence. Signals:\n"
                            + "\n".join(f"- {s}" for s in detection_signals[-5:])
                        )

                    # For each world the attacker can act in
                    for world_name in attacker_action_worlds:
                        if world_name not in tools_per_world:
                            continue  # C2 world not configured, skip silently

                        # Build user message for attacker
                        atk_history_text = ""
                        if world_history.get(world_name):
                            recent = world_history[world_name][-20:]
                            atk_history_text = "\n\nRecent C2 channel activity:\n" + "\n".join(recent)

                        atk_user_msg = (
                            f"Round {round_num}/{total_rounds}. You are in your C2 channel ({world_name}).{atk_history_text}\n\n"
                            f"Based on defender activity and your objectives, what action do you take? "
                            f"Act in character as {agent['name']} ({agent['role']})."
                        )

                        # Use pre-fetched memory from batch cache
                        atk_memory = memory_cache.get(agent["name"], "")
                        if atk_memory:
                            atk_user_msg = atk_user_msg + f"\n\n{atk_memory}"

                        # Add organizational context from knowledge graph
                        if graph_ctx:
                            try:
                                agent_graph_ctx = graph_ctx.agent_context(agent["name"])
                                if agent_graph_ctx:
                                    atk_user_msg += f"\n\n{agent_graph_ctx}"
                                atk_intel = graph_ctx.attacker_context()
                                if atk_intel:
                                    atk_user_msg += f"\n\n{atk_intel}"
                            except Exception:
                                pass  # Graph context is optional

                        # Call LLM (async)
                        tools = tools_per_world[world_name]
                        action_name, action_args, llm_usage = await _call_llm_async(
                            client, model, atk_system_msg, atk_user_msg, tools, effective_temperature
                        )
                        if llm_usage and cost_tracker:
                            cost_tracker.track_llm("simulation", model, llm_usage.get("input_tokens", 0), llm_usage.get("output_tokens", 0), f"round_{round_num}_{agent['name']}_{world_name}")

                        if mc: mc.agent_action(agent['name'], world_name, action_name, json.dumps(action_args, ensure_ascii=False)[:80], is_attacker=True)

                        # Send action through the world's channel
                        channel = env.worlds[world_name]["channel"]
                        action_payload = {
                            "action": action_name,
                            "agent_id": agent["name"],
                            **action_args,
                        }
                        msg_id = await channel.write_to_receive_queue(action_payload)
                        try:
                            response = await asyncio.wait_for(
                                channel.read_from_send_queue(msg_id),
                                timeout=30.0,
                            )
                        except asyncio.TimeoutError:
                            if mc: mc.warning(f"[{agent['name']}] {world_name}: channel timeout")
                            response = {"status": "timeout", "message": "Channel did not respond"}
                        result = response[1] if isinstance(response, tuple) else response

                        # Record in conversation history
                        if action_name == "send_message":
                            content = action_args.get("content", "")[:200]
                            world_history[world_name].append(
                                f"[{agent['name']} ({agent['role']})] {content}"
                            )
                        elif action_name != "do_nothing":
                            world_history[world_name].append(
                                f"[{agent['name']}] {action_name}: {json.dumps(action_args, ensure_ascii=False)[:150]}"
                            )

                        # Log entry — tagged with agent_type for filtering
                        entry = {
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "simulation_id": sim_id,
                            "round": round_num,
                            "agent": agent["name"],
                            "role": agent["role"],
                            "agent_type": "threat_actor",
                            "world": world_name,
                            "action": action_name,
                            "args": action_args,
                            "result": result,
                        }
                        all_actions.append(entry)
                        summary_actions.append(
                            {
                                "round": round_num,
                                "agent": agent["name"],
                                "world": world_name,
                                "action": action_name,
                                "agent_type": "threat_actor",
                            }
                        )

                        # Append to JSONL
                        with open(actions_log, "a") as f:
                            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

                        # Collect episode for batch write (Layer 3)
                        episode_body = ""
                        if action_name in ("send_message", "reply_in_thread"):
                            content = action_args.get("content", "")[:500]
                            episode_body = f"{agent['name']} ({agent['role']}) said in {world_name}: {content}"
                        if episode_body:
                            pending_episodes.append({
                                "content": episode_body,
                                "agent": agent["name"],
                                "world": world_name,
                                "round": round_num,
                                "action": action_name,
                                "category": "action",
                            })

                # Convert attacker actions this round to defender-visible injects
                attacker_round_actions = [
                    a for a in all_actions
                    if a.get("round") == round_num and a.get("agent_type") == "threat_actor"
                ]
                new_injects = attacker_actions_to_injects(attacker_round_actions, round_num)
                for inject in new_injects:
                    active_events.append(inject)
                    for wn in world_history:
                        world_history[wn].append(f"🚨 [SYSTEM ALERT] {inject}")
                    if mc: mc.inject(inject)

            # --- Defender phase: run worlds in parallel, agents within each world sequentially ---
            async def _run_agent_in_world(agent: dict, world_name: str) -> None:
                """Run one defender agent in one world. LLM call + channel execution + logging."""
                # Build AgentInfo with the world's system prompt template
                agent_info = AgentInfo(
                    profile={
                        "agent_name": agent["name"],
                        "role": agent["role"],
                        "personality": agent.get("persona", ""),
                        "company": config.get("company_name", "the company"),
                        "current_time": datetime.now(timezone.utc).isoformat(),
                    },
                    system_prompt_template=templates_per_world[world_name],
                )

                # Get pressure text for this agent's role
                pressure_text = env.get_pressure_text(agent["role"])

                # Render system message
                system_msg = agent_info.to_system_message(pressures=pressure_text)

                # Build user message WITH conversation history
                history_text = ""
                if world_history[world_name]:
                    recent = world_history[world_name][-20:]  # Last 20 messages
                    history_text = "\n\nRecent activity in this channel:\n" + "\n".join(recent)

                scenario_text = ""
                if scenario and round_num == 1:
                    scenario_text = f"\n\nScenario context:\n{scenario}"

                events_text = ""
                if active_events:
                    events_text = "\n\n🚨 ACTIVE SITUATION UPDATES:\n" + "\n".join(
                        f"- {e}" for e in active_events
                    )

                user_msg = (
                    f"Round {round_num}/{total_rounds}. You are in {world_name}.{scenario_text}{events_text}{history_text}\n\n"
                    f"Based on the situation and what others have said, what action do you take? "
                    f"Act in character as {agent['name']} ({agent['role']})."
                )

                # Use pre-fetched memory from batch cache
                agent_memory = memory_cache.get(agent["name"], "")
                if agent_memory:
                    user_msg = user_msg + f"\n\n{agent_memory}"

                # Add organizational context from knowledge graph
                if graph_ctx:
                    try:
                        agent_graph_ctx = graph_ctx.agent_context(agent["name"])
                        if agent_graph_ctx:
                            user_msg += f"\n\n{agent_graph_ctx}"
                    except Exception:
                        pass  # Graph context is optional

                # Call LLM (async — no executor needed)
                tools = tools_per_world[world_name]
                action_name, action_args, llm_usage = await _call_llm_async(
                    client, model, system_msg, user_msg, tools, effective_temperature
                )
                if llm_usage and cost_tracker:
                    cost_tracker.track_llm("simulation", model, llm_usage.get("input_tokens", 0), llm_usage.get("output_tokens", 0), f"round_{round_num}_{agent['name']}_{world_name}")

                if mc: mc.agent_action(agent['name'], world_name, action_name, json.dumps(action_args, ensure_ascii=False)[:80], is_attacker=False)

                # Send action directly through the world's channel
                channel = env.worlds[world_name]["channel"]
                action_payload = {
                    "action": action_name,
                    "agent_id": agent["name"],
                    **action_args,
                }
                msg_id = await channel.write_to_receive_queue(action_payload)
                try:
                    response = await asyncio.wait_for(
                        channel.read_from_send_queue(msg_id),
                        timeout=30.0,
                    )
                except asyncio.TimeoutError:
                    if mc: mc.warning(f"[{agent['name']}] {world_name}: channel timeout")
                    response = {"status": "timeout", "message": "Channel did not respond"}
                result = response[1] if isinstance(response, tuple) else response

                # Record in conversation history so next agents in THIS world see it
                if action_name == "send_message":
                    content = action_args.get("content", "")[:200]
                    world_history[world_name].append(
                        f"[{agent['name']} ({agent['role']})] {content}"
                    )
                elif action_name == "send_email":
                    to = action_args.get("to", "?")
                    subj = action_args.get("subject", "")
                    world_history[world_name].append(
                        f"[{agent['name']}] Email to {to}: {subj}"
                    )
                elif action_name == "reply_in_thread":
                    content = action_args.get("content", "")[:200]
                    world_history[world_name].append(
                        f"[{agent['name']}] (thread reply) {content}"
                    )
                elif action_name != "do_nothing":
                    world_history[world_name].append(
                        f"[{agent['name']}] {action_name}: {json.dumps(action_args, ensure_ascii=False)[:150]}"
                    )

                # Log entry
                entry = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "simulation_id": sim_id,
                    "round": round_num,
                    "agent": agent["name"],
                    "role": agent["role"],
                    "world": world_name,
                    "action": action_name,
                    "args": action_args,
                    "result": result,
                }

                # Thread-safe append to shared state
                async with actions_lock:
                    all_actions.append(entry)
                    summary_actions.append(
                        {
                            "round": round_num,
                            "agent": agent["name"],
                            "world": world_name,
                            "action": action_name,
                        }
                    )
                    # Append to JSONL
                    with open(actions_log, "a") as f:
                        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

                # Collect episode for batch write (Layer 3)
                episode_body = ""
                if action_name in ("send_message", "reply_in_thread"):
                    content = action_args.get("content", "")[:500]
                    episode_body = f"{agent['name']} ({agent['role']}) said in {world_name}: {content}"
                elif action_name in ("send_email", "reply_email"):
                    subj = action_args.get("subject", "")
                    body_text = action_args.get("body", "")[:300]
                    episode_body = f"{agent['name']} ({agent['role']}) emailed about '{subj}': {body_text}"
                if episode_body:
                    async with actions_lock:
                        pending_episodes.append({
                            "content": episode_body,
                            "agent": agent["name"],
                            "world": world_name,
                            "round": round_num,
                            "action": action_name,
                            "category": "action",
                        })

            async def _run_world(world_name: str, agents_in_world: list[dict]) -> None:
                """Run all agents in one world sequentially (they see each other's messages)."""
                for agent in agents_in_world:
                    await _run_agent_in_world(agent, world_name)

            # Build per-world agent lists (respecting participant filtering)
            world_agent_map: dict[str, list[dict]] = {wc.name: [] for wc in world_configs}
            for agent in active_agents:
                agent_world_names = agent.get("worlds")
                for wc in world_configs:
                    wn = wc.name
                    if agent_world_names and wn not in agent_world_names:
                        continue
                    participants = world_participants.get(wn, [])
                    if participants and agent.get("role", "") not in participants:
                        continue
                    world_agent_map[wn].append(agent)

            # Run all worlds in parallel — agents within each world run sequentially
            await asyncio.gather(*[
                _run_world(wn, agents)
                for wn, agents in world_agent_map.items()
                if agents  # skip empty worlds
            ])

            # Batch write all pending episodes at end of round (Layer 3)
            if memory and pending_episodes:
                try:
                    memory.add_episodes_bulk(sim_id, pending_episodes)
                    if mc: mc.research_step(sim_id, f"Batch-wrote {len(pending_episodes)} episodes")
                except Exception as e:
                    if mc: mc.warning(f"Batch episode write failed: {e}")
                pending_episodes.clear()

            # --- Arbiter evaluation (end of round, after all agents have acted) ---
            if adaptive_enabled and round_num >= min_rounds:
                last_verdict = await _arbiter_evaluate_async(
                    client, model, all_actions, round_num, max_rounds,
                    active_events, config, 0.3,
                )

                if cost_tracker:
                    # Track arbiter LLM call cost (approximate)
                    cost_tracker.track_llm("arbiter", model, 500, 100, f"arbiter_round_{round_num}")

                if not last_verdict["continue"]:
                    if mc: mc.arbiter(last_verdict['reason'], stop=True)
                    break

                if last_verdict.get("inject_complication"):
                    complication = last_verdict["inject_complication"]
                    active_events.append(complication)
                    for wn in world_history:
                        world_history[wn].append(f"🚨 [SYSTEM ALERT] {complication}")
                    if mc: mc.arbiter(f"Injected: {complication[:60]}")

            # Round cost summary
            if mc and cost_tracker:
                round_cost = cost_tracker.total_cost() - round_cost_before
                mc.round_cost(round_cost, cost_tracker.total_cost())

            # Save round checkpoint (for counterfactual branching)
            checkpoint = {
                "round": round_num,
                "all_actions": all_actions.copy(),
                "world_history": {k: list(v) for k, v in world_history.items()},
                "active_events": list(active_events),
            }
            checkpoint_dir = out / "checkpoints"
            checkpoint_dir.mkdir(exist_ok=True)
            checkpoint_path = checkpoint_dir / f"round_{round_num}.json"
            checkpoint_path.write_text(json.dumps(checkpoint, ensure_ascii=False, default=str))

    finally:
        await env.stop()
        env.close()

    # Write summary
    completed_at = datetime.now(timezone.utc).isoformat()
    summary = {
        "simulation_id": sim_id,
        "total_rounds": total_rounds,
        "hours_per_round": hours_per_round,
        "agents": [a["name"] for a in agent_profiles],
        "worlds": [w["name"] for w in worlds_cfg],
        "total_actions": len(all_actions),
        "actions_summary": summary_actions,
        "completed_at": completed_at,
        "adaptive_depth": {
            "enabled": adaptive_enabled,
            "stopped_at_round": round_num,
            "max_rounds": max_rounds if adaptive_enabled else total_rounds,
            "stop_reason": last_verdict.get("stop_condition") if adaptive_enabled and not last_verdict.get("continue", True) else None,
        } if adaptive_enabled else None,
    }
    summary_path = out / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    cost_tracker.save(str(out))
    if mc: mc.sim_complete(sim_id, round_num, cost_tracker.total_cost(), time.time() - start_time)

    # Return IterationResult for Monte Carlo orchestration
    return {
        "iteration_id": iteration_id or sim_id,
        "seed": config.get("_variation_seed", 0),
        "total_rounds": round_num,
        "total_actions": len(all_actions),
        "cost_usd": cost_tracker.total_cost() if cost_tracker else 0,
        "variation_description": config.get("_variation_description", ""),
        "completed_at": completed_at,
        "output_dir": output_dir,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

async def run_simulation(config_path: str, output_dir: str) -> None:
    """CLI entrypoint -- reads config from file, creates own clients."""
    config = json.loads(Path(config_path).read_text())
    await run_single_iteration(config, output_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Crucible simulation")
    parser.add_argument(
        "--config",
        required=True,
        help="Path to the JSON simulation config file",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Directory to write outputs (actions.jsonl, summary.json)",
    )
    args = parser.parse_args()
    asyncio.run(run_simulation(args.config, args.output))


if __name__ == "__main__":
    main()
