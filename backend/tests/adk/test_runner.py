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
