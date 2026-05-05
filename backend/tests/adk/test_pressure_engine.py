"""W1 slices 4-5: pressure engine wrapper.

These tests pin DirePhish's wrapper around ``crucible.pressure.PressureEngine``
through three behaviors it must surface to the orchestrator:

1. Countdown deadlines decrement per round and emit a ``countdown_breach``
   event when they hit zero (with the severity-transition events along
   the way).
2. Scripted ``triggered`` configs stay silent until ``trigger()`` is
   called, then emit on the next ``tick`` exactly once.
3. The wrapper is deterministic — same inputs yield same events, twice.

The underlying engine is already TDD'd inside crucible (78 tests on
``feature/adk-hooks``). These tests guard the *integration seam* — that
the wrapper builds the engine correctly and surfaces events without
loss or reordering.
"""

import pytest

from crucible.config import PressureConfig
from crucible.events import PressureEvent

from adk.agents.pressure_engine import PressureEngineAgent


def make_countdown(name: str = "containment_deadline", hours: float = 2.0) -> PressureConfig:
    return PressureConfig(
        name=name,
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


def make_triggered(name: str, trigger: str) -> PressureConfig:
    return PressureConfig(
        name=name,
        type="triggered",
        affects_roles=["ciso"],
        hours=None,
        hours_until=None,
        value=None,
        unit=None,
        triggered_by=trigger,
        severity_at_50pct="high",
        severity_at_25pct="critical",
    )


class TestCountdown:
    def test_tick_decrements_and_emits_breach_at_zero(self):
        """2-hour deadline at 1 hour/round: severity transitions then breach."""
        agent = PressureEngineAgent(configs=[make_countdown(hours=2.0)], hours_per_round=1.0)

        # Round 1: 1 hour remaining (50% → high)
        events_r1 = agent.tick(1)
        assert any(
            e.kind == "severity_changed" and e.payload["to"] == "high" for e in events_r1
        ), f"expected severity→high in round 1, got {events_r1!r}"

        # Round 2: 0 hours remaining (25% → critical, plus countdown_breach)
        events_r2 = agent.tick(2)
        kinds = [e.kind for e in events_r2]
        assert "countdown_breach" in kinds, (
            f"expected countdown_breach in round 2, got {kinds}"
        )

        # Round 3: deadline already breached, no further events
        assert agent.tick(3) == [], "no events after breach"

    def test_events_are_pressure_event_instances(self):
        agent = PressureEngineAgent(configs=[make_countdown()], hours_per_round=1.0)
        events = agent.tick(1)
        assert events, "round 1 should emit at least one event"
        assert all(isinstance(e, PressureEvent) for e in events)


class TestScriptedEvents:
    def test_scheduled_event_fires_on_round_match(self):
        """A triggered config is silent until trigger(), then fires once.

        Crucible matches the trigger key against ``PressureConfig.name``
        (not ``triggered_by``); ``triggered_by`` is metadata for downstream
        logging, not the activation key.
        """
        agent = PressureEngineAgent(
            configs=[make_triggered("cascade", "patient_zero_compromised")],
            hours_per_round=1.0,
        )

        # Silent before trigger
        assert agent.tick(1) == [], "triggered config should be silent pre-trigger"

        # Fire by pressure name; next tick flushes the scripted event
        agent.trigger("cascade")
        events = agent.tick(2)
        kinds = [e.kind for e in events]
        assert "scripted" in kinds, f"expected scripted event after trigger, got {kinds}"
        scripted = next(e for e in events if e.kind == "scripted")
        assert scripted.target == "cascade"
        assert scripted.round == 2

        # Subsequent tick should not re-fire
        next_events = agent.tick(3)
        assert all(e.kind != "scripted" for e in next_events), "scripted event should not re-fire"

    def test_unknown_trigger_is_no_op(self):
        agent = PressureEngineAgent(
            configs=[make_triggered("cascade", "patient_zero_compromised")],
            hours_per_round=1.0,
        )
        agent.trigger("nope_does_not_exist")  # not raised
        assert agent.tick(1) == []


class TestDeterminism:
    def test_two_agents_same_config_same_events(self):
        """Pure logic: identical configs + same tick sequence → identical events."""
        a = PressureEngineAgent(configs=[make_countdown()], hours_per_round=1.0)
        b = PressureEngineAgent(configs=[make_countdown()], hours_per_round=1.0)
        for r in (1, 2, 3):
            ea = [(e.kind, e.target, e.payload, e.round) for e in a.tick(r)]
            eb = [(e.kind, e.target, e.payload, e.round) for e in b.tick(r)]
            assert ea == eb, f"divergence at round {r}: {ea} vs {eb}"

    def test_empty_config_list_yields_no_events(self):
        agent = PressureEngineAgent(configs=[], hours_per_round=1.0)
        assert agent.tick(1) == []
        assert agent.tick(2) == []
