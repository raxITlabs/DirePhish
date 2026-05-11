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
# personas, and judge. Every entry resolves from .env at import time:
#
#   Gemini:
#     GEMINI_PRO_MODEL_NAME       (per-tier override)
#     GEMINI_FLASH_MODEL_NAME     (per-tier override)
#     LLM_MODEL_NAME              (one-model-everywhere global override)
#
#   Claude (via Vertex Model Garden):
#     CLAUDE_SONNET_MODEL_NAME / CLAUDE_OPUS_MODEL_NAME /
#     CLAUDE_HAIKU_MODEL_NAME     (per-tier override)
#     LLM_MODEL_NAME does NOT override Claude — global is Gemini-only.
#
# Defaults are the current Vertex Model Garden releases as of 2026-05.
# Note: Vertex IDs differ slightly from AI Studio IDs — e.g. on Vertex
# the flash-lite is GA ('gemini-3.1-flash-lite', no preview suffix).
# gemini-3-pro-preview was retired 2026-03-26 → use gemini-3.1-pro-preview.
# Bump in .env when newer IDs land, no code change needed.
_DEFAULT_GEMINI_PRO = "gemini-3.1-pro-preview"
_DEFAULT_GEMINI_FLASH = "gemini-3.1-flash-lite"
_DEFAULT_CLAUDE_SONNET = "claude-sonnet-4-5"
_DEFAULT_CLAUDE_OPUS = "claude-opus-4-1"
_DEFAULT_CLAUDE_HAIKU = "claude-haiku-4-5"


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


_GLOBAL = _env("LLM_MODEL_NAME")

GEMINI_MODELS: dict[str, str] = {
    "pro": _env("GEMINI_PRO_MODEL_NAME") or _GLOBAL or _DEFAULT_GEMINI_PRO,
    "flash": _env("GEMINI_FLASH_MODEL_NAME") or _GLOBAL or _DEFAULT_GEMINI_FLASH,
}

CLAUDE_MODELS: dict[str, str] = {
    "sonnet": _env("CLAUDE_SONNET_MODEL_NAME") or _DEFAULT_CLAUDE_SONNET,
    "opus": _env("CLAUDE_OPUS_MODEL_NAME") or _DEFAULT_CLAUDE_OPUS,
    "haiku": _env("CLAUDE_HAIKU_MODEL_NAME") or _DEFAULT_CLAUDE_HAIKU,
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
