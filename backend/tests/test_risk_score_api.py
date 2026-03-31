"""Tests for risk score API endpoints — POST /compute, GET /risk-score,
GET /risk-score/compare.

Uses Flask test client with mocked MonteCarloEngine and FirestoreMemory.
Pure unit tests: fast, deterministic, no external dependencies.
"""
import json
import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

# Mock all google.* modules before any app import
_mock_google = MagicMock()
for mod_name in (
    "google",
    "google.cloud",
    "google.cloud.firestore",
    "google.cloud.firestore_v1",
    "google.cloud.firestore_v1.base_vector_query",
    "google.cloud.firestore_v1.vector",
    "google.genai",
):
    sys.modules.setdefault(mod_name, _mock_google)


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

SAMPLE_MC_AGG = {
    "iteration_count": 50,
    "outcome_distribution": {
        "contained_early": 20,
        "contained_late": 15,
        "not_contained": 10,
        "escalated": 5,
    },
    "containment_round_stats": {
        "mean": 8.5, "median": 8.0, "std": 3.2, "min": 3, "max": 18,
    },
    "decision_divergence_points": [],
    "agent_consistency": {"SOC Analyst": 0.82, "CISO": 0.75},
    "per_iteration_results": None,
}

SAMPLE_SCORE_DOC = {
    "project_id": "proj_test",
    "batch_id": "mc_batch_001",
    "composite_score": 62.5,
    "confidence_interval": {"lower": 55.0, "upper": 70.0},
    "dimensions": {
        "detection_speed": 50.0,
        "containment_effectiveness": 45.2,
        "communication_quality": 50.0,
        "decision_consistency": 78.5,
        "compliance_adherence": 50.0,
        "escalation_resistance": 90.0,
    },
    "confidence_flag": "high",
    "interpretation": {"tier": "moderate", "label": "Moderate", "description": "Functional but with notable weaknesses"},
    "fair_estimates": {
        "ale": 125000.0,
        "p10_loss": 37500.0,
        "p90_loss": 312500.0,
        "calibration_inputs": {},
    },
    "drivers": [],
}


# ---------------------------------------------------------------------------
# POST /projects/<project_id>/risk-score/compute
# ---------------------------------------------------------------------------

class TestComputeRiskScoreEndpoint:
    """Tests for the POST /compute endpoint."""

    def test_happy_path_returns_201(self, client, tmp_path):
        """POST /compute with valid MC batch returns 201 with score data."""
        mock_mc_cls = MagicMock()
        mock_mc_instance = MagicMock()
        mock_mc_instance.list_batches.return_value = [
            {"batch_id": "mc_batch_001", "status": "completed", "mode": "quick"},
        ]
        mock_mc_cls.return_value = mock_mc_instance

        mock_memory_cls = MagicMock()
        mock_memory_instance = MagicMock()
        mock_memory_instance.get_project_aggregates.return_value = [SAMPLE_MC_AGG]
        mock_memory_instance.store_risk_score.return_value = "score_doc_123"
        mock_memory_cls.return_value = mock_memory_instance

        with patch("app.services.monte_carlo_engine.MonteCarloEngine", mock_mc_cls), \
             patch("app.services.firestore_memory.FirestoreMemory", mock_memory_cls):
            resp = client.post(
                "/api/crucible/projects/proj_test/risk-score/compute",
                content_type="application/json",
                data=json.dumps({}),
            )

        assert resp.status_code == 201
        data = resp.get_json()["data"]
        assert "composite_score" in data
        assert "dimensions" in data
        assert "fair_estimates" in data
        assert data["score_id"] == "score_doc_123"

    def test_404_when_no_mc_batch(self, client):
        """POST /compute returns 404 when no MC batch exists."""
        mock_mc_cls = MagicMock()
        mock_mc_instance = MagicMock()
        mock_mc_instance.list_batches.return_value = []
        mock_mc_cls.return_value = mock_mc_instance

        with patch("app.services.monte_carlo_engine.MonteCarloEngine", mock_mc_cls):
            resp = client.post(
                "/api/crucible/projects/proj_test/risk-score/compute",
                content_type="application/json",
                data=json.dumps({}),
            )

        assert resp.status_code == 404
        assert "No Monte Carlo batch" in resp.get_json()["error"]


# ---------------------------------------------------------------------------
# GET /projects/<project_id>/risk-score
# ---------------------------------------------------------------------------

class TestGetRiskScoreEndpoint:
    """Tests for the GET /risk-score endpoint."""

    def test_returns_latest_score(self, client):
        """GET /risk-score returns the latest score for a project."""
        mock_memory_cls = MagicMock()
        mock_memory_instance = MagicMock()
        mock_memory_instance.get_risk_score.return_value = SAMPLE_SCORE_DOC
        mock_memory_cls.return_value = mock_memory_instance

        with patch("app.services.firestore_memory.FirestoreMemory", mock_memory_cls):
            resp = client.get("/api/crucible/projects/proj_test/risk-score")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["composite_score"] == 62.5
        assert data["project_id"] == "proj_test"

    def test_404_when_no_score_exists(self, client):
        """GET /risk-score returns 404 when no score exists."""
        mock_memory_cls = MagicMock()
        mock_memory_instance = MagicMock()
        mock_memory_instance.get_risk_score.return_value = None
        mock_memory_cls.return_value = mock_memory_instance

        with patch("app.services.firestore_memory.FirestoreMemory", mock_memory_cls):
            resp = client.get("/api/crucible/projects/proj_test/risk-score")

        assert resp.status_code == 404
        assert "No risk score" in resp.get_json()["error"]


# ---------------------------------------------------------------------------
# GET /projects/<project_id>/risk-score/compare
# ---------------------------------------------------------------------------

class TestCompareRiskScoresEndpoint:
    """Tests for the GET /risk-score/compare endpoint."""

    def test_happy_path_returns_delta(self, client):
        """GET /compare with valid baseline returns 200 with delta."""
        current = {**SAMPLE_SCORE_DOC, "composite_score": 70.0}
        baseline = {**SAMPLE_SCORE_DOC, "composite_score": 55.0}

        mock_memory_cls = MagicMock()
        mock_memory_instance = MagicMock()
        mock_memory_instance.get_risk_score.return_value = current
        mock_memory_instance.get_risk_score_by_id.return_value = baseline
        mock_memory_cls.return_value = mock_memory_instance

        with patch("app.services.firestore_memory.FirestoreMemory", mock_memory_cls):
            resp = client.get(
                "/api/crucible/projects/proj_test/risk-score/compare?baseline=score_old_001"
            )

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert "delta" in data
        assert data["delta"]["composite_score"] == 15.0

    def test_400_when_missing_baseline_param(self, client):
        """GET /compare without baseline query param returns 400."""
        resp = client.get("/api/crucible/projects/proj_test/risk-score/compare")

        assert resp.status_code == 400
        assert "Missing" in resp.get_json()["error"]

    def test_404_when_baseline_not_found(self, client):
        """GET /compare returns 404 when baseline score_id does not exist."""
        mock_memory_cls = MagicMock()
        mock_memory_instance = MagicMock()
        mock_memory_instance.get_risk_score.return_value = SAMPLE_SCORE_DOC
        mock_memory_instance.get_risk_score_by_id.return_value = None
        mock_memory_cls.return_value = mock_memory_instance

        with patch("app.services.firestore_memory.FirestoreMemory", mock_memory_cls):
            resp = client.get(
                "/api/crucible/projects/proj_test/risk-score/compare?baseline=nonexistent"
            )

        assert resp.status_code == 404
        assert "Baseline score not found" in resp.get_json()["error"]

    def test_404_when_no_current_score(self, client):
        """GET /compare returns 404 when no current score exists for project."""
        mock_memory_cls = MagicMock()
        mock_memory_instance = MagicMock()
        mock_memory_instance.get_risk_score.return_value = None
        mock_memory_instance.get_risk_score_by_id.return_value = SAMPLE_SCORE_DOC
        mock_memory_cls.return_value = mock_memory_instance

        with patch("app.services.firestore_memory.FirestoreMemory", mock_memory_cls):
            resp = client.get(
                "/api/crucible/projects/proj_test/risk-score/compare?baseline=score_old_001"
            )

        assert resp.status_code == 404
        assert "No current risk score" in resp.get_json()["error"]
