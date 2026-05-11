"""before_tool_callback enforcing persona→tool permission matrix.

Each persona may only call tools whose name starts with one of the
allowed prefixes for its role. Used as a defensive guardrail to keep
SOC analysts from drafting press releases and the CEO from
acknowledging SIEM alerts. Wired via LlmAgent(before_tool_callback=).
"""

from __future__ import annotations

from typing import Any, Optional


PERMISSIONS: dict[str, set[str]] = {
    "ciso":         {"slack_", "email_", "pd_"},
    "ir_lead":      {"slack_", "pd_"},
    "soc_analyst":  {"slack_", "pd_"},
    "legal":        {"slack_", "email_"},
    "ceo":          {"slack_", "email_"},
    "threat_actor": {"slack_", "email_", "pd_"},
}


def enforce_permissions(tool: Any, args: dict, tool_context: Any) -> Optional[dict]:
    """Return None to allow the call; return an error dict to block.

    Block format matches MCP-style errors so the LLM sees a coherent
    'tool failed' response and adjusts.
    """
    agent_name = getattr(tool_context, "agent_name", None) or ""
    tool_name = getattr(tool, "name", "") if hasattr(tool, "name") else str(tool)

    allowed = PERMISSIONS.get(agent_name)
    if allowed is None:
        return None  # unknown agent — no restriction

    if not any(tool_name.startswith(p) for p in allowed):
        return {
            "isError": True,
            "error": f"{agent_name} not allowed to call {tool_name}",
        }
    return None
