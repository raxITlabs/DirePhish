"""Shared fixtures for the MiroFish backend test suite."""

import pytest

from app import create_app


class TestConfig:
    """Minimal config for testing — no external services."""
    TESTING = True
    DEBUG = False
    SECRET_KEY = "test-secret"
    JSON_AS_ASCII = False
    LLM_API_KEY = "fake-key"
    LLM_BASE_URL = "http://localhost:9999"
    LLM_MODEL_NAME = "test-model"


@pytest.fixture()
def app(tmp_path, monkeypatch):
    """Create a Flask app with PROJECTS_DIR pointed at tmp_path."""
    # Redirect project_manager storage to tmp_path so tests don't touch real data
    monkeypatch.setattr(
        "app.services.project_manager.PROJECTS_DIR", tmp_path / "projects"
    )
    monkeypatch.setattr(
        "app.services.project_manager.UPLOADS_DIR", tmp_path
    )
    (tmp_path / "projects").mkdir()

    application = create_app(TestConfig)
    yield application


@pytest.fixture()
def client(app):
    """Flask test client."""
    return app.test_client()
