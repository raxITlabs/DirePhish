"""Shared fixtures for the ADK test suite.

Kept orthogonal to ``backend/tests/conftest.py`` (Flask ``app``/``client``
fixtures) — ADK code is not Flask-coupled. Only ``test_sse_bus.py`` will
re-use the Flask fixtures once the SSE endpoint lands.
"""

import os

import pytest


@pytest.fixture()
def vertex_env(monkeypatch):
    """Hermetic Vertex env. CI uses fake project / location strings; no ADC needed."""
    monkeypatch.setenv("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "ci-fake-project")
    monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "us-east5")
    yield


@pytest.fixture()
def vertex_env_missing(monkeypatch):
    """Strip every Vertex env var so the bootstrap guard can fail loudly."""
    for key in ("GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"):
        monkeypatch.delenv(key, raising=False)
    yield
