"""Test GET /api/crucible/simulations/<sim_id>/config endpoint."""
import json
from pathlib import Path


def test_get_sim_config(app, client, tmp_path):
    """Should return simulation config.json contents."""
    # Create a fake sim directory with config
    sim_dir = tmp_path / "simulations" / "test_sim_001"
    sim_dir.mkdir(parents=True, exist_ok=True)
    config = {"simulation_id": "test_sim_001", "total_rounds": 10, "agent_profiles": []}
    (sim_dir / "config.json").write_text(json.dumps(config))

    # Patch SIMULATIONS_DIR to point at tmp_path
    import app.api.crucible as crucible_mod
    original = crucible_mod.SIMULATIONS_DIR
    crucible_mod.SIMULATIONS_DIR = tmp_path / "simulations"

    try:
        response = client.get("/api/crucible/simulations/test_sim_001/config")
        assert response.status_code == 200
        data = response.get_json()
        assert data["data"]["simulation_id"] == "test_sim_001"
    finally:
        crucible_mod.SIMULATIONS_DIR = original


def test_get_sim_config_not_found(app, client, tmp_path):
    """Should return 404 for missing simulation."""
    import app.api.crucible as crucible_mod
    original = crucible_mod.SIMULATIONS_DIR
    crucible_mod.SIMULATIONS_DIR = tmp_path / "simulations"

    try:
        response = client.get("/api/crucible/simulations/nonexistent/config")
        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
    finally:
        crucible_mod.SIMULATIONS_DIR = original
