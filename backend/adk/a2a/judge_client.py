"""HTTP client wrapping the Judge A2A endpoint as a callable for the orchestrator.

Opt-in via A2A_JUDGE_URL env var. When unset, the orchestrator uses the
in-process judge (default). When set, scoring crosses the process
boundary to the A2A service — demo can flip this for the
"cross-process scoring" beat.
"""

from __future__ import annotations

import os
from typing import Any

import httpx


class JudgeA2aClient:
    """Mimics the in-process judge's score() interface but calls the A2A endpoint."""

    def __init__(self, *, url: str | None = None, timeout: float = 30.0) -> None:
        self.url = (url or os.environ.get("A2A_JUDGE_URL", "")).rstrip("/")
        self.timeout = timeout

    def is_configured(self) -> bool:
        return bool(self.url)

    async def score(
        self,
        round_num: int,
        pressure_events: list,
        adversary_action,
        defender_actions: list,
    ) -> dict[str, Any]:
        if not self.url:
            raise RuntimeError("A2A_JUDGE_URL not set")

        def _to_dict(x):
            if x is None:
                return None
            return x.model_dump() if hasattr(x, "model_dump") else x

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(
                f"{self.url}/a2a/score_round",
                json={
                    "round": round_num,
                    "pressure_events": [_to_dict(e) for e in pressure_events],
                    "adversary_action": _to_dict(adversary_action),
                    "defender_actions": [_to_dict(a) for a in defender_actions],
                },
            )
            r.raise_for_status()
            return r.json()
