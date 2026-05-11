"""Shared helpers for persona ``LlmAgent`` factories.

Every defender + adversary + judge persona uses the same boilerplate:
- Locate the project root so it can launch the right MCP stdio
  subprocess.
- Build one or more ``McpToolset`` connection params.
- Wire the ``track_cost`` after_model_callback.

This module owns that boilerplate so each persona file stays compact
(~40 lines: identity constants + instruction text + factory).
"""

from __future__ import annotations

import os
from pathlib import Path

from adk.callbacks import track_cost
from adk.models import CLAUDE_MODELS, GEMINI_MODELS


_BACKEND_DIR = Path(__file__).resolve().parents[3]  # backend/
_VENV_PYTHON = _BACKEND_DIR / ".venv" / "bin" / "python"


def _stdio_command_for_world(module: str) -> tuple[str, list[str]]:
    """Pick the right Python interpreter for an MCP stdio server.

    Prefers the project venv (avoids uv-run cold-start). Falls back to
    ``uv run python`` so the factory works on CI runners without a
    pre-built venv.
    """
    if _VENV_PYTHON.exists():
        return (str(_VENV_PYTHON), ["-m", module])
    return ("uv", ["run", "python", "-m", module])


def _world_toolset(*, module: str, prefix: str):
    """Build an McpToolset for a world's stdio server with per-world prefix.

    The prefix is required: Gemini's function-call schema rejects
    duplicate function names across tools (every world has e.g.
    ``do_nothing``). Prefixing — ``slack_do_nothing`` vs
    ``email_do_nothing`` — keeps the names disjoint.

    Timeout is bumped to 30s — first call per subprocess needs to
    construct ``CrucibleEnv`` (load YAML, open SQLite, start dispatch
    loop) which can take ~10s. The default 5s causes McpError timeouts
    when 5 defenders fire in parallel and all need their first call
    to land. Subsequent calls reuse the live env and respond in ms.
    """
    from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
    from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
    from mcp import StdioServerParameters

    command, args = _stdio_command_for_world(module)
    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command=command, args=args, env={**os.environ}
            ),
            timeout=30.0,
        ),
        tool_name_prefix=prefix,
    )


def slack_toolset():
    return _world_toolset(module="mcp_servers.slack_world", prefix="slack")


def email_toolset():
    return _world_toolset(module="mcp_servers.email_world", prefix="email")


def pagerduty_toolset():
    return _world_toolset(module="mcp_servers.pagerduty_world", prefix="pd")


def gemini_llm_agent(
    *,
    name: str,
    description: str,
    instruction: str,
    tools: list,
    model_key: str = "pro",
    output_key: str | None = None,
):
    """Construct an ``LlmAgent`` on Gemini with track_cost wired."""
    from google.adk.agents import LlmAgent

    return LlmAgent(
        name=name,
        description=description,
        model=GEMINI_MODELS[model_key],
        instruction=instruction,
        tools=tools,
        after_model_callback=track_cost,
        output_key=output_key or f"{name}_last_response",
    )


def claude_llm_agent(
    *,
    name: str,
    description: str,
    instruction: str,
    tools: list,
    model_key: str = "sonnet",
    output_key: str | None = None,
):
    """Construct an ``LlmAgent`` on Claude (via Vertex AI Model Garden)."""
    from google.adk.agents import LlmAgent

    return LlmAgent(
        name=name,
        description=description,
        model=CLAUDE_MODELS[model_key],
        instruction=instruction,
        tools=tools,
        after_model_callback=track_cost,
        output_key=output_key or f"{name}_last_response",
    )


__all__ = [
    "slack_toolset",
    "email_toolset",
    "pagerduty_toolset",
    "gemini_llm_agent",
    "claude_llm_agent",
]
