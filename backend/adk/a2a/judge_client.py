"""HTTP client wrapping the Judge A2A endpoint as a callable for the orchestrator.

Opt-in via A2A_JUDGE_URL env var. When unset, the orchestrator uses the
in-process judge (default). When set, scoring crosses the process
boundary to the A2A service — demo can flip this for the
"cross-process scoring" beat.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("direphish.adk.a2a.client")


def _fetch_id_token(audience: str) -> str | None:
    """Mint a Google-signed OIDC ID token for a private Cloud Run callee.

    Uses the runtime service account via the metadata server (on Cloud Run) or
    ADC locally. Returns None if unavailable (e.g. no creds) — the caller then
    sends no Authorization header, which is correct for a local/public judge.
    """
    try:
        import google.auth.transport.requests
        from google.oauth2 import id_token

        return id_token.fetch_id_token(
            google.auth.transport.requests.Request(), audience
        )
    except Exception as exc:  # noqa: BLE001 - auth optional; private judge only
        logger.debug("OIDC token fetch skipped for %s: %s", audience, exc)
        return None


class JudgeA2aClient:
    """Mimics the in-process judge's score() interface but calls the A2A endpoint."""

    def __init__(self, *, url: str | None = None, timeout: float | None = None) -> None:
        self.url = (url or os.environ.get("A2A_JUDGE_URL", "")).rstrip("/")
        # Pro judge + Cloud Run cold start can exceed 30s; allow override via
        # A2A_JUDGE_TIMEOUT. Default 120s.
        if timeout is None:
            timeout = float(os.environ.get("A2A_JUDGE_TIMEOUT", "120"))
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

        # OIDC service-to-service auth for a private (auth-only) Cloud Run judge.
        headers = {}
        token = _fetch_id_token(self.url)
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(
                f"{self.url}/a2a/score_round",
                headers=headers,
                json={
                    "round": round_num,
                    "pressure_events": [_to_dict(e) for e in pressure_events],
                    "adversary_action": _to_dict(adversary_action),
                    "defender_actions": [_to_dict(a) for a in defender_actions],
                },
            )
            r.raise_for_status()
            return r.json()
