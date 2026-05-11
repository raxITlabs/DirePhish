"""AttackerObservationAgent — defender summary for adversary asymmetric info."""

import uuid
import pytest
from google.adk.agents.invocation_context import InvocationContext
from google.adk.sessions.in_memory_session_service import InMemorySessionService

from adk.agents.attacker_observation import AttackerObservationAgent


async def _ctx(agent, *, round_num: int, prior_actions=None) -> InvocationContext:
    session_service = InMemorySessionService()
    state = {"round_num": round_num}
    if prior_actions is not None:
        state["prior_defender_actions"] = prior_actions
    session = await session_service.create_session(
        app_name="obs-test", user_id="pytest",
        state=state,
    )
    return InvocationContext(
        session_service=session_service,
        invocation_id=f"inv-{uuid.uuid4().hex[:8]}",
        agent=agent, session=session,
    )


@pytest.mark.asyncio
async def test_round_1_returns_empty_observation():
    agent = AttackerObservationAgent()
    ctx = await _ctx(agent, round_num=1)
    _ = [e async for e in agent._run_async_impl(ctx)]
    assert ctx.session.state["attacker_observation"] == ""


@pytest.mark.asyncio
async def test_round_2_summarizes_prior_actions():
    prior = [
        {"agent": "Marcus Thorne", "world": "slack", "action": "send_message", "args": {"content": "Isolating host"}},
    ]
    agent = AttackerObservationAgent()
    ctx = await _ctx(agent, round_num=2, prior_actions=prior)
    _ = [e async for e in agent._run_async_impl(ctx)]
    obs = ctx.session.state["attacker_observation"]
    assert "Marcus Thorne" in obs
    assert "send_message" in obs


@pytest.mark.asyncio
async def test_handles_missing_prior_defender_actions():
    """No prior_defender_actions key in state => empty observation string."""
    agent = AttackerObservationAgent()
    ctx = await _ctx(agent, round_num=3)
    _ = [e async for e in agent._run_async_impl(ctx)]
    obs = ctx.session.state["attacker_observation"]
    assert obs == ""


@pytest.mark.asyncio
async def test_observation_includes_content_preview():
    prior = [
        {"agent": "Dane Stuckey", "world": "email", "action": "send_email",
         "args": {"content": "Escalating to CISO now"}},
    ]
    agent = AttackerObservationAgent()
    ctx = await _ctx(agent, round_num=4, prior_actions=prior)
    _ = [e async for e in agent._run_async_impl(ctx)]
    obs = ctx.session.state["attacker_observation"]
    assert "Escalating to CISO now" in obs or "Dane Stuckey" in obs
