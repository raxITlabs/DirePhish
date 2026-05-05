"""Live Vertex AI smoke — opt-in only.

Skipped unless ``RUN_LIVE_VERTEX=1``. Excluded from CI by the
workflow's ``--ignore=tests/adk/local`` flag (and by the test's own
skip marker). Run locally with ADC + Vertex enabled to verify both
Gemini and Claude actually round-trip through the configured project.

Costs real money. Each test issues one short prompt to one model.
"""

from __future__ import annotations

import os

import pytest

from adk import models

RUN_LIVE = os.environ.get("RUN_LIVE_VERTEX") == "1"
pytestmark = pytest.mark.skipif(
    not RUN_LIVE,
    reason="Set RUN_LIVE_VERTEX=1 + valid ADC to enable Vertex live smoke.",
)


@pytest.fixture(scope="module")
def initialized_models():
    """One-time bootstrap; relies on real GOOGLE_GENAI_USE_VERTEXAI env."""
    models.init_models()


def _short_prompt() -> str:
    return "Reply with the single word: pong"


@pytest.mark.asyncio
async def test_gemini_pro_round_trip(initialized_models):
    from google.adk.models.google_llm import Gemini
    from google.adk.models.llm_request import LlmRequest
    from google.genai import types

    llm = Gemini(model=models.GEMINI_MODELS["pro"])
    req = LlmRequest(
        model=models.GEMINI_MODELS["pro"],
        contents=[types.Content(role="user", parts=[types.Part(text=_short_prompt())])],
        config=types.GenerateContentConfig(max_output_tokens=16),
    )
    saw_text = False
    async for resp in llm.generate_content_async(req):
        if resp.content and resp.content.parts:
            saw_text = saw_text or any(getattr(p, "text", None) for p in resp.content.parts)
    assert saw_text, "Gemini returned no text"


@pytest.mark.asyncio
async def test_claude_sonnet_round_trip(initialized_models):
    from google.adk.models.anthropic_llm import Claude
    from google.adk.models.llm_request import LlmRequest
    from google.genai import types

    llm = Claude(model=models.CLAUDE_MODELS["sonnet"])
    req = LlmRequest(
        model=models.CLAUDE_MODELS["sonnet"],
        contents=[types.Content(role="user", parts=[types.Part(text=_short_prompt())])],
        config=types.GenerateContentConfig(max_output_tokens=16),
    )
    saw_text = False
    async for resp in llm.generate_content_async(req):
        if resp.content and resp.content.parts:
            saw_text = saw_text or any(getattr(p, "text", None) for p in resp.content.parts)
    assert saw_text, "Claude returned no text"
