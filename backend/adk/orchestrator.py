"""Round-driver orchestrator — ``BaseAgent`` over a ``SequentialAgent``.

Each call to ``run_round`` walks four phases in fixed order:

1. **pressure** — pressure engine tick
2. **adversary** — adversary persona acts
3. **defender** — every defender persona acts (in parallel via
   ``ParallelAgent`` when there's more than one)
4. **judge** — score the round

The four sub-agents are wired into a ``SequentialAgent`` and the
orchestrator itself is an ADK ``BaseAgent`` so the whole tree is
introspectable by ``adk web``, Vertex AI Agent Engine, and the eval
harness in W3.

Public API is preserved from W1:

- ``Orchestrator(env=, pressure=, adversary=, defenders=, judge=,
  simulation_id=)``.
- ``await orch.run_round(round_num) -> RoundReport``.

Plain-class W1 collaborators (``FakePressure``, ``FakeAdversary``,
``FakeJudge``, ``IRLeadPersona(strategy=...)``) are auto-wrapped into
adapter ``BaseAgent`` instances. Adapters hold their inner collaborator
and the shared ``env`` directly (NOT via session state) — ADK's
``InMemorySessionService`` deepcopies state on create/get, which would
break the test fakes' identity-tracking. Phase results are captured on
the adapter via ``PrivateAttr`` and harvested by the orchestrator after
the Runner finishes.

Once W2 day 4-5 lands real ``LlmAgent`` adversary + judge and the test
fixtures migrate to ``BaseAgent``, the adapter shims here can be deleted.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from google.adk.agents import BaseAgent, ParallelAgent, SequentialAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.agents.run_config import RunConfig
from google.adk.events import Event
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import ConfigDict, PrivateAttr

from crucible.events import ActionEvent, PressureEvent


# ---------------------------------------------------------------------------
# Protocols — describe the surface we accept from W1 plain-class fakes.
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# RoundReport — public output shape, unchanged from W1.
# ---------------------------------------------------------------------------


@dataclass
class RoundReport:
    round: int
    phases: list[str] = field(default_factory=list)
    pressure_events: list[PressureEvent] = field(default_factory=list)
    adversary_action: ActionEvent | None = None
    defender_actions: list[ActionEvent] = field(default_factory=list)
    judge_score: dict = field(default_factory=dict)


# Only ``round_num`` and ``simulation_id`` live in session state.
# Everything else flows through adapter instance attrs.
_K_ROUND = "round_num"
_K_SIM = "simulation_id"


# ---------------------------------------------------------------------------
# Adapter BaseAgents — wrap W1 plain-class collaborators.
# ---------------------------------------------------------------------------


class _PressureAdapter(BaseAgent):
    """Adapter for a W1 plain-class pressure engine."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    inner: Any  # _PressureLike

    _events: list = PrivateAttr(default_factory=list)

    def __init__(self, *, inner: _PressureLike, name: str = "pressure") -> None:
        super().__init__(name=name, inner=inner)

    def reset(self) -> None:
        self._events = []

    @property
    def events(self) -> list[PressureEvent]:
        return list(self._events)

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        round_num = int(ctx.session.state.get(_K_ROUND, 0))
        events = self.inner.tick(round_num)
        self._events = list(events)
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=f"pressure round={round_num} n={len(events)}")],
            ),
        )


class _ActorAdapter(BaseAgent):
    """Adapter for a W1 plain-class actor (sync ``name`` + async ``act``)."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    inner: Any  # _ActorLike
    env_ref: Any  # the shared CrucibleEnv (or FakeEnv) — held as Pydantic field
    sim_id: str

    _action: Optional[ActionEvent] = PrivateAttr(default=None)
    _actions: list[ActionEvent] = PrivateAttr(default_factory=list)

    def __init__(
        self,
        *,
        inner: _ActorLike,
        env: Any,
        simulation_id: str,
        name: Optional[str] = None,
    ) -> None:
        derived_name = name or _safe_name(inner.name)
        super().__init__(
            name=derived_name,
            inner=inner,
            env_ref=env,
            sim_id=simulation_id,
        )

    def reset(self) -> None:
        self._action = None
        self._actions = []

    @property
    def action(self) -> Optional[ActionEvent]:
        return self._action

    @property
    def actions(self) -> list[ActionEvent]:
        return list(self._actions)

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        round_num = int(ctx.session.state.get(_K_ROUND, 0))
        sim = str(ctx.session.state.get(_K_SIM, self.sim_id))
        action = await self.inner.act(self.env_ref, round_num, sim)
        self._action = action
        self._actions.append(action)
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        text=f"actor={self.name} round={round_num} world={action.world}"
                    )
                ],
            ),
        )


class _DefenderTeamAdapter(BaseAgent):
    """ParallelAgent-like wrapper over multiple ``_ActorAdapter`` defenders.

    Used in tests with deterministic strategy IR Leads. Production uses
    ``ParallelAgent`` directly over real ``LlmAgent`` defenders.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    members: list[_ActorAdapter]

    def __init__(self, *, members: list[_ActorAdapter]) -> None:
        super().__init__(
            name="defender_team",
            members=members,
            sub_agents=list(members),
        )

    def reset(self) -> None:
        for m in self.members:
            m.reset()

    @property
    def actions(self) -> list[ActionEvent]:
        out: list[ActionEvent] = []
        for m in self.members:
            if m.action is not None:
                out.append(m.action)
        return out

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        # Sequential for tests (preserves env-call ordering) — real
        # production swaps to a ParallelAgent that runs concurrently.
        for member in self.members:
            async for event in member.run_async(ctx):
                yield event


class _JudgeAdapter(BaseAgent):
    """Adapter for a W1 plain-class judge.

    Reads phase outputs from the upstream sub-agents and calls
    ``inner.score``. Sources phase data via dispatch:

    - Wrapped W1 fakes (``_PressureAdapter`` / ``_ActorAdapter``) →
      read directly from their PrivateAttr captures.
    - Real ``BaseAgent`` collaborators (``PressureEngineAgent``,
      ``LlmAgent``) → read from session state or fall back to empty.
      Full state-event harvesting for real LlmAgent defenders is
      W3 work; for W2 day 1-3 the judge sees an empty defender list
      when defenders are real, which the fake judge handles fine.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    inner: Any  # _JudgeLike
    pressure_source: BaseAgent
    adversary_source: BaseAgent
    defender_source: BaseAgent

    _score: dict = PrivateAttr(default_factory=dict)

    def __init__(
        self,
        *,
        inner: _JudgeLike,
        pressure_source: BaseAgent,
        adversary_source: BaseAgent,
        defender_source: BaseAgent,
        name: str = "judge",
    ) -> None:
        super().__init__(
            name=name,
            inner=inner,
            pressure_source=pressure_source,
            adversary_source=adversary_source,
            defender_source=defender_source,
        )

    def reset(self) -> None:
        self._score = {}

    @property
    def score(self) -> dict:
        return dict(self._score)

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        round_num = int(ctx.session.state.get(_K_ROUND, 0))
        score = await self.inner.score(
            round_num=round_num,
            pressure_events=_extract_pressure_events(
                self.pressure_source, ctx.session.state
            ),
            adversary_action=_extract_adversary_action(self.adversary_source),
            defender_actions=_extract_defender_actions(self.defender_source),
        )
        self._score = dict(score) if score else {}
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(text=f"judge round={round_num} score={self._score}")
                ],
            ),
        )


def _extract_pressure_events(
    source: BaseAgent, state: dict
) -> list[PressureEvent]:
    """Read pressure events from either an adapter or session state."""
    if isinstance(source, _PressureAdapter):
        return source.events
    # Real PressureEngineAgent writes to state["pressure_events"]
    events = state.get("pressure_events", [])
    return list(events) if events else []


def _extract_adversary_action(source: BaseAgent) -> Optional[ActionEvent]:
    if isinstance(source, _ActorAdapter):
        return source.action
    # Real LlmAgent adversary: action harvesting is W3 work; return None.
    return None


def _extract_defender_actions(source: BaseAgent) -> list[ActionEvent]:
    if isinstance(source, _DefenderTeamAdapter):
        return source.actions
    if isinstance(source, _ActorAdapter):
        return source.actions
    # Real LlmAgent defender or ParallelAgent: harvest from tool events
    # is W3 work; return empty so fake judge still runs.
    return []


def _safe_name(name: str) -> str:
    """Coerce a free-form persona name into a Python identifier.

    ``BaseAgent.name`` must be a valid Python identifier. ``"Marcus Thorne"``
    → ``"Marcus_Thorne"``.
    """
    cleaned = "".join(c if c.isalnum() else "_" for c in name)
    if cleaned and not cleaned[0].isalpha():
        cleaned = "agent_" + cleaned
    return cleaned or "actor"


# ---------------------------------------------------------------------------
# Orchestrator — public BaseAgent that drives one round.
# ---------------------------------------------------------------------------


class Orchestrator(BaseAgent):
    """Drive a simulation round across the four phases via SequentialAgent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    env_ref: Any = None
    simulation_id: str = "unknown"
    sequence: SequentialAgent
    pressure_adapter: BaseAgent
    adversary_adapter: BaseAgent
    defender_team_adapter: BaseAgent
    judge_adapter: BaseAgent

    def __init__(
        self,
        *,
        env: Any,
        pressure: _PressureLike | BaseAgent,
        adversary: _ActorLike | BaseAgent,
        defenders: list[_ActorLike] | list[BaseAgent],
        judge: _JudgeLike | BaseAgent,
        simulation_id: str,
        name: str = "orchestrator",
        **kwargs,
    ) -> None:
        pressure_adapter = _ensure_pressure_agent(pressure)
        adversary_adapter = _ensure_actor_agent(adversary, env, simulation_id)
        defender_agents = [
            _ensure_actor_agent(d, env, simulation_id) for d in defenders
        ]
        if len(defender_agents) == 1:
            defender_team_adapter = defender_agents[0]
        elif all(isinstance(d, _ActorAdapter) for d in defender_agents):
            defender_team_adapter = _DefenderTeamAdapter(members=defender_agents)
        else:
            defender_team_adapter = ParallelAgent(
                name="defender_team",
                sub_agents=defender_agents,
            )

        judge_adapter = _ensure_judge_agent(
            judge,
            pressure_source=pressure_adapter,
            adversary_source=adversary_adapter,
            defender_source=defender_team_adapter,
        )

        sequence = SequentialAgent(
            name="round_sequence",
            sub_agents=[
                pressure_adapter,
                adversary_adapter,
                defender_team_adapter,
                judge_adapter,
            ],
        )

        super().__init__(
            name=name,
            env_ref=env,
            simulation_id=simulation_id,
            sequence=sequence,
            pressure_adapter=pressure_adapter,
            adversary_adapter=adversary_adapter,
            defender_team_adapter=defender_team_adapter,
            judge_adapter=judge_adapter,
            sub_agents=[sequence],
            **kwargs,
        )

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        async for event in self.sequence.run_async(ctx):
            yield event

    async def run_round(self, round_num: int) -> RoundReport:
        """Drive one round; return the typed RoundReport."""
        # Reset adapter captures so multi-round runs don't leak state.
        for adapter in (
            self.pressure_adapter,
            self.adversary_adapter,
            self.defender_team_adapter,
            self.judge_adapter,
        ):
            reset = getattr(adapter, "reset", None)
            if callable(reset):
                reset()

        runner = InMemoryRunner(agent=self, app_name="direphish-round")
        session = await runner.session_service.create_session(
            app_name="direphish-round",
            user_id="orchestrator",
            state={_K_ROUND: round_num, _K_SIM: self.simulation_id},
        )
        # Embed sim_id + round_num verbatim so personas pass them
        # unchanged into tool calls (their instructions tell them to
        # use exactly these values).
        new_message = types.Content(
            role="user",
            parts=[
                types.Part(
                    text=(
                        f"Round {round_num} starting. "
                        f"simulation_id={self.simulation_id}, "
                        f"round_num={round_num}. "
                        "Make exactly one tool call."
                    )
                )
            ],
        )
        # Cap total Gemini calls across the round. Each persona ideally
        # does ~2 calls (emit tool_call → see tool result → final text).
        # 7 sub-agents × 3 = 21 budget; round to 25 for slack.
        # Without this cap, LlmAgents can loop on tools indefinitely.
        run_config = RunConfig(max_llm_calls=25)

        async for _event in runner.run_async(
            user_id="orchestrator",
            session_id=session.id,
            new_message=new_message,
            run_config=run_config,
        ):
            pass

        return RoundReport(
            round=round_num,
            phases=["pressure", "adversary", "defender", "judge"],
            pressure_events=_get_pressure_events(self.pressure_adapter),
            adversary_action=_get_adversary_action(self.adversary_adapter),
            defender_actions=_get_defender_actions(self.defender_team_adapter),
            judge_score=_get_judge_score(self.judge_adapter),
        )


# ---------------------------------------------------------------------------
# Adapter coercion + result accessors. Real BaseAgent collaborators (from
# W2 day 4+) won't expose the private capture attrs, so production code
# falls back to session-state-based capture in W3.
# ---------------------------------------------------------------------------


def _ensure_pressure_agent(p: _PressureLike | BaseAgent) -> BaseAgent:
    if isinstance(p, _PressureAdapter):
        return p
    if isinstance(p, BaseAgent):
        return p
    return _PressureAdapter(inner=p)


def _ensure_actor_agent(
    a: _ActorLike | BaseAgent, env: Any, simulation_id: str
) -> BaseAgent:
    if isinstance(a, _ActorAdapter):
        return a
    if isinstance(a, BaseAgent):
        return a
    return _ActorAdapter(inner=a, env=env, simulation_id=simulation_id)


def _ensure_judge_agent(
    j: _JudgeLike | BaseAgent,
    *,
    pressure_source: BaseAgent,
    adversary_source: BaseAgent,
    defender_source: BaseAgent,
) -> BaseAgent:
    if isinstance(j, BaseAgent):
        return j
    return _JudgeAdapter(
        inner=j,
        pressure_source=pressure_source,
        adversary_source=adversary_source,
        defender_source=defender_source,
    )


def _get_pressure_events(adapter: BaseAgent) -> list[PressureEvent]:
    if isinstance(adapter, _PressureAdapter):
        return adapter.events
    # Real PressureEngineAgent exposes last_events as a property.
    last_events = getattr(adapter, "last_events", None)
    if last_events is not None:
        return list(last_events)
    return []


def _get_adversary_action(adapter: BaseAgent) -> Optional[ActionEvent]:
    if isinstance(adapter, _ActorAdapter):
        return adapter.action
    return None


def _get_defender_actions(adapter: BaseAgent) -> list[ActionEvent]:
    if isinstance(adapter, _DefenderTeamAdapter):
        return adapter.actions
    if isinstance(adapter, _ActorAdapter):
        return adapter.actions
    return []


def _get_judge_score(adapter: BaseAgent) -> dict:
    if isinstance(adapter, _JudgeAdapter):
        return adapter.score
    return {}
