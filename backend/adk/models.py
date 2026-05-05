"""Model-plane bootstrap for the ADK migration.

Every model call in the simulation goes through Vertex AI Model Garden:
Gemini natively, Claude through ``LLMRegistry.register(Claude)``. ADK 1.32
auto-registers ``Claude`` on import of ``google.adk.models.anthropic_llm``,
so the ``register`` call here is defensive (idempotent) — its real value
is signalling intent and giving the W1 test slice something to pin.

``init_models()`` raises if Vertex env vars are missing or wrong, instead
of silently falling through to ADC. That guard keeps CI hermetic and
prevents accidental local-dev calls from charging the wrong project.
"""

from __future__ import annotations

import os

from google.adk.models.anthropic_llm import Claude
from google.adk.models.google_llm import Gemini  # noqa: F401  (registered by import)
from google.adk.models.registry import LLMRegistry

# Single source of truth for model strings used across the orchestrator,
# personas, and judge. Keep keys stable; bump values when Anthropic /
# Google ship newer Vertex IDs.
CLAUDE_MODELS: dict[str, str] = {
    "sonnet": "claude-sonnet-4-5",
    "opus": "claude-opus-4-1",
    "haiku": "claude-haiku-4-5",
}

GEMINI_MODELS: dict[str, str] = {
    "pro": "gemini-2.5-pro",
    "flash": "gemini-2.5-flash",
}


def init_models() -> None:
    """Validate Vertex env + register Claude. Idempotent.

    Raises:
        RuntimeError: ``GOOGLE_GENAI_USE_VERTEXAI`` is not ``"TRUE"`` or
            ``GOOGLE_CLOUD_PROJECT`` / ``GOOGLE_CLOUD_LOCATION`` are unset.
    """
    flag = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "")
    if flag != "TRUE":
        raise RuntimeError(
            "GOOGLE_GENAI_USE_VERTEXAI must be 'TRUE' to route ADK calls "
            f"through Vertex AI Model Garden (got {flag!r}). Refusing to "
            "fall through to ADC — set the env var explicitly."
        )

    for var in ("GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"):
        if not os.environ.get(var):
            raise RuntimeError(
                f"{var} must be set for Vertex AI routing. Did you forget "
                "to load .env, or to mint hermetic CI fakes?"
            )

    LLMRegistry.register(Claude)


__all__ = ["init_models", "CLAUDE_MODELS", "GEMINI_MODELS"]
