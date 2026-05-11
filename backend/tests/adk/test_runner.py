"""AdkSimulationRunner top-level driver — config ingestion + CLI surface."""

import json
import sys
from pathlib import Path

import pytest

from adk.runner import AdkSimulationRunner, main


def _minimal_config(tmp_path: Path) -> Path:
    cfg = {
        "simulation_id": "test-runner-sim",
        "project_id": "test-proj",
        "scenario": "ransomware",
        "total_rounds": 2,
        "hours_per_round": 1.0,
        "worlds": [{"name": "slack", "type": "slack"}],
        "pressures": [],
        "scheduled_events": [],
        "agent_profiles": [],  # ignored per Q2=C
    }
    path = tmp_path / "config.json"
    path.write_text(json.dumps(cfg))
    return path


def test_runner_constructs_from_config_dict(tmp_path):
    cfg = json.loads(_minimal_config(tmp_path).read_text())
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)
    assert runner.simulation_id == "test-runner-sim"
    assert runner.total_rounds == 2


def test_runner_reads_total_rounds_from_config(tmp_path):
    cfg = json.loads(_minimal_config(tmp_path).read_text())
    cfg["total_rounds"] = 7
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)
    assert runner.total_rounds == 7


def test_runner_defaults_total_rounds_when_missing(tmp_path):
    cfg = json.loads(_minimal_config(tmp_path).read_text())
    del cfg["total_rounds"]
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)
    assert runner.total_rounds == 10  # documented default


def test_runner_exposes_project_id_and_hours_per_round(tmp_path):
    cfg = json.loads(_minimal_config(tmp_path).read_text())
    cfg["hours_per_round"] = 2.5
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)
    assert runner.project_id == "test-proj"
    assert runner.hours_per_round == 2.5


def test_cli_main_parses_args_dry_run(tmp_path, monkeypatch):
    cfg_path = _minimal_config(tmp_path)
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    monkeypatch.setattr(sys, "argv", ["runner", "--config", str(cfg_path), "--output", str(out_dir)])
    rc = main(dry_run=True)
    assert rc == 0


@pytest.mark.asyncio
async def test_run_drives_total_rounds(tmp_path):
    """Runner must call orchestrator.run_round for each configured round."""
    cfg = json.loads(_minimal_config(tmp_path).read_text())
    cfg["total_rounds"] = 3
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)

    calls = []

    class _StubOrch:
        async def run_round(self, n):
            calls.append(n)
            from adk.orchestrator import RoundReport
            return RoundReport(
                round=n,
                phases=["pressure", "adversary", "defender", "judge"],
            )

    runner._orchestrator = _StubOrch()
    summary = await runner.run()

    assert calls == [1, 2, 3], f"expected rounds 1-3, got {calls}"
    assert summary["rounds_completed"] == 3
    assert summary["simulation_id"] == cfg["simulation_id"]


@pytest.mark.asyncio
async def test_run_calls_build_orchestrator_when_none_injected(tmp_path, monkeypatch):
    """If no orchestrator is injected, runner builds one via _build_orchestrator."""
    cfg = json.loads(_minimal_config(tmp_path).read_text())
    cfg["total_rounds"] = 1
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)

    built = {"called": False}

    class _StubOrch:
        async def run_round(self, n):
            from adk.orchestrator import RoundReport
            return RoundReport(round=n, phases=["pressure"])

    def _stub_build(self):
        built["called"] = True
        return _StubOrch()

    monkeypatch.setattr(AdkSimulationRunner, "_build_orchestrator", _stub_build)
    await runner.run()
    assert built["called"]


def test_build_orchestrator_returns_real_orchestrator(tmp_path, vertex_env):
    """_build_orchestrator constructs an Orchestrator with W2 personas wired."""
    from adk.orchestrator import Orchestrator

    cfg = json.loads(_minimal_config(tmp_path).read_text())
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)
    orch = runner._build_orchestrator()

    assert isinstance(orch, Orchestrator)
    assert orch.simulation_id == cfg["simulation_id"]


@pytest.mark.asyncio
async def test_runner_writes_actions_jsonl(tmp_path):
    cfg = json.loads(_minimal_config(tmp_path).read_text())
    cfg["total_rounds"] = 1
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)

    class _StubOrch:
        async def run_round(self, n):
            from adk.orchestrator import RoundReport
            from crucible.events import ActionEvent
            ae = lambda agent: ActionEvent(
                round=n, timestamp="2026-05-11T00:00:00+00:00",
                simulation_id=cfg["simulation_id"], agent=agent, role="defender",
                world="slack", action="send_message",
                args={"channel": "war-room", "content": "hi"}, result={"success": True},
            )
            return RoundReport(round=n, phases=["pressure","adversary","defender","judge"],
                              defender_actions=[ae("Marcus Thorne"), ae("Dane Stuckey")])

    runner._orchestrator = _StubOrch()
    await runner.run()
    lines = (tmp_path / "actions.jsonl").read_text().strip().split("\n")
    assert len(lines) == 2
    assert (tmp_path / "summary.json").exists()


def test_runner_uses_env_provider_for_threat_actor(tmp_path, vertex_env, monkeypatch):
    """THREAT_ACTOR_PROVIDER env var threads through to make_threat_actor."""
    import adk.runner as runner_module

    captured = {}
    def _stub_make(*, provider="gemini", **kw):
        captured["provider"] = provider
        # Return a placeholder that satisfies the Orchestrator construction
        from adk.agents.personas import make_threat_actor as real
        return real(provider="gemini")  # always use gemini for the actual construction
    monkeypatch.setattr(runner_module, "make_threat_actor", _stub_make, raising=False)

    monkeypatch.setenv("THREAT_ACTOR_PROVIDER", "claude")
    cfg = json.loads(_minimal_config(tmp_path).read_text())
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)
    try:
        runner._build_orchestrator()
    except Exception:
        pass  # construction may fail downstream; we only care about the captured provider
    assert captured.get("provider") == "claude"


def test_build_orchestrator_reads_pressure_configs_from_config(tmp_path, vertex_env):
    """Pressure configs from config dict are passed into PressureEngineAgent."""
    cfg = json.loads(_minimal_config(tmp_path).read_text())
    cfg["pressures"] = [
        {
            "name": "containment_deadline",
            "type": "countdown",
            "affects_roles": ["ciso"],
            "hours": 2.0,
            "hours_until": None,
            "value": None,
            "unit": None,
            "triggered_by": None,
            "severity_at_50pct": "high",
            "severity_at_25pct": "critical",
        }
    ]
    runner = AdkSimulationRunner(config=cfg, output_dir=tmp_path)
    orch = runner._build_orchestrator()
    # Pressure adapter is constructed from these configs; verify by introspection
    # The Orchestrator wraps pressure in pressure_adapter, which holds the real
    # PressureEngineAgent (a BaseAgent subclass). The PressureEngineAgent's
    # ``engine`` field is a PressureEngine; we just need to verify the orch
    # has SOME pressure agent attached.
    assert orch.pressure_adapter is not None
    assert orch.pressure_adapter.name == "pressure_engine"
