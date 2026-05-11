"""Slack-world MCP server (FastMCP, stdio).

Exposes Crucible's slack platform actions (send_message, reply_in_thread,
react, mention_user, create_channel, do_nothing, read_channel,
check_mentions) as MCP tools that ADK ``LlmAgent``s call via
``MCPToolset``.

Lifecycle inside the stdio subprocess:

1. First tool call → ``_get_env(simulation_id)`` lazily constructs a
   ``CrucibleEnv`` with the slack world only, points its SQLite at
   ``$DIREPHISH_SIM_DB_DIR/<simulation_id>/`` (default
   ``./uploads/adk-smoke/<simulation_id>/``), and calls
   ``env.start()`` so the platform dispatch loop is live.
2. Subsequent calls hit the same env (cached by sim_id).
3. Each tool returns ``ActionEvent.model_dump()`` — the agent sees the
   structured result and can reason about success/failure.

W2 limitations (intentional, fixed in W3):
- Cache eviction: never. One sim per process for smoke; long-running
  Flask processes will accumulate. Restart the MCP subprocess to clear.
- Multi-tenancy: none. The Flask process owns its MCP subprocess.
- Pressure ticking: this server constructs a CrucibleEnv with empty
  pressure configs. The PressureEngineAgent inside the ADK tree owns
  pressure — the slack server just dispatches actions.
- Auth: stdio only. Production wraps in Streamable HTTP with OIDC.

Run standalone for debugging:
    cd backend && uv run python -m mcp_servers.slack_world
"""

from __future__ import annotations

import asyncio
import importlib.resources
import logging
import os
from pathlib import Path
from typing import Any

import yaml
from fastmcp import FastMCP

from crucible.config.platform_config import PlatformConfig
from crucible.environment.env import CrucibleEnv

logger = logging.getLogger("direphish.mcp.slack")


_WORLD_NAME = "slack"
_DEFAULT_DB_ROOT = "./uploads/adk-smoke"

# One env per sim_id. Lazy. No eviction (W3 work).
_envs: dict[str, CrucibleEnv] = {}
_env_lock = asyncio.Lock()


def _load_slack_platform_config() -> PlatformConfig:
    """Load crucible's built-in slack.yaml into a PlatformConfig instance."""
    yaml_path = (
        importlib.resources.files("crucible.builtins") / "channels" / "slack.yaml"
    )
    with importlib.resources.as_file(yaml_path) as path:
        data = yaml.safe_load(Path(path).read_text())
    return PlatformConfig(**data["platform"])


async def _get_env(simulation_id: str) -> CrucibleEnv:
    """Construct (lazily, once per sim_id) and start a CrucibleEnv."""
    async with _env_lock:
        if simulation_id in _envs:
            return _envs[simulation_id]

        db_root = Path(os.environ.get("DIREPHISH_SIM_DB_DIR", _DEFAULT_DB_ROOT))
        db_dir = db_root / simulation_id
        db_dir.mkdir(parents=True, exist_ok=True)

        slack_cfg = _load_slack_platform_config()
        env = CrucibleEnv(
            world_configs=[slack_cfg],
            pressure_configs=[],  # pressure is owned by PressureEngineAgent
            db_dir=str(db_dir),
            hours_per_round=1.0,
        )
        await env.start()
        _envs[simulation_id] = env
        logger.info(
            "[slack-mcp] env constructed sim=%s db_dir=%s", simulation_id, db_dir
        )
        return env


async def _apply(
    *,
    actor: str,
    role: str,
    action: str,
    args: dict[str, Any],
    simulation_id: str,
    round_num: int,
) -> dict[str, Any]:
    """Wrapper around CrucibleEnv.apply_action for the slack world."""
    env = await _get_env(simulation_id)
    event = await env.apply_action(
        actor=actor,
        role=role,
        world=_WORLD_NAME,
        action=action,
        args=args,
        simulation_id=simulation_id,
        round_num=round_num,
    )
    return event.model_dump()


mcp = FastMCP("direphish-slack-world")


@mcp.tool
async def send_message(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    channel: str,
    content: str,
) -> dict:
    """Post a message to a Slack channel within the simulation world.

    Args:
        actor: The persona name (e.g. "Marcus Thorne").
        role: The persona's role (e.g. "defender", "attacker").
        simulation_id: The active simulation id for this round.
        round_num: The current round number.
        channel: The Slack channel name to post in.
        content: The message body.
    """
    return await _apply(
        actor=actor,
        role=role,
        action="send_message",
        args={"channel": channel, "content": content},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def reply_in_thread(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    channel: str,
    thread_id: str,
    content: str,
) -> dict:
    """Reply to an existing message thread in a Slack channel."""
    return await _apply(
        actor=actor,
        role=role,
        action="reply_in_thread",
        args={"channel": channel, "thread_id": thread_id, "content": content},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def react(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    message_id: str,
    emoji: str,
) -> dict:
    """Add an emoji reaction to a message."""
    return await _apply(
        actor=actor,
        role=role,
        action="react",
        args={"message_id": message_id, "emoji": emoji},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def mention_user(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    channel: str,
    user: str,
    content: str,
) -> dict:
    """Mention a user in a channel message."""
    return await _apply(
        actor=actor,
        role=role,
        action="mention_user",
        args={"channel": channel, "user": user, "content": content},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def create_channel(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    name: str,
    purpose: str,
) -> dict:
    """Create a new Slack channel."""
    return await _apply(
        actor=actor,
        role=role,
        action="create_channel",
        args={"name": name, "purpose": purpose},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def do_nothing(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
) -> dict:
    """Take no action this round."""
    return await _apply(
        actor=actor,
        role=role,
        action="do_nothing",
        args={},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def read_channel(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    channel: str,
) -> dict:
    """Read recent messages from a Slack channel."""
    return await _apply(
        actor=actor,
        role=role,
        action="read_channel",
        args={"channel": channel},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def check_mentions(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
) -> dict:
    """Check for recent mentions of the actor."""
    return await _apply(
        actor=actor,
        role=role,
        action="check_mentions",
        args={},
        simulation_id=simulation_id,
        round_num=round_num,
    )


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(message)s",
    )
    mcp.run()
