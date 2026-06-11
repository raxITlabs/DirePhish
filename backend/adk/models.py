"""Model-plane bootstrap for the ADK simulation.

Every model call in the simulation goes through Vertex AI Model Garden.
The default cast is **Gemini-only** (Anthropic / Claude on Vertex requires
a per-project partner-model enablement that may be unavailable). Claude
support is kept dormant: if the ``anthropic`` extra is installed and the
model is reachable it is registered, but a missing/unavailable Claude
*never* breaks a Gemini-only run — see ``init_models()``.

``init_models()`` raises if the Vertex env vars are missing or wrong,
instead of silently falling through to ADC. That guard keeps CI hermetic
and prevents accidental local-dev calls from charging the wrong project.
"""

from __future__ import annotations

import logging
import os

from google.adk.models.google_llm import Gemini  # noqa: F401  (registered by import)
from google.adk.models.registry import LLMRegistry

try:  # Claude is optional — Anthropic Model Garden may not be enabled on the project.
    from google.adk.models.anthropic_llm import Claude
except ImportError:  # pragma: no cover - only when the anthropic extra is absent
    Claude = None  # type: ignore[assignment]

logger = logging.getLogger("direphish.adk.models")

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
# Defaults are the current Vertex Model Garden releases as of 2026-06.
# - Pro:   gemini-3.1-pro-preview (gemini-3-pro-preview retired 2026-03-26).
#          Used by the adversary + judge (adversarial reasoning / score stability).
# - Flash: gemini-3.5-flash — the GA agentic workhorse; defenders do MCP
#          tool-calling and benefit most from it.
# Bump in .env when newer IDs land, no code change needed.
_DEFAULT_GEMINI_PRO = "gemini-3.1-pro-preview"
_DEFAULT_GEMINI_FLASH = "gemini-3.5-flash"
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
    """Validate Vertex env + (best-effort) register Claude. Idempotent.

    Gemini routing is the hard requirement. Claude registration is
    optional: if the ``anthropic`` extra is missing or registration fails,
    we log and continue so a Gemini-only run is never broken.

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

    if Claude is not None:
        try:
            LLMRegistry.register(Claude)
        except Exception as exc:  # noqa: BLE001 - never break a Gemini-only run
            logger.info("Claude registration skipped: %s", exc)
    else:
        logger.info("Claude unavailable (anthropic extra not installed); Gemini-only.")


__all__ = ["init_models", "CLAUDE_MODELS", "GEMINI_MODELS"]
