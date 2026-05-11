"""Smoke tests for email_world and pagerduty_world FastMCP servers.

Boots each via FastMCP's in-process Client, verifies tools are listed,
and exercises one round-trip per server to confirm CrucibleEnv
dispatch works for non-Slack worlds.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastmcp import Client


@pytest.fixture
def email_isolated(monkeypatch):
    with tempfile.TemporaryDirectory(prefix="direphish-email-test-") as tmp:
        monkeypatch.setenv("DIREPHISH_SIM_DB_DIR", tmp)
        from mcp_servers import email_world as ew

        ew._envs.clear()
        yield Path(tmp)


@pytest.fixture
def email_mcp(email_isolated):
    from mcp_servers.email_world import mcp

    return mcp


@pytest.fixture
def pagerduty_isolated(monkeypatch):
    with tempfile.TemporaryDirectory(prefix="direphish-pd-test-") as tmp:
        monkeypatch.setenv("DIREPHISH_SIM_DB_DIR", tmp)
        from mcp_servers import pagerduty_world as pw

        pw._envs.clear()
        yield Path(tmp)


@pytest.fixture
def pagerduty_mcp(pagerduty_isolated):
    from mcp_servers.pagerduty_world import mcp

    return mcp


@pytest.mark.asyncio
async def test_email_world_lists_expected_tools(email_mcp):
    async with Client(email_mcp) as client:
        tools = await client.list_tools()
    names = {t.name for t in tools}
    assert {
        "send_email",
        "reply_email",
        "forward_email",
        "check_inbox",
        "do_nothing",
    }.issubset(names)


@pytest.mark.asyncio
async def test_email_send_email_dispatches(email_mcp):
    async with Client(email_mcp) as client:
        result = await client.call_tool(
            "send_email",
            {
                "actor": "Che Chang",
                "role": "defender",
                "simulation_id": "test-email",
                "round_num": 1,
                "to": "regulators@example.gov",
                "subject": "URGENT: GDPR 72-hour disclosure",
                "body": "Acknowledging breach scope...",
            },
        )
    payload = result.data
    assert payload["world"] == "email"
    assert payload["action"] == "send_email"
    assert payload["agent"] == "Che Chang"
    assert payload["args"]["to"] == "regulators@example.gov"


@pytest.mark.asyncio
async def test_pagerduty_world_lists_expected_tools(pagerduty_mcp):
    async with Client(pagerduty_mcp) as client:
        tools = await client.list_tools()
    names = {t.name for t in tools}
    assert {
        "page_oncall",
        "acknowledge_alert",
        "escalate",
        "add_incident_note",
        "check_alerts",
        "do_nothing",
    }.issubset(names)


@pytest.mark.asyncio
async def test_pagerduty_page_oncall_dispatches(pagerduty_mcp):
    async with Client(pagerduty_mcp) as client:
        result = await client.call_tool(
            "page_oncall",
            {
                "actor": "Marcus Thorne",
                "role": "defender",
                "simulation_id": "test-pd",
                "round_num": 1,
                "target_role": "security",
                "urgency": "critical",
                "message": "Ransomware detected in prod DB",
            },
        )
    payload = result.data
    assert payload["world"] == "pagerduty"
    assert payload["action"] == "page_oncall"
    assert payload["args"]["urgency"] == "critical"
