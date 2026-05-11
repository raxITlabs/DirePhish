"""R2: orchestrator runs as a BaseAgent over a SequentialAgent.

The W1 ``test_orchestrator_smoke.py`` pins the *external* RoundReport
contract. This file pins the *internal* shape: orchestrator inherits
from BaseAgent, its sub_agents tree is a SequentialAgent, and the four
phase adapters appear in the canonical order.

Together they protect against two kinds of regression:
- Behavior regression — caught by the legacy smoke tests.
- Structural regression — caught here. If someone later "simplifies"
  the orchestrator back to a hand-rolled async coordinator, the tree
  introspection breaks.
"""

from __future__ import annotations

import pytest

from google.adk.agents import BaseAgent, SequentialAgent

from adk.orchestrator import Orchestrator
from tests.adk.test_orchestrator_smoke import (
    FakeAdversary,
    FakeEnv,
    FakeJudge,
    FakePressure,
)
from adk.agents.personas import IRLeadPersona


@pytest.fixture
def orch():
    async def fake_strategy(env, round_num, simulation_id):
        return (
            "incident-war-room",
            "send_message",
            {"channel": "incident-war-room", "content": "hi"},
        )

    return Orchestrator(
        env=FakeEnv(),
        pressure=FakePressure(),
        adversary=FakeAdversary(),
        defenders=[IRLeadPersona(strategy=fake_strategy)],
        judge=FakeJudge(),
        simulation_id="structural-test",
    )


def test_orchestrator_is_a_base_agent(orch):
    assert isinstance(orch, BaseAgent)


def test_orchestrator_holds_a_sequential_round(orch):
    assert isinstance(orch.sequence, SequentialAgent)


def test_sequential_sub_agents_are_in_canonical_phase_order(orch):
    names = [sa.name for sa in orch.sequence.sub_agents]
    # 4 sub-agents: pressure, adversary, defender (single or team), judge
    assert len(names) == 4
    assert names[0] == "pressure"
    # Adversary name is derived from the inner.name → "The_Silent_IP_Drain_Operator"
    assert "Silent" in names[1] or names[1] == "adversary"
    # Single-defender path → defender adapter name (Marcus_Thorne) instead of "defender_team"
    assert "Marcus" in names[2] or names[2] == "defender_team"
    assert names[3] == "judge"


def test_orchestrator_simulation_id_is_persisted_as_field(orch):
    assert orch.simulation_id == "structural-test"


def test_orchestrator_sub_agents_tree_is_findable(orch):
    """find_agent walks the sub_agents tree — used by adk web."""
    pressure_agent = orch.find_agent("pressure")
    judge_agent = orch.find_agent("judge")
    assert pressure_agent is not None
    assert judge_agent is not None


def test_orchestrator_field_validation_rejects_unknown_kwargs():
    """BaseAgent extra='forbid' applies — typos should error loudly."""
    from pydantic import ValidationError

    async def stub_strategy(env, r, s):
        return ("x", "do_nothing", {})

    with pytest.raises(ValidationError):
        Orchestrator(
            env=FakeEnv(),
            pressure=FakePressure(),
            adversary=FakeAdversary(),
            defenders=[IRLeadPersona(strategy=stub_strategy)],
            judge=FakeJudge(),
            simulation_id="x",
            some_typo_kwarg=True,
        )
