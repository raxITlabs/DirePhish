"""R1: PressureEngineAgent as BaseAgent — async path.

The existing ``test_pressure_engine.py`` pins the sync ``tick()`` facade.
This file adds the new contract: as an ADK ``BaseAgent`` sub-agent,
``_run_async_impl`` must

1. Read ``round_num`` from ``ctx.session.state``.
2. Write the round's events to ``ctx.session.state["pressure_events"]``.
3. Yield exactly one summary ``Event`` authored by the agent's name.

These are the invariants downstream sub-agents (adversary, defenders,
judge) and the cost callback rely on. If any of them break, the
orchestrator's ``SequentialAgent`` round assembly silently breaks too.
"""

from __future__ import annotations

import uuid

import pytest

from google.adk.agents.invocation_context import InvocationContext
from google.adk.sessions.in_memory_session_service import InMemorySessionService

from crucible.config import PressureConfig
from crucible.events import PressureEvent

from adk.agents.pressure_engine import PressureEngineAgent


def _countdown(hours: float = 2.0) -> PressureConfig:
    return PressureConfig(
        name="containment_deadline",
        type="countdown",
        affects_roles=["ciso"],
        hours=hours,
        hours_until=None,
        value=None,
        unit=None,
        triggered_by=None,
        severity_at_50pct="high",
        severity_at_25pct="critical",
    )


async def _make_ctx(agent: PressureEngineAgent, round_num: int) -> InvocationContext:
    """Construct a minimal InvocationContext for unit-testing _run_async_impl.

    InMemorySessionService is the lightest session backend and the only
    sub-agent collaborator we need — _run_async_impl reads/writes session
    state and yields events. No LLM, artifact, or memory services involved.
    """
    session_service = InMemorySessionService()
    session = await session_service.create_session(
        app_name="direphish-test",
        user_id="pytest",
        state={agent.STATE_KEY_ROUND: round_num},
    )
    return InvocationContext(
        session_service=session_service,
        invocation_id=f"inv-{uuid.uuid4().hex[:8]}",
        agent=agent,
        session=session,
    )


@pytest.mark.asyncio
async def test_run_async_writes_events_to_state_and_yields_one_event():
    agent = PressureEngineAgent(
        configs=[_countdown(hours=2.0)], hours_per_round=1.0
    )
    ctx = await _make_ctx(agent, round_num=1)

    yielded = [event async for event in agent._run_async_impl(ctx)]

    assert len(yielded) == 1, f"expected 1 trace event, got {len(yielded)}"
    assert yielded[0].author == "pressure_engine"

    events = ctx.session.state[PressureEngineAgent.STATE_KEY_EVENTS]
    assert events, "round 1 should emit at least one pressure event"
    assert all(isinstance(e, PressureEvent) for e in events)


@pytest.mark.asyncio
async def test_run_async_uses_zero_when_round_missing_from_state():
    """A missing round_num key defaults to 0 — agent should not raise."""
    agent = PressureEngineAgent(configs=[_countdown()], hours_per_round=1.0)
    session_service = InMemorySessionService()
    session = await session_service.create_session(
        app_name="direphish-test",
        user_id="pytest",
        state={},  # no round_num key
    )
    ctx = InvocationContext(
        session_service=session_service,
        invocation_id="inv-test",
        agent=agent,
        session=session,
    )

    yielded = [event async for event in agent._run_async_impl(ctx)]

    assert len(yielded) == 1
    # round 0 may or may not emit events depending on engine semantics;
    # what matters is the agent didn't raise and wrote a list to state.
    assert isinstance(
        ctx.session.state[PressureEngineAgent.STATE_KEY_EVENTS], list
    )


@pytest.mark.asyncio
async def test_run_async_two_rounds_produce_distinct_event_lists():
    """Round 1 and round 2 of a 2-hour countdown emit different events."""
    agent = PressureEngineAgent(
        configs=[_countdown(hours=2.0)], hours_per_round=1.0
    )

    ctx1 = await _make_ctx(agent, round_num=1)
    _ = [event async for event in agent._run_async_impl(ctx1)]
    events_r1 = ctx1.session.state[PressureEngineAgent.STATE_KEY_EVENTS]

    ctx2 = await _make_ctx(agent, round_num=2)
    _ = [event async for event in agent._run_async_impl(ctx2)]
    events_r2 = ctx2.session.state[PressureEngineAgent.STATE_KEY_EVENTS]

    kinds_r1 = sorted({e.kind for e in events_r1})
    kinds_r2 = sorted({e.kind for e in events_r2})

    assert kinds_r1 != kinds_r2 or events_r1 != events_r2, (
        f"expected different events round-to-round, got r1={events_r1!r} "
        f"r2={events_r2!r}"
    )


def test_construction_requires_configs_or_engine():
    with pytest.raises(TypeError, match="`configs` or `engine`"):
        PressureEngineAgent()


def test_basemodel_extra_forbid_rejects_unknown_kwargs():
    """BaseAgent has extra='forbid' — undeclared kwargs must error."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        PressureEngineAgent(configs=[], some_typo_field=True)
