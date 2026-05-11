"""IR Lead defender persona (Marcus Thorne).

Two construction surfaces live here:

1. ``IRLeadPersona(strategy=...)`` — the W1 strategy-callable shim. Used
   by the orchestrator round-lifecycle test and the legacy smoke
   endpoint while the orchestrator is still hand-rolled. No LLM call.
2. ``make_ir_lead(env=None) -> LlmAgent`` — the production W2 factory.
   Returns a real ``LlmAgent`` backed by Vertex AI Gemini Pro with the
   Slack-world MCP toolset, the ``track_cost`` callback, and a real
   IR-lead instruction template.

Both export the same persona identity constants
(``IR_LEAD_NAME`` / ``IR_LEAD_ROLE`` / ``IR_LEAD_SLUG``) so downstream
code never duplicates magic strings. ``make_ir_lead`` is intended to
replace ``IRLeadPersona`` everywhere once R2 lands the BaseAgent
orchestrator — at that point both can be wrapped as ``BaseAgent``
sub-agents inside a ``ParallelAgent`` defender team.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional, Protocol

from crucible.events import ActionEvent

from adk.callbacks import track_cost
from adk.models import GEMINI_MODELS

logger = logging.getLogger("direphish.adk.personas.ir_lead")


# ---------------------------------------------------------------------------
# Persona identity — single source of truth for both factories.
# ---------------------------------------------------------------------------
IR_LEAD_NAME: str = "Marcus Thorne"
IR_LEAD_ROLE: str = "defender"
IR_LEAD_SLUG: str = "infrastructure_lead"


# ---------------------------------------------------------------------------
# Strategy-callable shim (W1 surface preserved for tests + legacy smoke)
# ---------------------------------------------------------------------------


class _EnvLike(Protocol):
    async def apply_action(
        self,
        actor: str,
        role: str,
        world: str,
        action: str,
        args: dict,
        simulation_id: str,
        round_num: int,
    ) -> ActionEvent: ...


class IRLeadPersona:
    """A defender persona that picks one action per round (test/legacy mode).

    Construction takes a ``strategy``: an async callable that, given
    the environment + round + simulation context, returns the tuple
    ``(world, action, args)`` to dispatch. The orchestrator round-
    lifecycle test (``test_orchestrator_smoke.py``) and the W1 smoke
    endpoint use this surface to drive the persona without a real LLM.

    R2 swaps the orchestrator to ADK-native; at that point this class
    becomes a small ``BaseAgent`` shim around the same strategy. For
    now it preserves the W1 ``.act()`` contract verbatim.
    """

    name: str = IR_LEAD_NAME
    slug: str = IR_LEAD_SLUG
    role: str = IR_LEAD_ROLE

    def __init__(
        self,
        strategy: Callable[
            [_EnvLike, int, str],
            Awaitable[tuple[str, str, dict]],
        ],
    ) -> None:
        self._strategy = strategy

    async def act(
        self,
        env: _EnvLike,
        round_num: int,
        simulation_id: str,
    ) -> ActionEvent:
        world, action, args = await self._strategy(env, round_num, simulation_id)
        return await env.apply_action(
            actor=self.name,
            role=self.role,
            world=world,
            action=action,
            args=args,
            simulation_id=simulation_id,
            round_num=round_num,
        )


# ---------------------------------------------------------------------------
# Production factory — real ADK LlmAgent backed by Vertex Gemini Pro.
# ---------------------------------------------------------------------------

_IR_LEAD_INSTRUCTION = """\
You are Marcus Thorne, the on-call Incident Response Lead.

Identity:
- Name: Marcus Thorne
- Role: defender (Incident Response Lead)
- Reports to: CISO
- Coordinates with: SOC analysts, Infrastructure team, Legal, CEO

Operating context:
- A live security incident is in progress.
- Pressure timers may be running (containment deadlines, regulator
  clocks, customer SLAs). The system will surface pressure events to
  you between rounds.
- You communicate primarily via Slack channels in the simulation
  world. Every round you may make exactly ONE tool call.

Your priorities, in order:
1. Stop the bleeding — contain the active threat.
2. Preserve evidence — direct SOC to capture forensic artifacts.
3. Coordinate communications — keep the war room informed; escalate
   to CISO/CEO when scope or impact changes materially.
4. Move fast but don't panic — short, decisive Slack messages beat
   long deliberation.

When you call a tool:
- Always pass `actor="Marcus Thorne"` and `role="defender"`.
- Always pass `simulation_id` and `round_num` exactly as provided in
  the user message — do not invent values.
- Prefer `send_message` to `incident-war-room` for coordination,
  `send_message` to a sub-team channel for delegation. Use
  `mention_user` when you need a specific person's attention.
- Use `do_nothing` only when there is genuinely nothing useful to
  add this round (rare — usually wait costs more than say).

Output: exactly one tool call per turn. No commentary, no preamble.
"""


def _stdio_command_for_slack_world() -> tuple[str, list[str]]:
    """Return (command, args) that launches the slack-world MCP server.

    Prefers the venv's Python so the subprocess inherits all DirePhish
    deps without re-invoking uv (which can cost ~300ms of cold-start
    per round). Falls back to ``uv run`` for environments where the
    venv path isn't predictable.
    """
    backend_dir = Path(__file__).resolve().parents[3]
    venv_python = backend_dir / ".venv" / "bin" / "python"
    if venv_python.exists():
        return (str(venv_python), ["-m", "mcp_servers.slack_world"])
    return ("uv", ["run", "python", "-m", "mcp_servers.slack_world"])


def make_ir_lead(
    *,
    model_key: str = "pro",
    extra_env: Optional[dict[str, str]] = None,
    instruction: Optional[str] = None,
):
    """Construct the production IR Lead ``LlmAgent``.

    Returns an ADK ``LlmAgent`` wired to:
    - Vertex AI Gemini Pro via ``LLMRegistry`` (the ``models.GEMINI_MODELS``
      pin).
    - The Slack-world FastMCP server over stdio.
    - The ``track_cost`` ``after_model_callback`` so every model call
      lands in ``CostTracker`` keyed by ``simulation_id`` from session
      state.

    Args:
        model_key: ``"pro"`` (default) or ``"flash"`` — picks from
            ``adk.models.GEMINI_MODELS``.
        extra_env: Extra environment variables to forward to the MCP
            subprocess (passed verbatim to ``StdioServerParameters.env``).
        instruction: Override the default IR Lead instruction. Tests
            can substitute a deterministic one-shot instruction.

    Construction is lazy on imports so the unit test of the strategy
    surface (``IRLeadPersona``) doesn't pay the cost of importing
    google-adk's MCP machinery.
    """
    # Imports here so module-level still parses even if google-adk
    # mcp_tool isn't installed (defensive — the dep is required, but
    # this isolates the import error surface for cleaner test output).
    from google.adk.agents import LlmAgent
    from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
    from mcp import StdioServerParameters

    command, args = _stdio_command_for_slack_world()
    env = {**os.environ}
    if extra_env:
        env.update(extra_env)

    slack_toolset = McpToolset(
        connection_params=StdioServerParameters(
            command=command,
            args=args,
            env=env,
        ),
    )

    return LlmAgent(
        name="ir_lead",
        description=(
            "Marcus Thorne, on-call Incident Response Lead. "
            "Coordinates war room, directs SOC + Infra, escalates to CISO."
        ),
        model=GEMINI_MODELS[model_key],
        instruction=instruction or _IR_LEAD_INSTRUCTION,
        tools=[slack_toolset],
        after_model_callback=track_cost,
        output_key="ir_lead_last_response",
    )


__all__ = [
    "IR_LEAD_NAME",
    "IR_LEAD_ROLE",
    "IR_LEAD_SLUG",
    "IRLeadPersona",
    "make_ir_lead",
]
