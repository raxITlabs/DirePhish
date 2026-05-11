"""Deterministic pressure-tick agent — ADK ``BaseAgent`` subclass.

Wraps ``crucible.pressure.PressureEngine`` (the time/SLA/scripted-event
ticker) inside an ADK-native agent so it can slot into a round
``SequentialAgent`` next to LLM-backed personas. Per round it:

1. Reads ``round_num`` from ``ctx.session.state``.
2. Calls ``engine.tick_events(round_num)`` — pure, deterministic.
3. Writes the emitted events to ``ctx.session.state["pressure_events"]``.
4. Yields a single short summary ``Event`` so the run is observable
   in ADK traces and ``after_agent_callback`` hooks.

The legacy sync API (``tick()`` / ``trigger()``) is preserved because:
- The Flask smoke endpoint still drives rounds out-of-band of the ADK
  runner during R1–R6 wave; tests pin this surface (see
  ``backend/tests/adk/test_pressure_engine.py``).
- W3+ may want to ``trigger()`` from a tool callback without spinning
  up an invocation just to flush a scripted event.

This file is the first ``BaseAgent`` subclass DirePhish ships. The
Pydantic field declaration for ``engine`` is the pattern other custom
agents follow — ``BaseAgent`` sets ``extra='forbid'``, so every
non-Pydantic-typed dependency must be declared as a field with
``arbitrary_types_allowed`` (which BaseAgent already provides).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import ClassVar, Iterable, Optional

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from crucible.config import PressureConfig
from crucible.events import PressureEvent
from crucible.pressure import PressureEngine


class PressureEngineAgent(BaseAgent):
    """Crucible pressure ticker as a ``BaseAgent``.

    Construct with crucible ``PressureConfig`` instances:

    >>> agent = PressureEngineAgent(
    ...     configs=[deadline_config],
    ...     hours_per_round=1.0,
    ... )

    or with a pre-built engine (used by tests):

    >>> agent = PressureEngineAgent(engine=existing_engine)

    Inside a ``SequentialAgent`` the agent reads ``round_num`` from
    session state and writes the round's events back to state under
    ``pressure_events``.
    """

    # ---------------------------------------------------------------------
    # State-key constants — exported so the orchestrator + tests can
    # reference the same strings instead of hard-coding magic words.
    # ---------------------------------------------------------------------
    STATE_KEY_ROUND: ClassVar[str] = "round_num"
    STATE_KEY_EVENTS: ClassVar[str] = "pressure_events"

    # Pydantic field — declared so BaseAgent's extra='forbid' allows it.
    # arbitrary_types_allowed is inherited from BaseAgent.model_config.
    engine: PressureEngine

    def __init__(
        self,
        *,
        configs: Optional[Iterable[PressureConfig]] = None,
        hours_per_round: float = 1.0,
        engine: Optional[PressureEngine] = None,
        name: str = "pressure_engine",
        description: str = (
            "Deterministic pressure engine — emits countdown breaches, "
            "severity transitions, and scripted simulation events."
        ),
        **kwargs,
    ) -> None:
        if engine is None:
            if configs is None:
                raise TypeError(
                    "PressureEngineAgent requires either `configs` or `engine`"
                )
            engine = PressureEngine(
                configs=list(configs),
                hours_per_round=hours_per_round,
            )
        super().__init__(
            name=name,
            description=description,
            engine=engine,
            **kwargs,
        )

    # ------------------------------------------------------------------
    # ADK BaseAgent surface
    # ------------------------------------------------------------------
    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        """Tick once based on ``session.state[round_num]``.

        Writes ``pressure_events`` to state for downstream sub-agents
        (adversary, defenders, judge) to consult. Yields one trace event.
        """
        round_num = int(ctx.session.state.get(self.STATE_KEY_ROUND, 0))
        events = self.engine.tick_events(round_num)
        ctx.session.state[self.STATE_KEY_EVENTS] = events

        summary = (
            f"pressure tick round={round_num} events={len(events)}"
            + (
                " kinds=" + ",".join(sorted({e.kind for e in events}))
                if events
                else ""
            )
        )
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=summary)],
            ),
        )

    # ------------------------------------------------------------------
    # Legacy sync facade — preserved for smoke endpoint + existing tests
    # ------------------------------------------------------------------
    def tick(self, round_num: int) -> list[PressureEvent]:
        """Advance the engine by one round; return any events fired."""
        return self.engine.tick_events(round_num)

    def trigger(self, event_name: str) -> None:
        """Buffer a scripted trigger; flushes on the next ``tick``."""
        self.engine.trigger(event_name)
