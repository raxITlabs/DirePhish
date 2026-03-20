#!/usr/bin/env python3
"""Crucible simulation runner for MiroFish-IR-Simulation.

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

from openai import OpenAI

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


def _call_llm(
    client: OpenAI,
    model: str,
    system_message: str,
    user_message: str,
    tools: list[dict],
) -> tuple[str, dict]:
    """Call the LLM and return (action_name, action_args).

    Falls back to 'do_nothing' if the model doesn't produce a tool call.
    """
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ],
        tools=tools,
        tool_choice="auto",
    )

    message = response.choices[0].message

    if message.tool_calls:
        tc = message.tool_calls[0]
        action_name = tc.function.name
        try:
            action_args = json.loads(tc.function.arguments)
        except json.JSONDecodeError:
            action_args = {}
        return action_name, action_args

    # No tool call -- treat as do_nothing
    return "do_nothing", {}


# ---------------------------------------------------------------------------
# Main simulation loop
# ---------------------------------------------------------------------------

async def run_simulation(config_path: str, output_dir: str) -> None:
    """Run the full Crucible simulation from a JSON config file."""
    config = json.loads(Path(config_path).read_text())

    sim_id = config["simulation_id"]
    total_rounds = config["total_rounds"]
    hours_per_round = config.get("hours_per_round", 1.0)
    worlds_cfg = config["worlds"]
    pressures_cfg = config["pressures"]
    agent_profiles = config["agent_profiles"]

    # Prepare output directory
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    actions_log = out / "actions.jsonl"
    db_dir = str(out / "dbs")
    Path(db_dir).mkdir(parents=True, exist_ok=True)

    # Load platform configs from builtins, override name with world name
    world_configs: list[PlatformConfig] = []
    for w in worlds_cfg:
        pc = _load_world_config(w["type"])
        pc = pc.model_copy(update={"name": w["name"]})
        world_configs.append(pc)

    # Build pressure configs
    pressure_configs = [PressureConfig(**p) for p in pressures_cfg]

    # Create CrucibleEnv
    env = CrucibleEnv(
        world_configs=world_configs,
        pressure_configs=pressure_configs,
        db_dir=db_dir,
        hours_per_round=hours_per_round,
    )

    # OpenAI client from env vars
    client = OpenAI(
        api_key=os.environ.get("LLM_API_KEY", ""),
        base_url=os.environ.get("LLM_BASE_URL"),
    )
    model = os.environ.get("LLM_MODEL_NAME", "gpt-4o-mini")

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

    try:
        for round_num in range(1, total_rounds + 1):
            print(f"\n=== Round {round_num}/{total_rounds} ===")

            for agent in agent_profiles:
                for wc in world_configs:
                    world_name = wc.name

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

                    user_msg = (
                        f"Round {round_num}/{total_rounds}. You are in {world_name}.{scenario_text}{history_text}\n\n"
                        f"Based on the situation and what others have said, what action do you take? "
                        f"Act in character as {agent['name']} ({agent['role']})."
                    )

                    # Call LLM
                    tools = tools_per_world[world_name]
                    action_name, action_args = _call_llm(
                        client, model, system_msg, user_msg, tools
                    )

                    print(
                        f"  [{agent['name']}] {world_name}: "
                        f"{action_name}({json.dumps(action_args, ensure_ascii=False)[:120]})"
                    )

                    # Send action through the platform channel
                    action = ManualAction(
                        action_type=action_name, action_args=action_args
                    )
                    results = await env.step({world_name: action})

                    # Record in conversation history so next agents see this
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
                        "result": results.get(world_name),
                    }
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

    finally:
        await env.stop()
        env.close()

    # Write summary
    summary = {
        "simulation_id": sim_id,
        "total_rounds": total_rounds,
        "hours_per_round": hours_per_round,
        "agents": [a["name"] for a in agent_profiles],
        "worlds": [w["name"] for w in worlds_cfg],
        "total_actions": len(all_actions),
        "actions_summary": summary_actions,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    summary_path = out / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"\nSimulation complete. Summary: {summary_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

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
