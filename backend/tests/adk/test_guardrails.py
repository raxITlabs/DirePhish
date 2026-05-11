"""before_tool_callback enforcing persona→tool permissions."""

from types import SimpleNamespace

from adk.callbacks.guardrails import enforce_permissions


def _make_tool(name: str):
    return SimpleNamespace(name=name)


def _make_ctx(agent_name: str):
    return SimpleNamespace(agent_name=agent_name)


def test_ciso_can_call_slack_email_and_pd():
    for tool_name in ["slack_send_message", "email_send_email", "pd_escalate"]:
        result = enforce_permissions(_make_tool(tool_name), {}, _make_ctx("ciso"))
        assert result is None, f"CISO blocked from {tool_name}"


def test_ir_lead_cannot_call_email_tools():
    result = enforce_permissions(_make_tool("email_send_email"), {}, _make_ctx("ir_lead"))
    assert result is not None
    assert result.get("isError") is True
    assert "not allowed" in result.get("error", "")


def test_soc_analyst_can_call_slack_and_pd():
    for tool_name in ["slack_send_message", "pd_acknowledge_alert"]:
        assert enforce_permissions(_make_tool(tool_name), {}, _make_ctx("soc_analyst")) is None


def test_legal_cannot_call_pd():
    result = enforce_permissions(_make_tool("pd_escalate"), {}, _make_ctx("legal"))
    assert result is not None
    assert result.get("isError") is True


def test_unknown_agent_falls_through():
    """Unknown agent → no restriction (don't break existing/test agents)."""
    result = enforce_permissions(_make_tool("anything"), {}, _make_ctx("unknown_agent"))
    assert result is None
