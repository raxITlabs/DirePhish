"""Thin DirePhish wrapper around ``crucible.pressure.PressureEngine``.

Crucible's ``PressureEngine`` already owns the round-by-round semantics
(countdown decrement, severity transitions, scripted-trigger flush). This
wrapper exists to:

1. Give the orchestrator a stable name in the ADK module tree
   (``adk.agents.pressure_engine``) so imports stay local to DirePhish.
2. Decouple the construction signature from crucible's evolving API —
   if crucible refactors its config shape, this is the one place
   DirePhish edits.
3. Provide the integration seam for a future ``BaseAgent`` subclass
   wiring (W2+) without rewriting tests.

The ADK ``BaseAgent`` subclass is **deliberately not introduced yet**.
The W1 orchestrator smoke (slice 6) wires this wrapper directly; the
``BaseAgent`` lift comes when we need ADK callbacks on pressure events.
"""

from __future__ import annotations

from typing import Iterable

from crucible.config import PressureConfig
from crucible.events import PressureEvent
from crucible.pressure import PressureEngine


class PressureEngineAgent:
    """Sync facade over ``crucible.pressure.PressureEngine``.

    The orchestrator calls ``tick(round_num)`` once per round before the
    adversary phase, threads emitted events into the agent context, and
    optionally calls ``trigger(name)`` from judge / inject hooks.
    """

    def __init__(
        self,
        configs: Iterable[PressureConfig],
        hours_per_round: float = 1.0,
    ) -> None:
        self._engine = PressureEngine(
            configs=list(configs),
            hours_per_round=hours_per_round,
        )

    def tick(self, round_num: int) -> list[PressureEvent]:
        """Advance the engine by one round; return any events fired."""
        return self._engine.tick_events(round_num)

    def trigger(self, event_name: str) -> None:
        """Buffer a scripted trigger; flushes on the next ``tick``."""
        self._engine.trigger(event_name)
