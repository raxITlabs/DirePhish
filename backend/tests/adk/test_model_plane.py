"""W1 slice 1: model plane resolution + Vertex env guard.

These tests pin three behaviours of ``backend.adk.models``:

1. After ``init_models()`` runs, every Claude model string used by the
   simulation resolves through ``LLMRegistry`` to the ``Claude`` class.
2. Every Gemini model string resolves to the ``Gemini`` class.
3. ``init_models()`` raises if ``GOOGLE_GENAI_USE_VERTEXAI`` is not
   ``"TRUE"`` — accidental ADC fall-through is a hard error, not a
   silent downgrade.

Hermetic: no real Vertex calls. Live smoke lives under
``backend/tests/adk/local/test_vertex_live.py``.
"""

import pytest

from google.adk.models.anthropic_llm import Claude
from google.adk.models.google_llm import Gemini
from google.adk.models.registry import LLMRegistry

from adk import models


class TestVertexResolution:
    def test_claude_string_resolves_via_register(self, vertex_env):
        models.init_models()
        for model_name in models.CLAUDE_MODELS.values():
            resolved = LLMRegistry.resolve(model_name)
            assert resolved is Claude, (
                f"{model_name!r} resolved to {resolved!r}, expected Claude"
            )

    def test_gemini_string_resolves_native(self, vertex_env):
        models.init_models()
        for model_name in models.GEMINI_MODELS.values():
            resolved = LLMRegistry.resolve(model_name)
            assert resolved is Gemini, (
                f"{model_name!r} resolved to {resolved!r}, expected Gemini"
            )

    def test_env_requires_vertex_flag(self, vertex_env_missing):
        with pytest.raises(RuntimeError, match="GOOGLE_GENAI_USE_VERTEXAI"):
            models.init_models()

    def test_env_rejects_non_true_value(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_GENAI_USE_VERTEXAI", "false")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "p")
        monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "us-east5")
        with pytest.raises(RuntimeError, match="GOOGLE_GENAI_USE_VERTEXAI"):
            models.init_models()

    def test_env_requires_project_and_location(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
        monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
        monkeypatch.delenv("GOOGLE_CLOUD_LOCATION", raising=False)
        with pytest.raises(RuntimeError, match="GOOGLE_CLOUD_PROJECT"):
            models.init_models()

    def test_init_models_is_idempotent(self, vertex_env):
        models.init_models()
        models.init_models()
        resolved = LLMRegistry.resolve(models.CLAUDE_MODELS["sonnet"])
        assert resolved is Claude
