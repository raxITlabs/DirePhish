"""Tests for risk_score_engine — composite score, per-iteration scoring,
bootstrap CI, and score interpretation.

Pure computation tests: fast, deterministic, no external dependencies.
"""
import pytest

from app.services.risk_score_engine import (
    DIMENSIONS,
    INTERPRETATION,
    _bootstrap_ci,
    _compute_per_iteration_score,
    compute_composite_score,
    interpret_score,
)


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

SAMPLE_AGGREGATION = {
    "iteration_count": 50,
    "outcome_distribution": {
        "contained_early": 20,
        "contained_late": 15,
        "not_contained": 10,
        "escalated": 5,
    },
    "containment_round_stats": {
        "mean": 8.5,
        "median": 8.0,
        "std": 3.2,
        "min": 3,
        "max": 18,
    },
    "decision_divergence_points": [],
    "agent_consistency": {
        "SOC Analyst": 0.82,
        "CISO": 0.75,
        "IT Director": 0.68,
    },
}

SAMPLE_RESILIENCE = {
    "overall": 65.0,
    "dimensions": {
        "detection_speed": 72.0,
        "containment_speed": 58.0,
        "communication_quality": 61.0,
        "compliance_adherence": 55.0,
    },
    "robustness_index": 60.0,
    "weakest_link": "compliance_adherence",
    "failure_modes": [],
}


# ---------------------------------------------------------------------------
# 1. compute_composite_score
# ---------------------------------------------------------------------------

class TestComputeCompositeScore:
    """Tests for the main composite score computation."""

    def test_happy_path_full_data(self):
        """Full aggregation + resilience data produces a valid composite score."""
        result = compute_composite_score(
            aggregation=SAMPLE_AGGREGATION,
            resilience=SAMPLE_RESILIENCE,
        )

        assert 0 <= result["composite_score"] <= 100
        assert len(result["dimensions"]) == 6
        assert all(k in result["dimensions"] for k in DIMENSIONS)
        assert "confidence_interval" in result
        assert "confidence_flag" in result
        assert "interpretation" in result
        assert result["interpretation"]["tier"] in (
            "critical", "poor", "moderate", "good", "excellent"
        )

    def test_missing_resilience_falls_back_to_50(self):
        """Without resilience data, detection_speed, communication_quality,
        and compliance_adherence should fall back to 50.0."""
        result = compute_composite_score(
            aggregation=SAMPLE_AGGREGATION,
            resilience=None,
        )

        dims = result["dimensions"]
        assert dims["detection_speed"] == 50.0
        assert dims["communication_quality"] == 50.0
        assert dims["compliance_adherence"] == 50.0

    def test_all_contained_early_score_near_100(self):
        """When every iteration is contained_early, score should be near 100."""
        agg = {
            "iteration_count": 50,
            "outcome_distribution": {
                "contained_early": 50,
                "contained_late": 0,
                "not_contained": 0,
                "escalated": 0,
            },
            "containment_round_stats": {
                "mean": 2.0, "median": 2.0, "std": 0.0, "min": 1, "max": 3,
            },
            "agent_consistency": {"Agent A": 1.0},
        }
        resilience = {
            "dimensions": {
                "detection_speed": 100.0,
                "communication_quality": 100.0,
                "compliance_adherence": 100.0,
            },
        }

        result = compute_composite_score(aggregation=agg, resilience=resilience)
        assert result["composite_score"] >= 95.0

    def test_all_escalated_score_near_0(self):
        """When every iteration escalated, score should be near 0."""
        agg = {
            "iteration_count": 50,
            "outcome_distribution": {
                "contained_early": 0,
                "contained_late": 0,
                "not_contained": 0,
                "escalated": 50,
            },
            "containment_round_stats": {
                "mean": 18.0, "median": 18.0, "std": 0.0, "min": 18, "max": 18,
            },
            "agent_consistency": {"Agent A": 0.0},
        }

        result = compute_composite_score(aggregation=agg, resilience=None)
        # With no resilience, 3 dims fall back to 50.0, so score won't be 0
        # but should still be low (escalation resistance = 0, consistency = 0, containment = 0)
        assert result["composite_score"] <= 30.0

    def test_zero_total_outcomes_returns_zero(self):
        """Empty outcome distribution should return score 0 with safe defaults."""
        agg = {
            "iteration_count": 0,
            "outcome_distribution": {},
            "containment_round_stats": {},
            "agent_consistency": {},
        }

        result = compute_composite_score(aggregation=agg)
        assert result["composite_score"] == 0.0
        assert all(v == 0.0 for v in result["dimensions"].values())
        assert result["confidence_flag"] == "low"
        assert result["confidence_interval"] == {"lower": 0.0, "upper": 0.0}

    def test_confidence_flag_low_for_few_iterations(self):
        """Fewer than 25 iterations should produce confidence_flag='low'."""
        agg = {**SAMPLE_AGGREGATION, "iteration_count": 10}
        result = compute_composite_score(aggregation=agg)
        assert result["confidence_flag"] == "low"

    def test_confidence_flag_high_for_many_iterations(self):
        """25+ iterations should produce confidence_flag='high'."""
        agg = {**SAMPLE_AGGREGATION, "iteration_count": 25}
        result = compute_composite_score(aggregation=agg)
        assert result["confidence_flag"] == "high"


# ---------------------------------------------------------------------------
# 2. Individual dimension scoring
# ---------------------------------------------------------------------------

class TestDimensionScoring:
    """Verify each of the 6 dimensions is scored independently."""

    def test_detection_speed_from_resilience(self):
        """detection_speed should come directly from resilience dimensions."""
        result = compute_composite_score(
            aggregation=SAMPLE_AGGREGATION, resilience=SAMPLE_RESILIENCE,
        )
        assert result["dimensions"]["detection_speed"] == 72.0

    def test_containment_effectiveness_calculation(self):
        """containment_effectiveness = base * (1 - std/max), where
        base = (early*1.0 + late*0.5) / total * 100."""
        total = 50
        early, late = 20, 15
        std, max_rounds = 3.2, 18
        base = (early * 1.0 + late * 0.5) / total * 100  # 55.0
        expected = base * (1 - min(std / max_rounds, 1.0))

        result = compute_composite_score(
            aggregation=SAMPLE_AGGREGATION, resilience=SAMPLE_RESILIENCE,
        )
        assert result["dimensions"]["containment_effectiveness"] == round(expected, 1)

    def test_communication_quality_from_resilience(self):
        """communication_quality from resilience."""
        result = compute_composite_score(
            aggregation=SAMPLE_AGGREGATION, resilience=SAMPLE_RESILIENCE,
        )
        assert result["dimensions"]["communication_quality"] == 61.0

    def test_decision_consistency_from_agent_consistency(self):
        """decision_consistency = mean(agent_consistency) * 100."""
        from statistics import mean as _mean
        vals = [0.82, 0.75, 0.68]
        expected = round(_mean(vals) * 100, 1)

        result = compute_composite_score(
            aggregation=SAMPLE_AGGREGATION, resilience=SAMPLE_RESILIENCE,
        )
        assert result["dimensions"]["decision_consistency"] == expected

    def test_compliance_adherence_from_resilience(self):
        """compliance_adherence from resilience."""
        result = compute_composite_score(
            aggregation=SAMPLE_AGGREGATION, resilience=SAMPLE_RESILIENCE,
        )
        assert result["dimensions"]["compliance_adherence"] == 55.0

    def test_escalation_resistance_calculation(self):
        """escalation_resistance = (1 - escalated/total) * 100."""
        expected = (1 - 5 / 50) * 100  # 90.0

        result = compute_composite_score(
            aggregation=SAMPLE_AGGREGATION, resilience=SAMPLE_RESILIENCE,
        )
        assert result["dimensions"]["escalation_resistance"] == expected

    def test_dimension_score_exactly_zero(self):
        """A dimension can score exactly 0.0 (all escalated, no containment)."""
        agg = {
            "iteration_count": 10,
            "outcome_distribution": {
                "contained_early": 0, "contained_late": 0,
                "not_contained": 0, "escalated": 10,
            },
            "containment_round_stats": {"std": 0, "max": 1},
            "agent_consistency": {"A": 0.0},
        }
        result = compute_composite_score(aggregation=agg)
        assert result["dimensions"]["containment_effectiveness"] == 0.0
        assert result["dimensions"]["escalation_resistance"] == 0.0

    def test_dimension_score_exactly_100(self):
        """A dimension can reach exactly 100.0."""
        agg = {
            "iteration_count": 10,
            "outcome_distribution": {
                "contained_early": 10, "contained_late": 0,
                "not_contained": 0, "escalated": 0,
            },
            "containment_round_stats": {"std": 0, "max": 5},
            "agent_consistency": {"A": 1.0},
        }
        resilience = {
            "dimensions": {
                "detection_speed": 100.0,
                "communication_quality": 100.0,
                "compliance_adherence": 100.0,
            },
        }
        result = compute_composite_score(aggregation=agg, resilience=resilience)
        assert result["dimensions"]["detection_speed"] == 100.0
        assert result["dimensions"]["escalation_resistance"] == 100.0
        assert result["dimensions"]["decision_consistency"] == 100.0


# ---------------------------------------------------------------------------
# 3. _compute_per_iteration_score
# ---------------------------------------------------------------------------

class TestComputePerIterationScore:
    """Tests for the per-iteration score proxy computation."""

    def test_contained_early_iteration(self):
        """contained_early iteration scores higher than escalated."""
        it_good = {
            "total_rounds": 10,
            "first_alert_round": 1,
            "outcome": "contained_early",
            "cross_channel_messages": 5,
            "total_messages": 10,
            "consistency_score": 0.9,
            "first_compliance_notification_round": 2,
        }
        it_bad = {
            "total_rounds": 10,
            "first_alert_round": 9,
            "outcome": "escalated",
            "cross_channel_messages": 0,
            "total_messages": 10,
            "consistency_score": 0.1,
            "first_compliance_notification_round": None,
        }
        score_good = _compute_per_iteration_score(it_good, SAMPLE_AGGREGATION)
        score_bad = _compute_per_iteration_score(it_bad, SAMPLE_AGGREGATION)
        assert score_good > score_bad

    def test_missing_first_alert_defaults_to_50(self):
        """When first_alert_round is None, detection_speed proxy = 50."""
        it = {"total_rounds": 10, "outcome": "not_contained"}
        score = _compute_per_iteration_score(it, SAMPLE_AGGREGATION)
        # detection component = 50 * 0.20 = 10
        assert score > 0


# ---------------------------------------------------------------------------
# 4. _bootstrap_ci
# ---------------------------------------------------------------------------

class TestBootstrapCI:
    """Tests for the deterministic bootstrap confidence interval."""

    def test_deterministic_same_batch_id(self):
        """Same batch_id always produces the same CI."""
        scores = [60.0, 70.0, 80.0, 50.0, 90.0]
        ci1 = _bootstrap_ci(scores, batch_id="test_batch_001")
        ci2 = _bootstrap_ci(scores, batch_id="test_batch_001")
        assert ci1 == ci2

    def test_different_batch_id_different_ci(self):
        """Different batch_id produces different CI (with enough distinct values)."""
        # Use more diverse scores so different seeds produce different resampling
        scores = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
        ci1 = _bootstrap_ci(scores, batch_id="batch_aaaa")
        ci2 = _bootstrap_ci(scores, batch_id="batch_zzzz")
        # With 10 distinct values, different seeds should produce at least slightly different CIs
        assert ci1["lower"] != ci2["lower"] or ci1["upper"] != ci2["upper"]

    def test_small_sample_wide_ci(self):
        """Small sample (10 very spread values) should give wider CI than large."""
        small = [10.0, 90.0] * 5  # 10 values, high variance
        large = [10.0, 90.0] * 50  # 100 values, same variance

        ci_small = _bootstrap_ci(small, batch_id="test")
        ci_large = _bootstrap_ci(large, batch_id="test")

        width_small = ci_small["upper"] - ci_small["lower"]
        width_large = ci_large["upper"] - ci_large["lower"]
        assert width_small > width_large

    def test_single_score_returns_point_estimate(self):
        """A single score returns lower == upper == score."""
        ci = _bootstrap_ci([42.0], batch_id="single")
        assert ci["lower"] == 42.0
        assert ci["upper"] == 42.0

    def test_ci_lower_le_upper(self):
        """CI lower bound should always be <= upper bound."""
        scores = [30.0, 50.0, 70.0, 90.0, 10.0]
        ci = _bootstrap_ci(scores, batch_id="ordering_test")
        assert ci["lower"] <= ci["upper"]


# ---------------------------------------------------------------------------
# 5. interpret_score
# ---------------------------------------------------------------------------

class TestInterpretScore:
    """Tests for score interpretation tier assignment."""

    def test_critical_tier(self):
        """Score <= 30 is Critical."""
        assert interpret_score(0.0)["tier"] == "critical"
        assert interpret_score(30.0)["tier"] == "critical"

    def test_poor_tier(self):
        """30 < score <= 50 is Poor."""
        assert interpret_score(30.1)["tier"] == "poor"
        assert interpret_score(50.0)["tier"] == "poor"

    def test_moderate_tier(self):
        """50 < score <= 70 is Moderate."""
        assert interpret_score(50.1)["tier"] == "moderate"
        assert interpret_score(70.0)["tier"] == "moderate"

    def test_good_tier(self):
        """70 < score <= 85 is Good."""
        assert interpret_score(70.1)["tier"] == "good"
        assert interpret_score(85.0)["tier"] == "good"

    def test_excellent_tier(self):
        """85 < score <= 100 is Excellent."""
        assert interpret_score(85.1)["tier"] == "excellent"
        assert interpret_score(100.0)["tier"] == "excellent"

    def test_above_100_still_excellent(self):
        """Score above 100 (edge) still returns Excellent."""
        result = interpret_score(105.0)
        assert result["tier"] == "excellent"

    def test_interpretation_has_all_keys(self):
        """Each interpretation has tier, label, description."""
        result = interpret_score(55.0)
        assert "tier" in result
        assert "label" in result
        assert "description" in result
