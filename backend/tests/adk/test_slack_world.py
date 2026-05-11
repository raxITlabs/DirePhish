"""R4: Slack-world FastMCP server smoke.

Uses FastMCP's in-process Client to exercise the server without
spawning a stdio subprocess. The test verifies:

1. The server boots cleanly (config loads, env lazy-init works).
2. ``send_message`` dispatches through CrucibleEnv.apply_action and
   returns an ActionEvent-shaped dict.
3. ``do_nothing`` succeeds (the cheapest end-to-end signal).
4. The env is reused across tool calls for the same simulation_id.

Tests deliberately use an isolated tmp DB dir so they don't leak state
between runs.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
from fastmcp import Client


@pytest.fixture
def isolated_db_dir(monkeypatch):
    """Point the slack-world server at a tmp dir so SQLite stays scoped."""
    with tempfile.TemporaryDirectory(prefix="direphish-slack-test-") as tmp:
        monkeypatch.setenv("DIREPHISH_SIM_DB_DIR", tmp)
        # Reset the module-level env cache between tests in the same process.
        from mcp_servers import slack_world as sw

        sw._envs.clear()
        yield Path(tmp)


@pytest.fixture
def slack_mcp(isolated_db_dir):
    """Import the FastMCP instance after env vars are set."""
    from mcp_servers.slack_world import mcp

    return mcp


@pytest.mark.asyncio
async def test_server_boots_and_lists_tools(slack_mcp):
    async with Client(slack_mcp) as client:
        tools = await client.list_tools()

    tool_names = {t.name for t in tools}
    expected = {
        "send_message",
        "reply_in_thread",
        "react",
        "mention_user",
        "create_channel",
        "do_nothing",
        "read_channel",
        "check_mentions",
    }
    assert expected.issubset(tool_names), (
        f"missing tools: {expected - tool_names}"
    )


@pytest.mark.asyncio
async def test_send_message_returns_action_event_shape(slack_mcp, isolated_db_dir):
    async with Client(slack_mcp) as client:
        result = await client.call_tool(
            "send_message",
            {
                "actor": "Marcus Thorne",
                "role": "defender",
                "simulation_id": "test-sim-1",
                "round_num": 1,
                "channel": "incident-war-room",
                "content": "War room up. SOC, confirm containment scope.",
            },
        )

    payload = result.data
    # ActionEvent.model_dump() shape
    assert payload["agent"] == "Marcus Thorne"
    assert payload["role"] == "defender"
    assert payload["world"] == "slack"
    assert payload["action"] == "send_message"
    assert payload["simulation_id"] == "test-sim-1"
    assert payload["round"] == 1
    assert payload["args"]["channel"] == "incident-war-room"
    assert "result" in payload

    # The per-sim db_dir was created by _get_env (even if SQLite hasn't
    # flushed any file yet — connection lifecycle is platform-internal).
    assert (isolated_db_dir / "test-sim-1").is_dir()


@pytest.mark.asyncio
async def test_do_nothing_succeeds_minimal_path(slack_mcp):
    async with Client(slack_mcp) as client:
        result = await client.call_tool(
            "do_nothing",
            {
                "actor": "Marcus Thorne",
                "role": "defender",
                "simulation_id": "test-sim-2",
                "round_num": 1,
            },
        )

    payload = result.data
    assert payload["action"] == "do_nothing"
    assert payload["world"] == "slack"


@pytest.mark.asyncio
async def test_env_is_reused_across_calls_for_same_sim(slack_mcp):
    """Second call with the same sim_id should hit the cached CrucibleEnv."""
    from mcp_servers import slack_world as sw

    async with Client(slack_mcp) as client:
        await client.call_tool(
            "do_nothing",
            {
                "actor": "Marcus Thorne",
                "role": "defender",
                "simulation_id": "cache-sim",
                "round_num": 1,
            },
        )
        env_after_first = sw._envs["cache-sim"]

        await client.call_tool(
            "do_nothing",
            {
                "actor": "Marcus Thorne",
                "role": "defender",
                "simulation_id": "cache-sim",
                "round_num": 2,
            },
        )
        env_after_second = sw._envs["cache-sim"]

    assert env_after_first is env_after_second


@pytest.mark.asyncio
async def test_separate_sim_ids_get_separate_envs(slack_mcp):
    from mcp_servers import slack_world as sw

    async with Client(slack_mcp) as client:
        await client.call_tool(
            "do_nothing",
            {
                "actor": "a",
                "role": "defender",
                "simulation_id": "sim-a",
                "round_num": 1,
            },
        )
        await client.call_tool(
            "do_nothing",
            {
                "actor": "b",
                "role": "defender",
                "simulation_id": "sim-b",
                "round_num": 1,
            },
        )

    assert "sim-a" in sw._envs
    assert "sim-b" in sw._envs
    assert sw._envs["sim-a"] is not sw._envs["sim-b"]
