"""W1 slice 6: orchestrator round-lifecycle smoke.

A single round must execute four phases in order:

1. **pressure** — ``PressureEngineAgent.tick(round_num)``
2. **adversary** — adversary persona's ``act()``
3. **defender** — defender persona's ``act()`` (IR Lead in W1)
4. **judge** — judge ``score()`` over the round

Each phase produces a typed artifact threaded into the ``RoundReport``.
The orchestrator is the unit under test; env, adversary, judge, and
the LLM strategy are fakes that record their invocations so the test
can assert ordering and output wiring.

Real ``LlmAgent`` + Vertex calls are W2 work — this slice pins the
shape of the round driver without dragging the model plane in.
"""

import pytest

from crucible.events import ActionEvent, PressureEvent

from adk.agents.personas import IRLeadPersona
from adk.orchestrator import Orchestrator, RoundReport


class FakeEnv:
    """Captures ``apply_action`` calls; returns a canned ``ActionEvent``."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def apply_action(
        self,
        actor: str,
        role: str,
        world: str,
        action: str,
        args: dict,
        simulation_id: str,
        round_num: int,
    ) -> ActionEvent:
        self.calls.append(
            {
                "actor": actor,
                "role": role,
                "world": world,
                "action": action,
                "args": args,
                "simulation_id": simulation_id,
                "round_num": round_num,
            }
        )
        return ActionEvent(
            round=round_num,
            timestamp="2026-05-05T00:00:00+00:00",
            simulation_id=simulation_id,
            agent=actor,
            role=role,
            world=world,
            action=action,
            args=args,
            result={"success": True, "fake": True},
        )


class FakePressure:
    """Returns a single canned ``severity_changed`` event each tick."""

    def __init__(self) -> None:
        self.tick_calls: list[int] = []

    def tick(self, round_num: int) -> list[PressureEvent]:
        self.tick_calls.append(round_num)
        return [
            PressureEvent(
                kind="severity_changed",
                target="containment_deadline",
                payload={"from": "normal", "to": "high"},
                round=round_num,
            )
        ]


class FakeAdversary:
    name = "The Silent IP Drain Operator"
    role = "attacker"

    def __init__(self) -> None:
        self.act_calls: list[int] = []

    async def act(self, env, round_num: int, simulation_id: str) -> ActionEvent:
        self.act_calls.append(round_num)
        return await env.apply_action(
            actor=self.name,
            role=self.role,
            world="c2-channel",
            action="send_message",
            args={"content": "burn the SP", "channel": "c2-channel"},
            simulation_id=simulation_id,
            round_num=round_num,
        )


class FakeJudge:
    """Returns a deterministic per-dimension score."""

    def __init__(self) -> None:
        self.score_calls: list[dict] = []

    async def score(
        self,
        round_num: int,
        pressure_events: list[PressureEvent],
        adversary_action: ActionEvent,
        defender_actions: list[ActionEvent],
    ) -> dict:
        self.score_calls.append(
            {
                "round": round_num,
                "n_pressure": len(pressure_events),
                "adversary_role": adversary_action.role,
                "n_defender": len(defender_actions),
            }
        )
        return {
            "round": round_num,
            "containment": 0.6,
            "communication": 0.7,
            "decision_quality": 0.55,
        }


@pytest.fixture
def ir_lead():
    async def fake_strategy(env, round_num, simulation_id):
        return ("incident-war-room", "send_message", {
            "content": "Standing up the war room. SOC + Infra, dial in.",
            "channel": "incident-war-room",
        })

    return IRLeadPersona(strategy=fake_strategy)


class TestRoundLifecycle:
    @pytest.mark.asyncio
    async def test_single_round_runs_pressure_then_adversary_then_defender_then_judge(
        self, ir_lead
    ):
        env = FakeEnv()
        pressure = FakePressure()
        adversary = FakeAdversary()
        judge = FakeJudge()

        orch = Orchestrator(
            env=env,
            pressure=pressure,
            adversary=adversary,
            defenders=[ir_lead],
            judge=judge,
            simulation_id="sim-w1-smoke",
        )

        report = await orch.run_round(1)

        # Phases ran in order
        assert report.phases == ["pressure", "adversary", "defender", "judge"]

        # Pressure tick happened with round 1
        assert pressure.tick_calls == [1]
        assert len(report.pressure_events) == 1
        assert report.pressure_events[0].kind == "severity_changed"

        # Adversary acted before defender
        assert adversary.act_calls == [1]
        assert env.calls[0]["role"] == "attacker"
        assert env.calls[1]["role"] == "defender"

        # Defender produced one action via IR Lead
        assert len(report.defender_actions) == 1
        assert report.defender_actions[0].agent == "Marcus Thorne"
        assert report.defender_actions[0].world == "incident-war-room"

        # Judge saw all the round artifacts
        assert judge.score_calls[0]["round"] == 1
        assert judge.score_calls[0]["adversary_role"] == "attacker"
        assert judge.score_calls[0]["n_defender"] == 1
        assert report.judge_score["containment"] == 0.6

    @pytest.mark.asyncio
    async def test_run_round_is_pure_per_round_no_state_leak(self, ir_lead):
        env = FakeEnv()
        orch = Orchestrator(
            env=env,
            pressure=FakePressure(),
            adversary=FakeAdversary(),
            defenders=[ir_lead],
            judge=FakeJudge(),
            simulation_id="sim-w1-smoke-2",
        )

        r1 = await orch.run_round(1)
        r2 = await orch.run_round(2)

        assert r1.round == 1 and r2.round == 2
        assert all(c["round_num"] in (1, 2) for c in env.calls)
        # Adversary + defender => 2 calls per round = 4 total
        assert len(env.calls) == 4
