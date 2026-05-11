"""crucible_manager.launch_simulation spawns the new ADK runner."""
import subprocess


def test_launch_simulation_invokes_adk_runner(tmp_path, monkeypatch):
    from app.services.crucible_manager import launch_simulation
    captured = {}
    def _fake_popen(args, **kw):
        captured["args"] = args
        class _P: pid = 1234; returncode = 0
        return _P()
    monkeypatch.setattr(subprocess, "Popen", _fake_popen)
    monkeypatch.setattr("threading.Thread", lambda *a, **kw: type("T",(),{"start":lambda self:None})())
    sim_id = launch_simulation({"simulation_id": "swap-test", "total_rounds": 1})
    assert sim_id == "swap-test"
    cmd = " ".join(str(c) for c in captured["args"])
    assert "backend.adk.runner" in cmd or "adk.runner" in cmd, f"got: {cmd}"
