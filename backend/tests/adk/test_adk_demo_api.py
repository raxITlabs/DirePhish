"""Cost dashboard endpoint — surfaces CostTracker.summary() per sim."""

import pytest


@pytest.fixture
def client():
    from app import create_app
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


def test_cost_dashboard_returns_empty_summary_for_unknown_sim(client):
    """Unknown sim_id → fresh tracker → empty summary still returns 200."""
    from app.utils.cost_tracker import reset_trackers
    reset_trackers()
    resp = client.get("/api/adk/cost-dashboard/never-seen-sim")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["sim_id"] == "never-seen-sim"
    assert data["total_cost_usd"] == 0.0


def test_cost_dashboard_returns_tracked_costs(client):
    from app.utils.cost_tracker import get_or_create_tracker, reset_trackers
    reset_trackers()
    tracker = get_or_create_tracker("dash-test")
    tracker.track_llm(
        phase="ir_lead", model="gemini-2.5-flash",
        input_tokens=100, output_tokens=20,
    )
    resp = client.get("/api/adk/cost-dashboard/dash-test")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["sim_id"] == "dash-test"
    assert data["total_cost_usd"] > 0
    assert "ir_lead" in data.get("phases", {})
