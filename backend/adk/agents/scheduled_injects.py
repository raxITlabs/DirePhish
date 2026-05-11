"""Fires scheduled events at their configured round."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types
from pydantic import ConfigDict, PrivateAttr


class InjectAgent(BaseAgent):
    """Fires scheduled simulation events at their configured round."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    events: list[dict[str, Any]]
    # _fired stores the full event dicts so tests can introspect by description key.
    # Uniqueness is enforced via the description string — duplicates are skipped.
    _fired: list[dict[str, Any]] = PrivateAttr(default_factory=list)
    _fired_descriptions: set[str] = PrivateAttr(default_factory=set)

    def __init__(self, *, events: list[dict[str, Any]], name: str = "scheduled_injects") -> None:
        super().__init__(name=name, events=list(events))

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        round_num = int(ctx.session.state.get("round_num", 0))
        to_fire = [
            e for e in self.events
            if e.get("round") == round_num and e.get("description") not in self._fired_descriptions
        ]
        if to_fire:
            active = list(ctx.session.state.get("active_injects", []))
            active.extend(to_fire)
            ctx.session.state["active_injects"] = active
            for e in to_fire:
                desc = e.get("description", "")
                self._fired_descriptions.add(desc)
                self._fired.append(e)
        yield Event(
            author=self.name,
            content=types.Content(role="model", parts=[
                types.Part(text=f"inject round={round_num} fired={len(to_fire)}")
            ]),
        )
