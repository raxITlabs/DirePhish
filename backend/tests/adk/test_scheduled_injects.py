"""InjectAgent fires events from config.scheduled_events at matching rounds."""

import uuid
import pytest
from google.adk.agents.invocation_context import InvocationContext
from google.adk.sessions.in_memory_session_service import InMemorySessionService

from adk.agents.scheduled_injects import InjectAgent


async def _ctx(agent, *, round_num: int) -> InvocationContext:
    session_service = InMemorySessionService()
    session = await session_service.create_session(
        app_name="inject-test", user_id="pytest",
        state={"round_num": round_num},
    )
    return InvocationContext(
        session_service=session_service,
        invocation_id=f"inv-{uuid.uuid4().hex[:8]}",
        agent=agent, session=session,
    )


@pytest.mark.asyncio
async def test_injects_fire_at_configured_round():
    agent = InjectAgent(events=[
        {"round": 2, "description": "Ransom note arrives", "kill_chain_step": "extortion"},
    ])
    ctx = await _ctx(agent, round_num=2)
    _ = [e async for e in agent._run_async_impl(ctx)]
    assert ctx.session.state["active_injects"][-1]["description"] == "Ransom note arrives"


@pytest.mark.asyncio
async def test_injects_do_not_fire_at_wrong_round():
    agent = InjectAgent(events=[{"round": 5, "description": "x"}])
    ctx = await _ctx(agent, round_num=2)
    _ = [e async for e in agent._run_async_impl(ctx)]
    assert len(ctx.session.state.get("active_injects", [])) == 0


@pytest.mark.asyncio
async def test_injects_fire_only_once():
    agent = InjectAgent(events=[{"round": 3, "description": "fire once"}])
    ctx1 = await _ctx(agent, round_num=3)
    _ = [e async for e in agent._run_async_impl(ctx1)]
    ctx2 = await _ctx(agent, round_num=3)
    _ = [e async for e in agent._run_async_impl(ctx2)]
    assert {ev["description"] for ev in agent._fired} == {"fire once"}


@pytest.mark.asyncio
async def test_empty_events_list_is_no_op():
    agent = InjectAgent(events=[])
    ctx = await _ctx(agent, round_num=1)
    events = [e async for e in agent._run_async_impl(ctx)]
    assert len(events) == 1  # one summary event always yielded
    assert ctx.session.state.get("active_injects", []) == []
