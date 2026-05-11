"""PagerDuty-world MCP server (FastMCP, stdio).

Mirrors ``slack_world.py`` / ``email_world.py`` for crucible's
PagerDuty platform. This is DirePhish's stand-in for a SIEM/alerting
surface in v1 — actions match incident-response observability tools
in the demo story (paging, ack, escalation, incident notes).

Exposes:
- ``page_oncall`` / ``acknowledge_alert`` / ``escalate`` /
  ``add_incident_note`` / ``do_nothing``
- ``check_alerts`` (observation)

Run standalone for debugging:
    cd backend && uv run python -m mcp_servers.pagerduty_world
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

logger = logging.getLogger("direphish.mcp.pagerduty")


_WORLD_NAME = "pagerduty"
_DEFAULT_DB_ROOT = "./uploads/adk-smoke"

_envs: dict[str, CrucibleEnv] = {}
_env_lock = asyncio.Lock()


def _load_pagerduty_platform_config() -> PlatformConfig:
    yaml_path = (
        importlib.resources.files("crucible.builtins") / "channels" / "pagerduty.yaml"
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

        cfg = _load_pagerduty_platform_config()
        env = CrucibleEnv(
            world_configs=[cfg],
            pressure_configs=[],
            db_dir=str(db_dir),
            hours_per_round=1.0,
        )
        await env.start()
        _envs[simulation_id] = env
        logger.info("[pagerduty-mcp] env constructed sim=%s db_dir=%s", simulation_id, db_dir)
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


mcp = FastMCP("direphish-pagerduty-world")


@mcp.tool
async def page_oncall(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    target_role: str,
    urgency: str,
    message: str,
) -> dict:
    """Page an on-call team member to respond to an incident."""
    return await _apply(
        actor=actor,
        role=role,
        action="page_oncall",
        args={"target_role": target_role, "urgency": urgency, "message": message},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def acknowledge_alert(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    alert_id: str,
    notes: str,
) -> dict:
    """Acknowledge an alert."""
    return await _apply(
        actor=actor,
        role=role,
        action="acknowledge_alert",
        args={"alert_id": alert_id, "notes": notes},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def escalate(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    incident_id: str,
    reason: str,
    target_level: str,
) -> dict:
    """Escalate an incident."""
    return await _apply(
        actor=actor,
        role=role,
        action="escalate",
        args={"incident_id": incident_id, "reason": reason, "target_level": target_level},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def add_incident_note(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
    incident_id: str,
    note: str,
) -> dict:
    """Add a note to an active incident."""
    return await _apply(
        actor=actor,
        role=role,
        action="add_incident_note",
        args={"incident_id": incident_id, "note": note},
        simulation_id=simulation_id,
        round_num=round_num,
    )


@mcp.tool
async def check_alerts(
    actor: str,
    role: str,
    simulation_id: str,
    round_num: int,
) -> dict:
    """Check active PagerDuty alerts."""
    return await _apply(
        actor=actor,
        role=role,
        action="check_alerts",
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
    """No PagerDuty action this round."""
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
