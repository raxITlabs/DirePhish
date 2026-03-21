"""Tests for project_manager.py — file-based project lifecycle."""

import json
from unittest.mock import patch, MagicMock

from app.services import project_manager


class TestCreateProject:
    def test_creates_directory_and_project_json(self, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com", "context", ["a.pdf"])

        pid = proj["project_id"]
        assert pid.startswith("proj_")
        assert (tmp_path / pid / "project.json").exists()
        assert (tmp_path / pid / "files").is_dir()

        with open(tmp_path / pid / "project.json") as f:
            saved = json.load(f)
        assert saved["company_url"] == "https://example.com"
        assert saved["user_context"] == "context"
        assert saved["uploaded_files"] == ["a.pdf"]
        assert saved["status"] == "researching"
        assert saved["sim_ids"] == []
        assert "created_at" in saved


class TestUpdateProject:
    def test_updates_fields(self, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com")
        pid = proj["project_id"]

        with patch("app.services.project_manager.run_threat_analysis", create=True):
            updated = project_manager.update_project(pid, status="analyzing", progress=50)

        assert updated["status"] == "analyzing"
        assert updated["progress"] == 50

    @patch("app.services.threat_analyzer.run_threat_analysis")
    def test_auto_chain_fires_on_transition_to_research_complete(self, mock_ta, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com")
        pid = proj["project_id"]

        project_manager.update_project(pid, status="research_complete")
        mock_ta.assert_called_once_with(pid)

    @patch("app.services.threat_analyzer.run_threat_analysis")
    def test_auto_chain_does_not_fire_when_already_research_complete(self, mock_ta, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com")
        pid = proj["project_id"]

        # First transition fires the hook
        project_manager.update_project(pid, status="research_complete")
        mock_ta.reset_mock()

        # Second update with same status should NOT fire
        project_manager.update_project(pid, status="research_complete")
        mock_ta.assert_not_called()

    @patch("app.services.threat_analyzer.run_threat_analysis")
    def test_auto_chain_does_not_fire_for_other_statuses(self, mock_ta, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com")
        pid = proj["project_id"]

        project_manager.update_project(pid, status="generating_config")
        mock_ta.assert_not_called()


class TestThreatAnalysisRoundTrip:
    def test_save_and_get(self, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com")
        pid = proj["project_id"]

        analysis = {"threats": [{"name": "phishing"}], "scenarios": []}
        project_manager.save_threat_analysis(pid, analysis)
        loaded = project_manager.get_threat_analysis(pid)
        assert loaded == analysis

    def test_get_returns_none_when_missing(self, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com")
        assert project_manager.get_threat_analysis(proj["project_id"]) is None


class TestScenarioRoundTrip:
    def test_save_get_and_get_all(self, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com")
        pid = proj["project_id"]

        s1 = {"id": "scenario_0", "title": "Alpha"}
        s2 = {"id": "scenario_1", "title": "Beta"}
        project_manager.save_scenario(pid, "scenario_0", s1)
        project_manager.save_scenario(pid, "scenario_1", s2)

        assert project_manager.get_scenario(pid, "scenario_0") == s1
        assert project_manager.get_scenario(pid, "scenario_1") == s2

        all_scenarios = project_manager.get_all_scenarios(pid)
        assert len(all_scenarios) == 2

    def test_get_scenario_returns_none_when_missing(self, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com")
        assert project_manager.get_scenario(proj["project_id"], "nope") is None

    def test_get_all_scenarios_returns_empty_when_no_dir(self, tmp_path, monkeypatch):
        monkeypatch.setattr(project_manager, "PROJECTS_DIR", tmp_path)

        proj = project_manager.create_project("https://example.com")
        assert project_manager.get_all_scenarios(proj["project_id"]) == []
