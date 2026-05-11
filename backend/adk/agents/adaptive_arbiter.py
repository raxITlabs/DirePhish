"""Stagnation arbiter — may halt the sim early when defender actions plateau."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types
from pydantic import ConfigDict


def _stagnation_score(actions: list[dict[str, Any]]) -> float:
    """0.0 = perfectly diverse; 1.0 = all same action. Higher = more stagnant."""
    if not actions:
        return 0.0
    unique = len({a.get("action", "?") for a in actions})
    return 1.0 - (unique / len(actions))


class AdaptiveArbiterAgent(BaseAgent):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    min_rounds: int = 3
    stagnation_threshold: float = 0.7

    def __init__(self, *, min_rounds: int = 3, stagnation_threshold: float = 0.7,
                 name: str = "adaptive_arbiter") -> None:
        super().__init__(name=name, min_rounds=min_rounds,
                        stagnation_threshold=stagnation_threshold)

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        round_num = int(ctx.session.state.get("round_num", 0))
        actions = list(ctx.session.state.get("all_actions_recent", []))
        score = _stagnation_score(actions)
        decision = "continue"
        if round_num >= self.min_rounds and score >= self.stagnation_threshold:
            ctx.session.state["halt"] = True
            decision = "halt"
        yield Event(
            author=self.name,
            content=types.Content(role="model", parts=[
                types.Part(text=f"arbiter round={round_num} stagnation={score:.2f} decision={decision}")
            ]),
        )
