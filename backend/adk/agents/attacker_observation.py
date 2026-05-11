"""Builds the previous-round defender-action summary that the ThreatActor sees."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types
from pydantic import ConfigDict


class AttackerObservationAgent(BaseAgent):
    """Asymmetric-info observation: adversary sees last-round defender actions."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def __init__(self, *, name: str = "attacker_observation") -> None:
        super().__init__(name=name)

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        round_num = int(ctx.session.state.get("round_num", 0))
        if round_num <= 1:
            ctx.session.state["attacker_observation"] = ""
            yield Event(
                author=self.name,
                content=types.Content(role="model", parts=[types.Part(text="no prior round")]),
            )
            return

        prior: list[dict[str, Any]] = list(ctx.session.state.get("prior_defender_actions", []))
        bullets = [
            f"- {a.get('agent','?')} ({a.get('world','?')}): "
            f"{a.get('action','?')} {self._args_preview(a.get('args', {}))}"
            for a in prior
        ]
        observation = ("Defender activity last round:\n" + "\n".join(bullets)) if bullets else ""
        ctx.session.state["attacker_observation"] = observation
        yield Event(
            author=self.name,
            content=types.Content(role="model", parts=[
                types.Part(text=f"observation built round={round_num} entries={len(prior)}")
            ]),
        )

    @staticmethod
    def _args_preview(args: dict[str, Any]) -> str:
        for key in ("content", "subject", "message"):
            if key in args:
                return f'"{str(args[key])[:60]}"'
        return ""
