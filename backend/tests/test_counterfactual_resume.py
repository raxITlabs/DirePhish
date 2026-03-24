"""Test that forked simulations can be launched and run to completion."""
import json
import shutil
from pathlib import Path


def test_fork_creates_launchable_config():
    """fork_from_checkpoint should return a config that can be passed to launch_simulation."""
    from app.services.counterfactual_engine import CounterfactualEngine

    # Create mock sim directory with checkpoint
    sim_dir = Path("uploads/simulations/test_fork_sim")
    sim_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir = sim_dir / "checkpoints"
    checkpoint_dir.mkdir(exist_ok=True)

    config = {
        "simulation_id": "test_fork_sim",
        "total_rounds": 10,
        "agent_profiles": [{"name": "CISO", "role": "ciso", "persona": "Leader"}],
        "worlds": [{"type": "slack", "name": "ir-war-room"}],
        "pressures": [],
        "scheduled_events": [],
    }
    (sim_dir / "config.json").write_text(json.dumps(config))

    checkpoint = {
        "round": 3,
        "all_actions": [{"round": 1, "agent": "CISO", "action": "send_message"}],
        "world_history": {"ir-war-room": ["[CISO]: Isolate the DB"]},
        "active_events": [],
    }
    (checkpoint_dir / "round_3.json").write_text(json.dumps(checkpoint))

    try:
        # Fork
        fork_info = CounterfactualEngine.fork_from_checkpoint(
            "test_fork_sim", 3, {"type": "inject_event", "details": {"event": {"description": "Attacker pivots"}}}
        )

        assert fork_info["branch_id"] is not None
        assert fork_info["config"]["total_rounds"] == 10
        assert fork_info["fork_round"] == 3
        # The fork should have a resume_from_round field
        assert fork_info["config"].get("_resume_from_round") == 3
        # The fork should carry forward the checkpoint state
        assert fork_info.get("checkpoint") is not None
        assert fork_info["checkpoint"]["round"] == 3
    finally:
        # Cleanup
        shutil.rmtree(sim_dir, ignore_errors=True)


def test_fork_config_has_branch_meta():
    """Forked config should contain branch metadata."""
    from app.services.counterfactual_engine import CounterfactualEngine

    sim_dir = Path("uploads/simulations/test_fork_meta")
    sim_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir = sim_dir / "checkpoints"
    checkpoint_dir.mkdir(exist_ok=True)

    config = {
        "simulation_id": "test_fork_meta",
        "total_rounds": 8,
        "agent_profiles": [{"name": "SOC Lead", "role": "soc_lead"}],
        "worlds": [{"type": "slack", "name": "soc-channel"}],
    }
    (sim_dir / "config.json").write_text(json.dumps(config))

    checkpoint = {
        "round": 2,
        "all_actions": [],
        "world_history": {},
        "active_events": [],
    }
    (checkpoint_dir / "round_2.json").write_text(json.dumps(checkpoint))

    try:
        fork_info = CounterfactualEngine.fork_from_checkpoint(
            "test_fork_meta", 2, {"type": "agent_override", "details": {"agent_name": "SOC Lead", "action": "escalate"}}
        )

        meta = fork_info["config"].get("_branch_meta", {})
        assert meta["original_sim_id"] == "test_fork_meta"
        assert meta["fork_round"] == 2
        assert fork_info["config"]["_resume_from_round"] == 2
    finally:
        shutil.rmtree(sim_dir, ignore_errors=True)


def test_launch_fork_method_exists():
    """CounterfactualEngine should have a launch_fork static method."""
    from app.services.counterfactual_engine import CounterfactualEngine

    assert hasattr(CounterfactualEngine, "launch_fork")
    assert callable(CounterfactualEngine.launch_fork)
