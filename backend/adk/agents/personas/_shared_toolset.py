"""Module-level cached MCPToolset instances.

Each persona that needs slack/email/pagerduty tools imports the same
toolset object, so ADK's MCP client wires all personas to a single
stdio subprocess per world. Subprocess holds one CrucibleEnv per
simulation_id, so all personas in a sim see the same channels +
pressure state — enabling world-history.
"""

from __future__ import annotations

from typing import Optional

from ._factory import _world_toolset


_slack: Optional[object] = None
_email: Optional[object] = None
_pagerduty: Optional[object] = None


def get_slack_toolset():
    global _slack
    if _slack is None:
        _slack = _world_toolset(module="mcp_servers.slack_world", prefix="slack")
    return _slack


def get_email_toolset():
    global _email
    if _email is None:
        _email = _world_toolset(module="mcp_servers.email_world", prefix="email")
    return _email


def get_pagerduty_toolset():
    global _pagerduty
    if _pagerduty is None:
        _pagerduty = _world_toolset(module="mcp_servers.pagerduty_world", prefix="pd")
    return _pagerduty


def reset_toolset_cache() -> None:
    """Test helper: clear singletons so a fresh subprocess spawns."""
    global _slack, _email, _pagerduty
    _slack = None
    _email = None
    _pagerduty = None


__all__ = [
    "get_slack_toolset",
    "get_email_toolset",
    "get_pagerduty_toolset",
    "reset_toolset_cache",
]
