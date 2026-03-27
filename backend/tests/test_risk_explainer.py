"""Tests for risk_explainer — driver attribution via stratified comparison.

Pure computation tests: fast, deterministic, no external dependencies.
"""
import pytest

from app.services.risk_explainer import (
    MIN_GROUP_SIZE,
    _evaluate_divergence_point,
    _get_agent_actions_at_round,
    compute_drivers,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_iteration(agent: str, round_num: int, action: str) -> dict:
    """Build a minimal iteration dict with one action."""
    return {
        "actions": [
            {"agent": agent, "round": round_num, "action": action},
        ],
    }


def _make_divergence_point(
    agent: str, round_num: int, action_distribution: dict
) -> dict:
    return {
        "agent": agent,
        "round": round_num,
        "action_distribution": action_distribution,
    }


# ---------------------------------------------------------------------------
# 1. compute_drivers
# ---------------------------------------------------------------------------

class TestComputeDrivers:
    """Tests for the top-level driver computation."""

    def test_happy_path_returns_top_5(self):
        """With 6+ candidates and valid splits, returns at most 5 drivers."""
        # Build iterations: half took "isolate", half took "monitor"
        iterations = []
        scores = []
        for i in range(20):
            if i < 10:
                iterations.append(_make_iteration("SOC", 1, "isolate"))
                scores.append(80.0)
            else:
                iterations.append(_make_iteration("SOC", 1, "monitor"))
                scores.append(40.0)

        # 6 divergence points all at round 1 with same distribution
        dps = [
            _make_divergence_point("SOC", 1, {"isolate": 10, "monitor": 10}),
            _make_divergence_point("SOC", 1, {"isolate": 10, "monitor": 10}),
            _make_divergence_point("SOC", 1, {"isolate": 10, "monitor": 10}),
            _make_divergence_point("SOC", 1, {"isolate": 10, "monitor": 10}),
            _make_divergence_point("SOC", 1, {"isolate": 10, "monitor": 10}),
            _make_divergence_point("SOC", 1, {"isolate": 10, "monitor": 10}),
        ]

        drivers = compute_drivers(scores, iterations, dps)
        assert len(drivers) <= 5
        assert len(drivers) >= 1

    def test_no_divergence_points_returns_empty(self):
        """No divergence points means no drivers."""
        scores = [50.0] * 10
        iterations = [_make_iteration("A", 1, "act")] * 10
        assert compute_drivers(scores, iterations, []) == []

    def test_empty_per_iteration_data_returns_empty(self):
        """Empty iteration data returns empty list."""
        dps = [_make_divergence_point("A", 1, {"x": 5})]
        assert compute_drivers([50.0], [], dps) == []

    def test_empty_scores_returns_empty(self):
        """Empty scores returns empty list."""
        dps = [_make_divergence_point("A", 1, {"x": 5})]
        iterations = [_make_iteration("A", 1, "x")]
        assert compute_drivers([], iterations, dps) == []

    def test_mismatched_lengths_returns_empty(self):
        """Mismatched scores and iteration data lengths returns empty."""
        dps = [_make_divergence_point("A", 1, {"x": 5})]
        scores = [50.0, 60.0]
        iterations = [_make_iteration("A", 1, "x")]
        assert compute_drivers(scores, iterations, dps) == []

    def test_quick_mode_few_iterations(self):
        """With only 10 iterations, only reportable drivers are returned
        (those with MIN_GROUP_SIZE per group)."""
        # 5 took "isolate", 5 took "monitor" — both groups >= MIN_GROUP_SIZE
        iterations = []
        scores = []
        for i in range(10):
            if i < 5:
                iterations.append(_make_iteration("SOC", 1, "isolate"))
                scores.append(75.0)
            else:
                iterations.append(_make_iteration("SOC", 1, "monitor"))
                scores.append(45.0)

        dps = [
            _make_divergence_point("SOC", 1, {"isolate": 5, "monitor": 5}),
            _make_divergence_point("SOC", 2, {"isolate": 5, "monitor": 5}),
            _make_divergence_point("SOC", 3, {"isolate": 5, "monitor": 5}),
        ]

        drivers = compute_drivers(scores, iterations, dps)
        # Only round 1 has actions, rounds 2 & 3 have no actions so all go
        # into without-group — those may not meet MIN_GROUP_SIZE split
        assert len(drivers) >= 1


# ---------------------------------------------------------------------------
# 2. _evaluate_divergence_point
# ---------------------------------------------------------------------------

class TestEvaluateDivergencePoint:
    """Tests for single divergence point evaluation."""

    def test_minimum_group_size_exclusion(self):
        """Driver is excluded when one group has fewer than MIN_GROUP_SIZE."""
        # 9 took "isolate", 1 took "monitor" — lopsided
        iterations = []
        scores = []
        for i in range(10):
            if i < 9:
                iterations.append(_make_iteration("SOC", 1, "isolate"))
                scores.append(70.0)
            else:
                iterations.append(_make_iteration("SOC", 1, "monitor"))
                scores.append(40.0)

        dp = _make_divergence_point("SOC", 1, {"isolate": 9, "monitor": 1})
        result = _evaluate_divergence_point(dp, scores, iterations)
        # group_without has only 1 entry < MIN_GROUP_SIZE
        assert result is None

    def test_even_split_produces_valid_driver(self):
        """Even split with clear score difference produces a valid driver."""
        iterations = []
        scores = []
        for i in range(10):
            if i < 5:
                iterations.append(_make_iteration("CISO", 2, "escalate"))
                scores.append(30.0)
            else:
                iterations.append(_make_iteration("CISO", 2, "contain"))
                scores.append(80.0)

        dp = _make_divergence_point("CISO", 2, {"escalate": 5, "contain": 5})
        result = _evaluate_divergence_point(dp, scores, iterations)

        assert result is not None
        assert "description" in result
        assert "evidence" in result
        assert "impact" in result
        assert "correlation" in result
        assert isinstance(result["impact"], float)

    def test_all_in_one_group_excluded(self):
        """All iterations have the dominant action — without-group is empty."""
        iterations = [_make_iteration("SOC", 1, "isolate")] * 10
        scores = [60.0] * 10

        dp = _make_divergence_point("SOC", 1, {"isolate": 10})
        result = _evaluate_divergence_point(dp, scores, iterations)
        assert result is None

    def test_empty_action_distribution_excluded(self):
        """Empty action_distribution returns None."""
        dp = {"agent": "SOC", "round": 1, "action_distribution": {}}
        result = _evaluate_divergence_point(dp, [50.0] * 5, [{}] * 5)
        assert result is None

    def test_impact_sign_positive_when_action_helps(self):
        """Impact is positive when the dominant action group has higher scores."""
        iterations = []
        scores = []
        for i in range(10):
            if i < 5:
                iterations.append(_make_iteration("SOC", 1, "isolate"))
                scores.append(90.0)
            else:
                iterations.append(_make_iteration("SOC", 1, "wait"))
                scores.append(30.0)

        dp = _make_divergence_point("SOC", 1, {"isolate": 5, "wait": 5})
        result = _evaluate_divergence_point(dp, scores, iterations)

        assert result is not None
        assert result["impact"] > 0

    def test_impact_sign_negative_when_action_hurts(self):
        """Impact is negative when the dominant action group has lower scores."""
        iterations = []
        scores = []
        for i in range(10):
            if i < 5:
                iterations.append(_make_iteration("SOC", 1, "panic"))
                scores.append(20.0)
            else:
                iterations.append(_make_iteration("SOC", 1, "monitor"))
                scores.append(80.0)

        dp = _make_divergence_point("SOC", 1, {"panic": 5, "monitor": 5})
        result = _evaluate_divergence_point(dp, scores, iterations)

        assert result is not None
        assert result["impact"] < 0


# ---------------------------------------------------------------------------
# 3. _get_agent_actions_at_round
# ---------------------------------------------------------------------------

class TestGetAgentActionsAtRound:
    """Tests for extracting agent actions from iteration data."""

    def test_matching_agent_and_round(self):
        """Returns action when agent and round match."""
        it = {
            "actions": [
                {"agent": "SOC", "round": 1, "action": "isolate"},
                {"agent": "SOC", "round": 2, "action": "monitor"},
                {"agent": "CISO", "round": 1, "action": "notify"},
            ],
        }
        result = _get_agent_actions_at_round(it, "SOC", 1)
        assert result == ["isolate"]

    def test_no_matching_agent(self):
        """Returns empty when agent does not match."""
        it = {"actions": [{"agent": "SOC", "round": 1, "action": "isolate"}]}
        assert _get_agent_actions_at_round(it, "CISO", 1) == []

    def test_no_matching_round(self):
        """Returns empty when round does not match."""
        it = {"actions": [{"agent": "SOC", "round": 1, "action": "isolate"}]}
        assert _get_agent_actions_at_round(it, "SOC", 5) == []

    def test_multiple_actions_same_round(self):
        """Returns all actions for the agent at that round."""
        it = {
            "actions": [
                {"agent": "SOC", "round": 1, "action": "detect"},
                {"agent": "SOC", "round": 1, "action": "isolate"},
            ],
        }
        result = _get_agent_actions_at_round(it, "SOC", 1)
        assert result == ["detect", "isolate"]

    def test_empty_actions_list(self):
        """Empty actions list returns empty."""
        assert _get_agent_actions_at_round({"actions": []}, "SOC", 1) == []

    def test_no_actions_key(self):
        """Missing 'actions' key returns empty."""
        assert _get_agent_actions_at_round({}, "SOC", 1) == []

    def test_action_name_fallback(self):
        """Falls back to 'action_name' when 'action' is empty."""
        it = {
            "actions": [
                {"agent": "SOC", "round": 1, "action": "", "action_name": "fallback_act"},
            ],
        }
        result = _get_agent_actions_at_round(it, "SOC", 1)
        assert result == ["fallback_act"]
