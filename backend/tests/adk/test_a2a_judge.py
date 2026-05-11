"""JudgeService A2A endpoint — round-trip + AgentCard."""

import json
import pytest


def test_agent_card_endpoint_returns_card(vertex_env):
    from fastapi.testclient import TestClient
    from adk.a2a.judge_service import create_app

    client = TestClient(create_app())
    resp = client.get("/.well-known/agent.json")
    assert resp.status_code == 200
    card = resp.json()
    assert card["name"] == "DirePhish ContainmentJudge"
    assert "capabilities" in card


def test_score_round_endpoint_returns_structured_score(vertex_env, monkeypatch):
    """Mock the inner Gemini call; assert the A2A wrapper extracts JSON."""
    from fastapi.testclient import TestClient
    import adk.a2a.judge_service as svc

    monkeypatch.setattr(
        svc, "_invoke_judge",
        lambda payload: {
            "containment": 6.0, "evidence": 5.5,
            "communication": 7.0, "business_impact": 6.5,
            "rationale": "Stub.",
        },
    )

    client = TestClient(svc.create_app())
    resp = client.post("/a2a/score_round", json={
        "round": 1, "pressure_events": [], "adversary_action": None,
        "defender_actions": [],
    })
    assert resp.status_code == 200
    score = resp.json()
    assert 0 <= score["containment"] <= 10
    assert "rationale" in score


def test_score_round_handles_missing_fields_gracefully(vertex_env, monkeypatch):
    """Missing optional fields → still scored."""
    from fastapi.testclient import TestClient
    import adk.a2a.judge_service as svc

    captured = {}
    def _stub(payload):
        captured["payload"] = payload
        return {"containment": 5.0, "evidence": 5.0, "communication": 5.0,
                "business_impact": 5.0, "rationale": "ok"}
    monkeypatch.setattr(svc, "_invoke_judge", _stub)

    client = TestClient(svc.create_app())
    resp = client.post("/a2a/score_round", json={"round": 2})  # minimal
    assert resp.status_code == 200
    assert captured["payload"]["round"] == 2


@pytest.mark.asyncio
@pytest.mark.skipif(
    __import__("os").environ.get("RUN_LIVE_VERTEX") != "1",
    reason="set RUN_LIVE_VERTEX=1 to exercise live judge",
)
async def test_a2a_judge_live_round_trip():
    from fastapi.testclient import TestClient
    from adk.a2a.judge_service import create_app

    client = TestClient(create_app())
    resp = client.post("/a2a/score_round", json={
        "round": 1, "pressure_events": [],
        "adversary_action": {"agent": "actor", "action": "send_message",
                            "args": {"content": "burn the SP"}, "world": "slack", "role": "attacker"},
        "defender_actions": [{"agent": "ir_lead", "action": "send_message",
                             "args": {"content": "war room up"}, "world": "slack", "role": "defender"}],
    })
    assert resp.status_code == 200
    score = resp.json()
    assert 0 <= score["containment"] <= 10


def test_judge_a2a_client_skip_when_url_not_set(monkeypatch):
    monkeypatch.delenv("A2A_JUDGE_URL", raising=False)
    from adk.a2a.judge_client import JudgeA2aClient
    client = JudgeA2aClient()
    assert client.is_configured() is False


def test_judge_a2a_client_uses_explicit_url(monkeypatch):
    monkeypatch.delenv("A2A_JUDGE_URL", raising=False)
    from adk.a2a.judge_client import JudgeA2aClient
    client = JudgeA2aClient(url="http://localhost:8003")
    assert client.is_configured() is True


def test_judge_a2a_client_reads_env(monkeypatch):
    monkeypatch.setenv("A2A_JUDGE_URL", "http://judge.local:8003")
    from adk.a2a.judge_client import JudgeA2aClient
    client = JudgeA2aClient()
    assert client.is_configured() is True
