"""Tests for fair_loss_mapper — FAIR loss computation, calibration validation,
and per-iteration loss magnitude.

Pure computation tests: fast, deterministic, no external dependencies.
"""
import pytest

from app.services.fair_loss_mapper import (
    CALIBRATION_SCHEMA,
    _compute_iteration_lm,
    compute_fair_loss,
    validate_calibration,
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
}


# ---------------------------------------------------------------------------
# 1. validate_calibration
# ---------------------------------------------------------------------------

class TestValidateCalibration:
    """Tests for calibration input validation and clamping."""

    def test_default_calibration_no_inputs(self):
        """No user inputs should apply all defaults."""
        result = validate_calibration(None)
        for key, schema in CALIBRATION_SCHEMA.items():
            assert result[key] == schema["default"]

    def test_empty_dict_applies_defaults(self):
        """Empty dict behaves the same as None."""
        result = validate_calibration({})
        for key, schema in CALIBRATION_SCHEMA.items():
            assert result[key] == schema["default"]

    def test_valid_inputs_preserved(self):
        """Valid inputs within range are preserved as-is."""
        cal = {"annual_threat_frequency": 1.0, "hourly_cost": 200}
        result = validate_calibration(cal)
        assert result["annual_threat_frequency"] == 1.0
        assert result["hourly_cost"] == 200

    def test_below_minimum_clamped(self):
        """Input below minimum is clamped to min."""
        cal = {"annual_threat_frequency": -5.0, "hourly_cost": 0}
        result = validate_calibration(cal)
        assert result["annual_threat_frequency"] == CALIBRATION_SCHEMA["annual_threat_frequency"]["min"]
        assert result["hourly_cost"] == CALIBRATION_SCHEMA["hourly_cost"]["min"]

    def test_above_maximum_clamped(self):
        """Input above maximum is clamped to max."""
        cal = {"annual_threat_frequency": 999.0, "hourly_cost": 99999}
        result = validate_calibration(cal)
        assert result["annual_threat_frequency"] == CALIBRATION_SCHEMA["annual_threat_frequency"]["max"]
        assert result["hourly_cost"] == CALIBRATION_SCHEMA["hourly_cost"]["max"]

    def test_missing_keys_get_defaults(self):
        """Only supplied keys are used; missing ones get defaults."""
        cal = {"annual_threat_frequency": 2.0}
        result = validate_calibration(cal)
        assert result["annual_threat_frequency"] == 2.0
        assert result["hourly_cost"] == CALIBRATION_SCHEMA["hourly_cost"]["default"]

    def test_invalid_type_falls_back_to_default(self):
        """Non-numeric input falls back to default."""
        cal = {"annual_threat_frequency": "not_a_number", "hourly_cost": [100]}
        result = validate_calibration(cal)
        assert result["annual_threat_frequency"] == CALIBRATION_SCHEMA["annual_threat_frequency"]["default"]
        assert result["hourly_cost"] == CALIBRATION_SCHEMA["hourly_cost"]["default"]


# ---------------------------------------------------------------------------
# 2. compute_fair_loss
# ---------------------------------------------------------------------------

class TestComputeFairLoss:
    """Tests for the main FAIR loss computation."""

    def test_happy_path_with_all_inputs(self):
        """Full aggregation + calibration returns valid ALE."""
        cal = {"annual_threat_frequency": 0.5, "hourly_cost": 200, "team_size": 10}
        result = compute_fair_loss(aggregation=SAMPLE_AGGREGATION, calibration=cal)

        assert result["ale"] >= 0
        assert result["p10_loss"] >= 0
        assert result["p90_loss"] >= 0
        assert "calibration_inputs" in result
        assert result["calibration_inputs"]["annual_threat_frequency"] == 0.5

    def test_default_calibration(self):
        """No calibration dict uses all defaults."""
        result = compute_fair_loss(aggregation=SAMPLE_AGGREGATION)
        for key, schema in CALIBRATION_SCHEMA.items():
            assert result["calibration_inputs"][key] == schema["default"]

    def test_zero_total_outcomes_returns_zeros(self):
        """Empty outcome distribution returns all zeros."""
        agg = {"outcome_distribution": {}}
        result = compute_fair_loss(aggregation=agg)

        assert result["ale"] == 0.0
        assert result["p10_loss"] == 0.0
        assert result["p90_loss"] == 0.0

    def test_contained_early_rate_1_zero_ale(self):
        """100% contained_early means LEF = 0, therefore ALE = 0."""
        agg = {
            "outcome_distribution": {
                "contained_early": 50,
                "contained_late": 0,
                "not_contained": 0,
                "escalated": 0,
            },
            "containment_round_stats": {"mean": 2.0},
        }
        result = compute_fair_loss(aggregation=agg)

        assert result["ale"] == 0.0
        assert result["p10_loss"] == 0.0
        assert result["p90_loss"] == 0.0

    def test_all_escalated_maximum_loss(self):
        """All escalated should produce the maximum loss estimate."""
        agg_all_escalated = {
            "outcome_distribution": {
                "contained_early": 0,
                "contained_late": 0,
                "not_contained": 0,
                "escalated": 50,
            },
            "containment_round_stats": {"mean": 20.0},
        }
        agg_mixed = {
            "outcome_distribution": {
                "contained_early": 25,
                "contained_late": 10,
                "not_contained": 10,
                "escalated": 5,
            },
            "containment_round_stats": {"mean": 8.0},
        }

        result_all = compute_fair_loss(aggregation=agg_all_escalated)
        result_mixed = compute_fair_loss(aggregation=agg_mixed)

        assert result_all["ale"] > result_mixed["ale"]

    def test_p10_p90_from_per_iteration_data(self):
        """With per-iteration data, P10 and P90 are computed from the LM distribution."""
        per_iter = [
            {"outcome": "contained_early", "containment_round": 2, "total_rounds": 10},
            {"outcome": "contained_late", "containment_round": 7, "total_rounds": 10},
            {"outcome": "escalated", "containment_round": None, "total_rounds": 10},
            {"outcome": "not_contained", "containment_round": None, "total_rounds": 10},
            {"outcome": "contained_early", "containment_round": 3, "total_rounds": 10},
        ]
        result = compute_fair_loss(
            aggregation=SAMPLE_AGGREGATION,
            per_iteration_data=per_iter,
        )

        assert result["p10_loss"] <= result["ale"]
        assert result["p90_loss"] >= result["ale"]

    def test_p10_le_p90_aggregate_fallback(self):
        """Without per-iteration data, P10 < P90 from aggregate approximation."""
        result = compute_fair_loss(aggregation=SAMPLE_AGGREGATION)
        assert result["p10_loss"] <= result["p90_loss"]


# ---------------------------------------------------------------------------
# 3. _compute_iteration_lm
# ---------------------------------------------------------------------------

class TestComputeIterationLM:
    """Tests for per-iteration Loss Magnitude computation."""

    def _default_cal(self):
        return validate_calibration(None)

    def test_contained_early_lowest_loss(self):
        """contained_early has zero response cost and zero reputation damage."""
        cal = self._default_cal()
        it = {
            "outcome": "contained_early",
            "containment_round": 2,
            "total_rounds": 10,
            "first_compliance_notification_round": 3,
        }
        lm = _compute_iteration_lm(it, cal)
        assert lm >= 0
        # Should be relatively small
        assert lm < cal["incident_response_retainer"]

    def test_escalated_highest_loss(self):
        """escalated produces the highest loss magnitude."""
        cal = self._default_cal()
        it_esc = {
            "outcome": "escalated",
            "total_rounds": 10,
            "first_compliance_notification_round": None,
        }
        it_early = {
            "outcome": "contained_early",
            "containment_round": 2,
            "total_rounds": 10,
            "first_compliance_notification_round": 3,
        }
        assert _compute_iteration_lm(it_esc, cal) > _compute_iteration_lm(it_early, cal)

    def test_no_compliance_notification_worst_case_regulatory(self):
        """No compliance notification means regulatory = penalty * 0.5."""
        cal = self._default_cal()
        it = {
            "outcome": "not_contained",
            "total_rounds": 10,
            "first_compliance_notification_round": None,
        }
        lm = _compute_iteration_lm(it, cal)
        # Must include regulatory component
        assert lm >= cal["regulatory_penalty"] * 0.5

    def test_early_compliance_notification_no_penalty(self):
        """Compliance notification before regulatory window means 0 penalty."""
        cal = self._default_cal()
        # compliance_round < regulatory_window_rounds => delay_ratio = max(0, negative) = 0
        it = {
            "outcome": "contained_early",
            "containment_round": 2,
            "total_rounds": 10,
            "first_compliance_notification_round": 1,
        }
        lm = _compute_iteration_lm(it, cal)
        # With early containment + early compliance, loss should be minimal
        # (only productivity component)
        expected_productivity = 2 * cal["hourly_cost"] * cal["team_size"]
        assert lm == expected_productivity  # 0 response + 0 regulatory + 0 reputation

    def test_lm_always_non_negative(self):
        """Loss magnitude should never be negative."""
        cal = self._default_cal()
        for outcome in ("contained_early", "contained_late", "not_contained", "escalated"):
            it = {"outcome": outcome, "total_rounds": 10}
            assert _compute_iteration_lm(it, cal) >= 0
