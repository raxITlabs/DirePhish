"""IR Lead defender persona (Marcus Thorne).

The IR Lead leads incident-response operations — runs the war room,
coordinates SOC + Infra, and decides on containment escalation. In
W1 this is a thin wrapper around a pluggable ``strategy`` callable
so the orchestrator round-lifecycle test can drive the persona
without spinning up an ``LlmAgent``. W2 promotes the body to a real
``LlmAgent`` with persona prompts, tools, and a ``before_tool_callback``
permission check; the public ``act()`` signature stays stable.
"""

from __future__ import annotations

from typing import Awaitable, Callable, Protocol

from crucible.events import ActionEvent


class _EnvLike(Protocol):
    async def apply_action(
        self,
        actor: str,
        role: str,
        world: str,
        action: str,
        args: dict,
        simulation_id: str,
        round_num: int,
    ) -> ActionEvent: ...


class IRLeadPersona:
    """A defender persona that picks one action per round.

    Construction takes a ``strategy``: an async callable that, given the
    environment + round + simulation context, returns the tuple
    ``(world, action, args)`` to dispatch. This keeps the persona
    testable without a real LLM. W2 swaps the strategy for an
    ``LlmAgent`` invocation.
    """

    name: str = "Marcus Thorne"
    slug: str = "infrastructure_lead"
    role: str = "defender"

    def __init__(
        self,
        strategy: Callable[
            [_EnvLike, int, str],
            Awaitable[tuple[str, str, dict]],
        ],
    ) -> None:
        self._strategy = strategy

    async def act(
        self,
        env: _EnvLike,
        round_num: int,
        simulation_id: str,
    ) -> ActionEvent:
        world, action, args = await self._strategy(env, round_num, simulation_id)
        return await env.apply_action(
            actor=self.name,
            role=self.role,
            world=world,
            action=action,
            args=args,
            simulation_id=simulation_id,
            round_num=round_num,
        )
