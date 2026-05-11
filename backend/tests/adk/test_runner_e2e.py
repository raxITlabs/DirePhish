import json
import pytest


@pytest.mark.asyncio
async def test_runner_full_pipeline_fake_mode(tmp_path, monkeypatch):
    monkeypatch.setenv("DIREPHISH_FIRESTORE_ENABLED", "false")
    from adk.runner import AdkSimulationRunner
    from adk.orchestrator import RoundReport
    from crucible.events import ActionEvent

    cfg = {
        "simulation_id": "e2e-test", "project_id": "e2e-proj",
        "scenario": "ransomware", "total_rounds": 2, "hours_per_round": 1.0,
        "worlds": [{"name": "slack", "type": "slack"}], "pressures": [],
        "scheduled_events": [{"round": 2, "description": "Ransom note arrives"}],
    }
    out = tmp_path / "out"; out.mkdir()
    runner = AdkSimulationRunner(config=cfg, output_dir=out)

    class _StubOrch:
        async def run_round(self, n):
            ae = ActionEvent(
                round=n, timestamp="2026-05-11T00:00:00+00:00",
                simulation_id=cfg["simulation_id"], agent=f"agent_{n}",
                role="defender", world="slack", action="send_message",
                args={"channel": "war-room"}, result={"success": True},
            )
            return RoundReport(round=n, phases=["pressure","adversary","defender","judge"],
                              defender_actions=[ae])
    runner._orchestrator = _StubOrch()

    summary = await runner.run()
    assert summary["rounds_completed"] == 2
    assert (out / "actions.jsonl").exists()
    assert (out / "summary.json").exists()
    assert len((out / "actions.jsonl").read_text().strip().split("\n")) == 2
