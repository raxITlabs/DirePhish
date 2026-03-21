"""Tests for Crucible API endpoints using the Flask test client."""

import json
from unittest.mock import patch

from app.services import project_manager


class TestGetScenarios:
    def test_returns_404_when_no_analysis(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path / "projects")
        (tmp_path / "projects").mkdir(exist_ok=True)

        proj = project_manager.create_project("https://example.com")
        pid = proj["project_id"]

        resp = client.get(f"/api/crucible/projects/{pid}/scenarios")
        assert resp.status_code == 404


class TestGenerateConfigs:
    def test_returns_400_without_scenario_ids(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path / "projects")
        (tmp_path / "projects").mkdir(exist_ok=True)

        proj = project_manager.create_project("https://example.com")
        pid = proj["project_id"]

        resp = client.post(
            f"/api/crucible/projects/{pid}/generate-configs",
            json={"no_ids": True},
        )
        assert resp.status_code == 400

    def test_returns_404_for_nonexistent_project(self, client):
        resp = client.post(
            "/api/crucible/projects/nonexistent/generate-configs",
            json={"scenario_ids": ["s1"]},
        )
        assert resp.status_code == 404


class TestGetConfigs:
    def test_returns_empty_list_when_no_configs(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path / "projects")
        (tmp_path / "projects").mkdir(exist_ok=True)

        proj = project_manager.create_project("https://example.com")
        pid = proj["project_id"]

        resp = client.get(f"/api/crucible/projects/{pid}/configs")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"] == []


class TestAnalyzeThreats:
    @patch("app.services.threat_analyzer.run_threat_analysis")
    def test_returns_404_for_nonexistent_project(self, mock_ta, client):
        resp = client.post("/api/crucible/projects/nonexistent/analyze-threats")
        assert resp.status_code == 404
        mock_ta.assert_not_called()


class TestComparativeReport:
    def test_returns_generating_status_when_no_report(self, client):
        resp = client.get("/api/crucible/projects/nonexistent/comparative-report")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"]["status"] == "generating"
