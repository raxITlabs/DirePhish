"""Email-world MCP server (FastMCP, stdio).

Mirrors ``slack_world.py`` for crucible's email platform. Exposes:
- ``send_email`` / ``reply_email`` / ``forward_email`` / ``do_nothing``
- ``check_inbox`` (observation)

Lifecycle: shares the lazy ``CrucibleEnv`` cache pattern with the
slack server (one env per simulation_id, cached in process). The env
is constructed with the email world config only — pressure is owned
by ``PressureEngineAgent`` inside the ADK tree.

Run standalone for debugging:
    cd backend && uv run python -m mcp_servers.email_world
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

logger = logging.getLogger("direphish.mcp.email")


_WORLD_NAME = "email"
_DEFAULT_DB_ROOT = "./uploads/adk-smoke"

_envs: dict[str, CrucibleEnv] = {}
_env_lock = asyncio.Lock()


def _load_email_platform_config() -> PlatformConfig:
    yaml_path = (
        importlib.resources.files("crucible.builtins") / "channels" / "email.yaml"
    )
    with importlib.resources.as_file(yaml_path) as path:
        data = yaml.safe_load(Path(path).read_text())
    return PlatformConfig(**data["platform"])


async def _get_env(simulation_id: str) -> CrucibleEnv:
    async with _env_lock:
        if simulation_id in _envs:
            return _envs[simulation_id]

        db_root = Path(os.environ.get("DIREPHISH_SIM_DB_DIR", _DEFAULT_DB_ROOT))
        db_dir = db_root / simulation_id
        db_dir.mkdir(parents=True, exist_ok=True)

        email_cfg = _load_email_platform_config()
        env = CrucibleEnv(
            world_configs=[email_cfg],
            pressure_configs=[],
            db_dir=str(db_dir),
            hours_per_round=1.0,
        )
        await env.start()
        _envs[simulation_id] = env
        logger.info("[email-mcp] env constructed sim=%s db_dir=%s", simulation_id, db_dir)
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


mcp = FastMCP("direphish-email-world")


@mcp.tool
async def send_email(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    to: str,
    subject: str,
    body: str,
    cc: str = "",
) -> dict:
    """Send a new email."""
    return await _apply(
        actor=actor,
        role=role,
        action="send_email",
        args={"to": to, "subject": subject, "body": body, "cc": cc},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def reply_email(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    email_id: str,
    body: str,
) -> dict:
    """Reply to an existing email."""
    return await _apply(
        actor=actor,
        role=role,
        action="reply_email",
        args={"email_id": email_id, "body": body},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def forward_email(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    email_id: str,
    to: str,
    body: str = "",
) -> dict:
    """Forward an email to another recipient."""
    return await _apply(
        actor=actor,
        role=role,
        action="forward_email",
        args={"email_id": email_id, "to": to, "body": body},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def check_inbox(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
) -> dict:
    """Read recent emails from the actor's inbox."""
    return await _apply(
        actor=actor,
        role=role,
        action="check_inbox",
        args={},
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
    """Take no email action this round."""
    return await _apply(
        actor=actor,
        role=role,
        action="do_nothing",
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
