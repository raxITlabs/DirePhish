# Crucible Phase 4: MiroFish-IR Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Crucible into MiroFish-IR-Simulation so simulations run on enterprise worlds (Slack, Email) instead of Twitter/Reddit. The NovaPay breach scenario should produce an after-action report with agents communicating in a Slack war room under business pressure.

**Architecture:** Replace `camel-oasis` dependency with local `crucible` path dependency. Create a new simulation runner script that uses CrucibleEnv instead of OasisEnv. Adapt the simulation_runner.py service to launch Crucible simulations. Keep the existing MiroFish pipeline (Zep graph, persona gen, report) — only the simulation step changes.

**Tech Stack:** Python 3.12, UV, Crucible (local path dep), Flask, asyncio

**Repos:**
- Crucible engine: `/Users/adeshgairola/Documents/raxIT/code/testing-folder/crucible`
- MiroFish app: `/Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish`

---

## What Changes in MiroFish

Only the simulation layer. Everything else stays:
- Zep graph building — unchanged
- Ontology generation — unchanged
- Profile generation — unchanged (but profiles feed into Crucible agents)
- Report generation — unchanged (reads from Zep graph)
- Frontend — unchanged

### Files to Create/Modify

```
MiroFish/
├── backend/
│   ├── pyproject.toml                          # Add crucible-sim as local path dep
│   ├── scripts/
│   │   └── run_crucible_simulation.py          # NEW: Crucible simulation runner
│   └── app/services/
│       └── simulation_runner.py                # Modify: add Crucible launch option
```

---

### Task 1: Add Crucible as Dependency

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add crucible-sim as local path dependency**

Add to the dependencies list in `backend/pyproject.toml`:
```toml
"crucible-sim @ file:///Users/adeshgairola/Documents/raxIT/code/testing-folder/crucible",
```

- [ ] **Step 2: Sync dependencies**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/backend
uv sync
```

- [ ] **Step 3: Verify import**

```bash
uv run python -c "from crucible import CrucibleEnv, AgentInfo, PressureEngine; print('Crucible available in MiroFish')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml
git commit -m "feat: add crucible-sim as local path dependency"
```

---

### Task 2: Crucible Simulation Runner Script

**Files:**
- Create: `backend/scripts/run_crucible_simulation.py`

This is the key new file — equivalent to `run_twitter_simulation.py` but for Crucible worlds.

- [ ] **Step 1: Create the runner script**

`backend/scripts/run_crucible_simulation.py`:
```python
#!/usr/bin/env python3
"""Run a Crucible enterprise simulation.

Usage:
    python run_crucible_simulation.py --config <simulation_config.json> --output <output_dir>

Reads agent profiles from the config, creates a CrucibleEnv with the
specified worlds and pressures, runs N rounds, and logs all actions
to JSONL files.
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add parent dir to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from crucible import CrucibleEnv, AgentInfo, ManualAction, ConfigurableEnvironment
from crucible.config.loader import load_platform_config, load_enterprise_config
from crucible.config.platform_config import PlatformConfig
from crucible.config.pressure_config import PressureConfig
from crucible.platform.channel import Channel

from openai import OpenAI


def load_config(config_path: str) -> dict:
    """Load simulation configuration JSON."""
    with open(config_path) as f:
        return json.load(f)


def load_agent_profiles(config: dict) -> list[dict]:
    """Extract agent profiles from config."""
    profiles_path = config.get("profiles_path")
    if profiles_path and os.path.exists(profiles_path):
        with open(profiles_path) as f:
            return json.load(f)
    return config.get("agent_profiles", [])


def get_platform_configs(config: dict) -> list[PlatformConfig]:
    """Load platform configs for each world."""
    worlds = config.get("worlds", [{"type": "slack"}, {"type": "email"}])
    configs = []

    # Look for builtin configs
    builtins_dir = Path(__file__).parent.parent / ".venv" / "lib"
    # Try to find crucible builtins
    import crucible
    crucible_path = Path(crucible.__file__).parent
    builtins_path = crucible_path / "builtins" / "channels"

    for world in worlds:
        world_type = world.get("type", "slack")
        yaml_path = builtins_path / f"{world_type}.yaml"
        if yaml_path.exists():
            configs.append(load_platform_config(str(yaml_path)))
        else:
            # Minimal fallback config
            from crucible.config.platform_config import ActionConfig, VisibilityConfig, SchemaConfig, SchemaTableConfig, SchemaColumnConfig
            configs.append(PlatformConfig(
                name=world_type,
                display_name=world.get("name", world_type.title()),
                system_prompt_template="You are {{ name }}, a {{ role }}. {{ persona }}",
                actions=[
                    ActionConfig(name="send_message", description="Send a message", parameters=[
                        {"name": "content", "type": "string", "description": "Message content"},
                    ]),
                    ActionConfig(name="do_nothing", description="No action", parameters=[]),
                ],
                schema=SchemaConfig(tables=[
                    SchemaTableConfig(name="message", columns=[
                        SchemaColumnConfig(name="message_id", type="INTEGER", primary_key=True, autoincrement=True),
                        SchemaColumnConfig(name="user_id", type="INTEGER"),
                        SchemaColumnConfig(name="content", type="TEXT"),
                        SchemaColumnConfig(name="created_at", type="DATETIME"),
                    ]),
                    SchemaTableConfig(name="trace", columns=[
                        SchemaColumnConfig(name="trace_id", type="INTEGER", primary_key=True, autoincrement=True),
                        SchemaColumnConfig(name="user_id", type="INTEGER"),
                        SchemaColumnConfig(name="action", type="TEXT"),
                        SchemaColumnConfig(name="info", type="TEXT"),
                        SchemaColumnConfig(name="created_at", type="DATETIME"),
                    ]),
                ]),
                visibility=VisibilityConfig(strategy="chronological"),
            ))

    return configs


def get_pressure_configs(config: dict) -> list[PressureConfig]:
    """Extract pressure configs."""
    pressures = config.get("pressures", [])
    return [PressureConfig(**p) for p in pressures]


async def run_agent_round(
    agent_profile: dict,
    agent_id: int,
    env: CrucibleEnv,
    world_idx: int,
    llm_client: OpenAI,
    model_name: str,
    round_num: int,
    action_log: list,
):
    """Run one agent for one round on one world using LLM."""
    platform_config = env.worlds[world_idx].config

    # Build system prompt
    agent_info = AgentInfo(
        profile=agent_profile,
        system_prompt_template=platform_config.system_prompt_template,
    )

    # Get pressure text for this agent's role
    role = agent_profile.get("role", "unknown")
    pressure_text = env.get_pressure_text(role)

    system_msg = agent_info.to_system_message(pressures=pressure_text)

    # Build available actions as tool descriptions
    tools = []
    for action in platform_config.actions:
        tool_params = {}
        required = []
        for p in action.parameters:
            tool_params[p.name] = {"type": p.type if p.type != "integer" else "number", "description": p.description}
            required.append(p.name)

        tools.append({
            "type": "function",
            "function": {
                "name": action.name,
                "description": action.description,
                "parameters": {
                    "type": "object",
                    "properties": tool_params,
                    "required": required,
                }
            }
        })

    # Call LLM
    user_msg = f"Round {round_num}. You are in the {platform_config.display_name}. What action do you take?"
    if pressure_text:
        user_msg += f"\n\n{pressure_text}"

    try:
        response = llm_client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            tools=tools,
            tool_choice="auto",
            temperature=0.7,
        )

        choice = response.choices[0]

        if choice.message.tool_calls:
            tool_call = choice.message.tool_calls[0]
            action_name = tool_call.function.name
            try:
                action_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                action_args = {}
        else:
            # No tool call — agent chose to do nothing
            action_name = "do_nothing"
            action_args = {}

    except Exception as e:
        print(f"  LLM error for agent {agent_id}: {e}")
        action_name = "do_nothing"
        action_args = {}

    # Execute the action via CrucibleEnv
    channel = env._channels[world_idx]
    message = tuple(action_args.values()) if action_args else None
    msg_id = await channel.write_to_receive_queue(
        (agent_id, message, action_name)
    )
    result = await channel.read_from_send_queue(msg_id)

    # Log the action
    log_entry = {
        "round": round_num,
        "timestamp": datetime.now().isoformat(),
        "agent_id": agent_id,
        "agent_name": agent_profile.get("name", f"agent_{agent_id}"),
        "agent_role": agent_profile.get("role", "unknown"),
        "world": platform_config.name,
        "action_type": action_name,
        "action_args": action_args,
        "result": result[2] if isinstance(result, tuple) else result,
    }
    action_log.append(log_entry)
    print(f"  [{platform_config.name}] {agent_profile.get('name', agent_id)}: {action_name}")

    return log_entry


async def run_simulation(config_path: str, output_dir: str):
    """Main simulation loop."""
    config = load_config(config_path)
    os.makedirs(output_dir, exist_ok=True)

    # Setup
    profiles = load_agent_profiles(config)
    platform_configs = get_platform_configs(config)
    pressure_configs = get_pressure_configs(config)
    total_rounds = config.get("total_rounds", 3)

    # LLM client
    llm_api_key = config.get("llm_api_key", os.environ.get("LLM_API_KEY", ""))
    llm_base_url = config.get("llm_base_url", os.environ.get("LLM_BASE_URL", ""))
    llm_model = config.get("llm_model", os.environ.get("LLM_MODEL_NAME", "gemma3n"))

    llm_client = OpenAI(api_key=llm_api_key, base_url=llm_base_url)

    print(f"Starting Crucible simulation")
    print(f"  Worlds: {[c.name for c in platform_configs]}")
    print(f"  Agents: {len(profiles)}")
    print(f"  Rounds: {total_rounds}")
    print(f"  Pressures: {len(pressure_configs)}")
    print(f"  LLM: {llm_model}")

    # Create environment
    env = CrucibleEnv(
        world_configs=platform_configs,
        pressure_configs=pressure_configs,
        db_dir=output_dir,
        hours_per_round=config.get("hours_per_round", 1.0),
    )
    await env.start()

    action_log = []

    try:
        for round_num in range(1, total_rounds + 1):
            print(f"\n=== Round {round_num}/{total_rounds} ===")

            # Tick pressure
            env.pressure_engine.tick()
            env.current_round = round_num

            # Each agent acts on each world
            for world_idx in range(len(platform_configs)):
                for agent_idx, profile in enumerate(profiles):
                    await run_agent_round(
                        agent_profile=profile,
                        agent_id=agent_idx,
                        env=env,
                        world_idx=world_idx,
                        llm_client=llm_client,
                        model_name=llm_model,
                        round_num=round_num,
                        action_log=action_log,
                    )

            # Write action log after each round
            log_path = os.path.join(output_dir, "actions.jsonl")
            with open(log_path, "w") as f:
                for entry in action_log:
                    f.write(json.dumps(entry, default=str) + "\n")

            print(f"  Pressure status:")
            for p in env.pressure_engine.get_all_active():
                if p.remaining_hours is not None:
                    print(f"    {p.name}: {p.remaining_hours:.0f}h remaining [{p.severity}]")

    finally:
        await env.stop()

    # Write final summary
    summary = {
        "simulation_id": config.get("simulation_id", "unknown"),
        "total_rounds": total_rounds,
        "total_actions": len(action_log),
        "agents": len(profiles),
        "worlds": [c.name for c in platform_configs],
        "completed_at": datetime.now().isoformat(),
    }
    with open(os.path.join(output_dir, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nSimulation complete. {len(action_log)} actions logged to {output_dir}")


def main():
    parser = argparse.ArgumentParser(description="Run Crucible enterprise simulation")
    parser.add_argument("--config", required=True, help="Path to simulation config JSON")
    parser.add_argument("--output", required=True, help="Output directory for logs")
    args = parser.parse_args()

    asyncio.run(run_simulation(args.config, args.output))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/run_crucible_simulation.py
git commit -m "feat: add Crucible simulation runner script"
```

---

### Task 3: Test Crucible Runner with NovaPay Config

**Files:**
- Create: `backend/uploads/test_crucible_config.json`

- [ ] **Step 1: Create a test config**

`backend/uploads/test_crucible_config.json`:
```json
{
    "simulation_id": "test_crucible_001",
    "total_rounds": 2,
    "hours_per_round": 1.0,
    "worlds": [
        {"type": "slack", "name": "IR War Room"},
        {"type": "email", "name": "Corporate Email"}
    ],
    "pressures": [
        {
            "name": "GDPR 72-hour notification",
            "type": "countdown",
            "hours": 72,
            "affects_roles": ["legal_counsel", "ciso"],
            "severity_at_50pct": "high",
            "severity_at_25pct": "critical"
        },
        {
            "name": "Payment queue at risk",
            "type": "threshold",
            "value": 4200000,
            "unit": "USD",
            "affects_roles": ["vp_engineering", "cto"]
        }
    ],
    "agent_profiles": [
        {
            "name": "Yuki Tanaka",
            "role": "ir_lead",
            "persona": "IR Lead with 5 years experience, previously at CrowdStrike. Direct communicator. Wants immediate containment."
        },
        {
            "name": "Raj Patel",
            "role": "ciso",
            "persona": "CISO, joined 14 months ago from a bank. Process-oriented, cautious. Reports to CEO."
        },
        {
            "name": "Marcus Chen",
            "role": "ceo",
            "persona": "CEO, former Goldman VP. Concerned about Series D roadshow in 10 days. Wants to control narrative timing."
        },
        {
            "name": "Catherine Park",
            "role": "legal_counsel",
            "persona": "General Counsel, former fintech regulatory attorney. Focused on GDPR 72-hour notification and evidence preservation."
        }
    ]
}
```

- [ ] **Step 2: Dry run (verify script loads without errors)**

```bash
cd backend
uv run python -c "
import json
config = json.load(open('uploads/test_crucible_config.json'))
print(f'Config loaded: {config[\"simulation_id\"]}')
print(f'Agents: {len(config[\"agent_profiles\"])}')
print(f'Worlds: {len(config[\"worlds\"])}')
print(f'Rounds: {config[\"total_rounds\"]}')
"
```

- [ ] **Step 3: Commit**

```bash
git add backend/uploads/test_crucible_config.json
git commit -m "feat: add test Crucible simulation config for NovaPay IR"
```

---

### Task 4: Update Exports and Push

- [ ] **Step 1: Run existing test suite to make sure nothing is broken**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/backend
uv run python -c "from crucible import CrucibleEnv, AgentInfo, PressureEngine, ManualAction; print('All Crucible imports OK')"
```

- [ ] **Step 2: Commit and push**

```bash
git add -A
git commit -m "feat: complete Phase 4 - Crucible integration with MiroFish-IR"
git push origin main
```

---

## Phase 4 Completion Checklist

- [ ] Crucible available as dependency in MiroFish-IR
- [ ] run_crucible_simulation.py can load config, create worlds, run agents with LLM
- [ ] Test config with 4 NovaPay agents, 2 worlds, 2 pressures
- [ ] Action log output in JSONL format
- [ ] Pressure ticks each round with formatted output
- [ ] Pushed to raxITlabs/MiroFish-IR-Simulation

**The MVP is complete when you can:**
1. Run `python scripts/run_crucible_simulation.py --config uploads/test_crucible_config.json --output uploads/simulations/test_001`
2. See agents choosing actions via Gemini on Slack and Email worlds
3. See GDPR pressure ticking down each round
4. Get an actions.jsonl log file with all agent decisions
