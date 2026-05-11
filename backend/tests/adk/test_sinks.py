"""Output sinks must match legacy actions.jsonl format byte-for-byte."""

import json
from pathlib import Path

import pytest
from crucible.events import ActionEvent

from adk.sinks.actions_jsonl import ActionsJsonlSink


def _sample_event(round_num: int = 1, agent: str = "Marcus Thorne") -> ActionEvent:
    return ActionEvent(
        round=round_num,
        timestamp="2026-05-11T00:00:00+00:00",
        simulation_id="sink-test",
        agent=agent,
        role="defender",
        world="slack",
        action="send_message",
        args={"channel": "war-room", "content": "hi"},
        result={"success": True},
    )


def test_sink_writes_one_line_per_event(tmp_path):
    sink = ActionsJsonlSink(output_dir=tmp_path)
    sink.write(_sample_event(1))
    sink.write(_sample_event(2))
    sink.close()

    lines = (tmp_path / "actions.jsonl").read_text().strip().split("\n")
    assert len(lines) == 2


def test_sink_line_is_valid_action_event_json(tmp_path):
    sink = ActionsJsonlSink(output_dir=tmp_path)
    sink.write(_sample_event(1))
    sink.close()

    line = (tmp_path / "actions.jsonl").read_text().strip()
    parsed = json.loads(line)

    assert parsed["round"] == 1
    assert parsed["agent"] == "Marcus Thorne"
    assert parsed["action"] == "send_message"
    # Legacy contract: presence of these keys
    for k in ("round", "timestamp", "simulation_id", "agent", "role",
              "world", "action", "args", "result"):
        assert k in parsed, f"missing key {k}"


def test_sink_appends_not_overwrites(tmp_path):
    sink1 = ActionsJsonlSink(output_dir=tmp_path)
    sink1.write(_sample_event(1))
    sink1.close()

    sink2 = ActionsJsonlSink(output_dir=tmp_path)
    sink2.write(_sample_event(2, agent="Dane Stuckey"))
    sink2.close()

    text = (tmp_path / "actions.jsonl").read_text()
    lines = text.strip().split("\n")
    assert len(lines) == 2
    # Second sink's event preserved
    assert "Dane Stuckey" in text


def test_sink_handles_unicode_in_content(tmp_path):
    """Non-ASCII characters in args.content must pass through cleanly."""
    sink = ActionsJsonlSink(output_dir=tmp_path)
    ev = ActionEvent(
        round=1,
        timestamp="2026-05-11T00:00:00+00:00",
        simulation_id="unicode-test",
        agent="agent",
        role="defender",
        world="slack",
        action="send_message",
        args={"channel": "x", "content": "café — déjà vu 🔥"},
        result={"success": True},
    )
    sink.write(ev)
    sink.close()
    parsed = json.loads((tmp_path / "actions.jsonl").read_text().strip())
    assert parsed["args"]["content"] == "café — déjà vu 🔥"


def test_sink_writes_into_subdir_if_output_dir_does_not_exist(tmp_path):
    """Sink must create the output dir if missing."""
    target = tmp_path / "deep" / "nested" / "dir"
    sink = ActionsJsonlSink(output_dir=target)
    sink.write(_sample_event(1))
    sink.close()
    assert (target / "actions.jsonl").exists()
