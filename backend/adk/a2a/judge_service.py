"""FastAPI A2A service for the ContainmentJudge.

Run standalone:
    cd backend && uvicorn adk.a2a.judge_service:app --port 8003

The orchestrator hits this when A2A_JUDGE_URL is set; otherwise the
judge runs in-process (faster, no extra hop).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import FastAPI

logger = logging.getLogger("direphish.adk.a2a.judge")

_CARD_PATH = Path(__file__).resolve().parent / "judge_agent_card.json"


async def _invoke_judge_async(payload: dict) -> dict:
    """Run the Judge LlmAgent via InMemoryRunner; return parsed JSON score."""
    import asyncio
    from google.adk.runners import InMemoryRunner
    from google.genai import types as gtypes

    from adk.agents.personas import make_containment_judge
    from adk.agents.personas.containment_judge import parse_judge_output
    from adk.models import init_models

    init_models()
    judge = make_containment_judge()
    runner = InMemoryRunner(agent=judge, app_name="judge-a2a")
    session = await runner.session_service.create_session(
        app_name="judge-a2a", user_id="a2a",
        state={"round_num": payload.get("round", 0), "simulation_id": "a2a"},
    )

    prompt = (
        f"Round {payload.get('round')} score this:\n"
        f"pressure={json.dumps(payload.get('pressure_events', []))[:1500]}\n"
        f"adversary={json.dumps(payload.get('adversary_action'))[:1500]}\n"
        f"defenders={json.dumps(payload.get('defender_actions', []))[:3000]}"
    )

    texts: list[str] = []
    async for event in runner.run_async(
        user_id="a2a", session_id=session.id,
        new_message=gtypes.Content(role="user", parts=[gtypes.Part(text=prompt)]),
    ):
        if event.content and event.content.parts:
            for p in event.content.parts:
                if getattr(p, "text", None):
                    texts.append(p.text)

    for t in reversed(texts):
        parsed = parse_judge_output(t)
        if parsed and "containment" in parsed:
            return parsed

    return {
        "containment": 0.0, "evidence": 0.0,
        "communication": 0.0, "business_impact": 0.0,
        "rationale": "parse_failed",
    }


def _invoke_judge(payload: dict) -> dict:
    """Synchronous wrapper around the async judge invocation.

    Test code monkeypatches this symbol directly.
    """
    import asyncio
    return asyncio.run(_invoke_judge_async(payload))


def create_app() -> FastAPI:
    app = FastAPI(title="DirePhish ContainmentJudge A2A")
    card = json.loads(_CARD_PATH.read_text())

    @app.get("/.well-known/agent.json")
    def agent_card() -> dict[str, Any]:
        return card

    @app.post("/a2a/score_round")
    def score_round(body: dict[str, Any]) -> dict[str, Any]:
        return _invoke_judge(body)

    return app


app = create_app()
