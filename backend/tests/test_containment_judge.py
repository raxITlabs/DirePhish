"""Tests for containment_judge module."""

import pytest
from dataclasses import dataclass


@dataclass
class FakeIterationResult:
    """Minimal IterationResult for testing."""
    iteration_id: str
    seed: int
    total_rounds: int
    total_actions: int
    actions: list
    summary: dict
    cost_usd: float
    variation_description: str
    completed_at: str
    output_dir: str


def _make_actions(texts_by_round: dict[int, list[str]]) -> list[dict]:
    """Build action list from {round: [text, ...]} mapping."""
    actions = []
    for rnd, texts in texts_by_round.items():
        for text in texts:
            actions.append({
                "round": rnd,
                "agent": "TestAgent",
                "role": "soc_analyst",
                "world": "slack",
                "action": text,
                "args": {},
                "result": {},
            })
    return actions


def _make_result(actions: list[dict], total_rounds: int = 10, summary: dict | None = None) -> FakeIterationResult:
    return FakeIterationResult(
        iteration_id="test_iter_001",
        seed=42,
        total_rounds=total_rounds,
        total_actions=len(actions),
        actions=actions,
        summary=summary or {},
        cost_usd=0.0,
        variation_description="",
        completed_at="",
        output_dir="",
    )


class TestKeywordClassifier:
    def test_contained_early_when_keyword_in_first_half(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({2: ["Isolating compromised host from network"]})
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "contained_early"
        assert c_round == 2

    def test_contained_late_when_keyword_in_second_half(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({8: ["Revoking all access tokens"]})
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "contained_late"
        assert c_round == 8

    def test_escalated_when_escalation_but_no_containment(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({3: ["Data exfiltration to external server"]})
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "escalated"
        assert c_round is None

    def test_not_contained_when_no_keywords(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({1: ["Checking email inbox"]})
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "not_contained"
        assert c_round is None

    def test_containment_wins_over_escalation(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({
            2: ["Blocking malicious IP"],
            5: ["Data exfiltration detected"],
        })
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "contained_early"
        assert c_round == 2


class TestRoundDigest:
    def test_digest_includes_inject_events(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"type": "inject", "round": 1, "description": "Phishing email delivered to CFO"},
            {"round": 1, "agent": "SOC", "role": "soc_analyst", "world": "slack",
             "action": "send_message", "args": {"content": "Investigating alert"}, "result": {}},
        ]
        result = _make_result(actions, total_rounds=5)
        digest = build_round_digest(result)
        assert "INJECT" in digest
        assert "Phishing email delivered to CFO" in digest

    def test_digest_includes_arbiter_decisions(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"type": "arbiter", "round": 2, "decision": "continue", "reason": "Active threat"},
        ]
        result = _make_result(actions, total_rounds=5)
        digest = build_round_digest(result)
        assert "ARBITER" in digest
        assert "continue" in digest

    def test_digest_includes_do_nothing(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"round": 1, "agent": "CEO", "role": "ceo", "world": "slack",
             "action": "do_nothing", "args": {}, "result": {}},
        ]
        result = _make_result(actions, total_rounds=5)
        digest = build_round_digest(result)
        assert "do_nothing" in digest

    def test_digest_includes_adaptive_depth_context(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"round": 1, "agent": "SOC", "role": "soc_analyst", "world": "slack",
             "action": "send_message", "args": {"content": "Alert"}, "result": {}},
        ]
        summary = {"adaptive_depth": {"enabled": True, "stopped_at_round": 7, "stop_reason": "contained"}}
        result = _make_result(actions, total_rounds=10, summary=summary)
        digest = build_round_digest(result)
        assert "stopped at round 7" in digest.lower() or "round 7" in digest
        assert "contained" in digest.lower()

    def test_digest_groups_by_round(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"round": 1, "agent": "SOC", "role": "soc_analyst", "world": "slack",
             "action": "send_message", "args": {"content": "Alert triage"}, "result": {}},
            {"round": 2, "agent": "CISO", "role": "ciso", "world": "slack",
             "action": "send_message", "args": {"content": "Authorize isolation"}, "result": {}},
        ]
        result = _make_result(actions, total_rounds=5)
        digest = build_round_digest(result)
        assert "ROUND 1" in digest
        assert "ROUND 2" in digest


from unittest.mock import MagicMock


class TestLLMJudge:
    """Tests for classify_iteration_llm."""

    def _make_llm(self, response: dict) -> MagicMock:
        """Create a mock LLMClient returning the given JSON response."""
        llm = MagicMock()
        llm.chat_json.return_value = response
        llm.model = "test-model"
        llm.last_usage = {"input_tokens": 100, "output_tokens": 50, "cached_tokens": 0}
        return llm

    def test_returns_llm_classification(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({1: ["Monitoring dashboards"], 3: ["Blocking IP"]})
        result = _make_result(actions, total_rounds=10)
        llm = self._make_llm({
            "outcome": "contained_early",
            "containment_round": 3,
            "confidence": 0.85,
            "reasoning": "Defenders blocked the attacker IP in round 3.",
        })
        label, c_round, meta = classify_iteration_llm(result, llm)
        assert label == "contained_early"
        assert c_round == 3
        assert meta["confidence"] == 0.85
        assert meta["reasoning"] == "Defenders blocked the attacker IP in round 3."
        assert meta.get("fallback") is not True

    def test_fallback_on_invalid_outcome(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({2: ["Isolating host"]})
        result = _make_result(actions, total_rounds=10)
        llm = self._make_llm({
            "outcome": "partially_contained",  # invalid
            "containment_round": 2,
            "confidence": 0.5,
            "reasoning": "Partial containment.",
        })
        label, c_round, meta = classify_iteration_llm(result, llm)
        assert label == "contained_early"
        assert meta["fallback"] is True

    def test_fallback_on_llm_exception(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({5: ["Checking logs"]})
        result = _make_result(actions, total_rounds=10)
        llm = MagicMock()
        llm.chat_json.side_effect = Exception("API timeout")
        llm.model = "test-model"
        label, c_round, meta = classify_iteration_llm(result, llm)
        assert label == "not_contained"
        assert meta["fallback"] is True

    def test_cost_tracking(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({1: ["Blocking attacker"]})
        result = _make_result(actions, total_rounds=10)
        llm = self._make_llm({
            "outcome": "contained_early",
            "containment_round": 1,
            "confidence": 0.9,
            "reasoning": "Blocked.",
        })
        cost_tracker = MagicMock()
        classify_iteration_llm(result, llm, cost_tracker)
        cost_tracker.track_llm.assert_called_once()
        call_args = cost_tracker.track_llm.call_args
        assert call_args[0][0] == "mc_judge"
        assert call_args[0][1] == "test-model"

    def test_prompt_includes_arbiter_stop_reason(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({1: ["Alert received"]})
        summary = {"adaptive_depth": {"enabled": True, "stopped_at_round": 5, "stop_reason": "contained"}}
        result = _make_result(actions, total_rounds=10, summary=summary)
        llm = self._make_llm({
            "outcome": "contained_early",
            "containment_round": 5,
            "confidence": 0.9,
            "reasoning": "Contained at round 5.",
        })
        classify_iteration_llm(result, llm)
        prompt_text = llm.chat_json.call_args[0][0][0]["content"]
        assert "contained" in prompt_text.lower()
        assert "round 5" in prompt_text
