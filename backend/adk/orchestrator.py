"""Round-driver orchestrator.

The orchestrator is the seam between crucible's external-driver hooks
(``tick_pressure``, ``apply_action``, ``snapshot_world``) and the persona
agents that act inside the simulation. Each call to ``run_round`` walks
four phases in order:

1. **pressure** — ``PressureEngineAgent.tick(round_num)``
2. **adversary** — adversary persona ``act()``
3. **defender** — every defender persona ``act()`` (sequentially in W1;
   ``ParallelAgent``-fanout lands in W2)
4. **judge** — score the round across containment / communication /
   decision-quality dimensions

Returns a typed ``RoundReport`` that downstream sinks (Firestore writer,
SSE emitter, eval harness) consume. The orchestrator does **not** own
the JSONL writer — that's a sink concern wired by the caller.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Protocol

from crucible.events import ActionEvent, PressureEvent


class _PressureLike(Protocol):
    def tick(self, round_num: int) -> list[PressureEvent]: ...


class _ActorLike(Protocol):
    name: str
    role: str

    async def act(
        self, env: Any, round_num: int, simulation_id: str
    ) -> ActionEvent: ...


class _JudgeLike(Protocol):
    async def score(
        self,
        round_num: int,
        pressure_events: list[PressureEvent],
        adversary_action: ActionEvent,
        defender_actions: list[ActionEvent],
    ) -> dict: ...


@dataclass
class RoundReport:
    round: int
    phases: list[str] = field(default_factory=list)
    pressure_events: list[PressureEvent] = field(default_factory=list)
    adversary_action: ActionEvent | None = None
    defender_actions: list[ActionEvent] = field(default_factory=list)
    judge_score: dict = field(default_factory=dict)


class Orchestrator:
    """Drive a simulation round across pressure / adversary / defender / judge."""

    def __init__(
        self,
        env: Any,
        pressure: _PressureLike,
        adversary: _ActorLike,
        defenders: list[_ActorLike],
        judge: _JudgeLike,
        simulation_id: str,
    ) -> None:
        self._env = env
        self._pressure = pressure
        self._adversary = adversary
        self._defenders = list(defenders)
        self._judge = judge
        self._simulation_id = simulation_id

    async def run_round(self, round_num: int) -> RoundReport:
        report = RoundReport(round=round_num)

        # Phase 1: pressure
        report.pressure_events = self._pressure.tick(round_num)
        report.phases.append("pressure")

        # Phase 2: adversary
        report.adversary_action = await self._adversary.act(
            self._env, round_num, self._simulation_id
        )
        report.phases.append("adversary")

        # Phase 3: defenders (sequential in W1; parallel in W2)
        for defender in self._defenders:
            action = await defender.act(self._env, round_num, self._simulation_id)
            report.defender_actions.append(action)
        report.phases.append("defender")

        # Phase 4: judge
        report.judge_score = await self._judge.score(
            round_num=round_num,
            pressure_events=report.pressure_events,
            adversary_action=report.adversary_action,
            defender_actions=report.defender_actions,
        )
        report.phases.append("judge")

        return report
