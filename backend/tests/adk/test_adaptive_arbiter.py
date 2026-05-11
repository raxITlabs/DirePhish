import uuid
import pytest
from google.adk.agents.invocation_context import InvocationContext
from google.adk.sessions.in_memory_session_service import InMemorySessionService

from adk.agents.adaptive_arbiter import AdaptiveArbiterAgent, _stagnation_score


def test_stagnation_score_diverse_actions_low():
    actions = [{"action": f"act_{i % 9}"} for i in range(12)]
    assert _stagnation_score(actions) < 0.4


def test_stagnation_score_repetitive_actions_high():
    actions = [{"action": "send_message"} for _ in range(10)]
    assert _stagnation_score(actions) > 0.7


def test_stagnation_score_empty():
    assert _stagnation_score([]) == 0.0


async def _ctx(agent, *, round_num, prior_actions):
    ss = InMemorySessionService()
    s = await ss.create_session(app_name="arb", user_id="t",
        state={"round_num": round_num, "all_actions_recent": prior_actions})
    return InvocationContext(session_service=ss, invocation_id=f"i-{uuid.uuid4().hex[:8]}",
                            agent=agent, session=s)


@pytest.mark.asyncio
async def test_arbiter_does_not_halt_diverse():
    agent = AdaptiveArbiterAgent(min_rounds=2, stagnation_threshold=0.7)
    actions = [{"action": f"act_{i}"} for i in range(15)]
    ctx = await _ctx(agent, round_num=3, prior_actions=actions)
    _ = [e async for e in agent._run_async_impl(ctx)]
    assert ctx.session.state.get("halt") is not True


@pytest.mark.asyncio
async def test_arbiter_halts_on_high_stagnation():
    agent = AdaptiveArbiterAgent(min_rounds=2, stagnation_threshold=0.6)
    actions = [{"action": "do_nothing"} for _ in range(10)]
    ctx = await _ctx(agent, round_num=3, prior_actions=actions)
    _ = [e async for e in agent._run_async_impl(ctx)]
    assert ctx.session.state.get("halt") is True


@pytest.mark.asyncio
async def test_arbiter_does_not_halt_below_min_rounds():
    agent = AdaptiveArbiterAgent(min_rounds=5, stagnation_threshold=0.6)
    actions = [{"action": "do_nothing"} for _ in range(10)]
    ctx = await _ctx(agent, round_num=2, prior_actions=actions)
    _ = [e async for e in agent._run_async_impl(ctx)]
    assert ctx.session.state.get("halt") is not True
