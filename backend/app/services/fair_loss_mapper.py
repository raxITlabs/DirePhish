"""FAIR Loss Mapper — maps simulation outcomes to dollar figures.

Uses Factor Analysis of Information Risk (FAIR) methodology to compute
Annualized Loss Expectancy (ALE) from MC iteration data.

Zero LLM calls. Pure computation.
"""
from statistics import mean


# Calibration input ranges and defaults
CALIBRATION_SCHEMA = {
    "annual_threat_frequency": {"min": 0.01, "max": 10.0, "default": 0.3},
    "hourly_cost": {"min": 50, "max": 1000, "default": 150},
    "team_size": {"min": 2, "max": 50, "default": 8},
    "incident_response_retainer": {"min": 10_000, "max": 5_000_000, "default": 250_000},
    "regulatory_penalty": {"min": 0, "max": 100_000_000, "default": 1_000_000},
    "estimated_customer_impact": {"min": 0, "max": 50_000_000, "default": 500_000},
    "regulatory_window_rounds": {"min": 1, "max": 50, "default": 15},
}


def validate_calibration(calibration: dict | None) -> dict:
    """Validate calibration inputs and apply defaults for missing values.

    Clamps values to valid ranges. Returns cleaned calibration dict.
    """
    result = {}
    cal = calibration or {}
    for key, schema in CALIBRATION_SCHEMA.items():
        val = cal.get(key, schema["default"])
        if not isinstance(val, (int, float)):
            val = schema["default"]
        val = max(schema["min"], min(schema["max"], val))
        result[key] = val
    return result


def compute_fair_loss(
    aggregation: dict,
    calibration: dict | None = None,
    per_iteration_data: list[dict] | None = None,
) -> dict:
    """Compute FAIR loss estimates from MC aggregation data.

    Args:
        aggregation: MC batch aggregation with outcome_distribution
        calibration: User-configurable FAIR inputs (optional, defaults applied)
        per_iteration_data: Per-iteration results for LM distribution

    Returns:
        {ale, p10_loss, p90_loss, calibration_inputs}
    """
    cal = validate_calibration(calibration)

    outcome = aggregation.get("outcome_distribution", {})
    total = sum(outcome.values())

    if total == 0:
        return {
            "ale": 0.0,
            "p10_loss": 0.0,
            "p90_loss": 0.0,
            "calibration_inputs": cal,
        }

    # LEF = annual_threat_frequency × loss_probability
    # Even contained incidents have a cost (team mobilization, investigation, regulatory overhead).
    # Full containment reduces severity but doesn't eliminate the event.
    contained_early_rate = outcome.get("contained_early", 0) / total
    contained_late_rate = outcome.get("contained_late", 0) / total
    escalated_rate = outcome.get("escalated", 0) / total
    # Weight: early containment = 0.15 loss event, late = 0.5, escalated = 1.0
    loss_probability = (contained_early_rate * 0.15) + (contained_late_rate * 0.5) + (escalated_rate * 1.0)
    # Ensure a minimum — any incident attempt has some cost
    loss_probability = max(loss_probability, 0.1)
    lef = cal["annual_threat_frequency"] * loss_probability

    # Compute LM per iteration if we have per-iteration data
    if per_iteration_data and len(per_iteration_data) > 0:
        lm_values = []
        for it in per_iteration_data:
            lm = _compute_iteration_lm(it, cal)
            lm_values.append(lm)

        mean_lm = mean(lm_values)
        lm_values_sorted = sorted(lm_values)
        p10_idx = max(0, int(len(lm_values_sorted) * 0.10))
        p90_idx = min(len(lm_values_sorted) - 1, int(len(lm_values_sorted) * 0.90))

        ale = lef * mean_lm
        p10_loss = lef * lm_values_sorted[p10_idx]
        p90_loss = lef * lm_values_sorted[p90_idx]
    else:
        # Fallback: estimate from aggregate stats
        stats = aggregation.get("containment_round_stats", {})
        avg_rounds = stats.get("mean", 10)
        escalation_rate = outcome.get("escalated", 0) / total

        productivity = avg_rounds * cal["hourly_cost"] * cal["team_size"]
        response = cal["incident_response_retainer"] * escalation_rate
        regulatory = cal["regulatory_penalty"] * 0.3  # rough estimate
        reputation = cal["estimated_customer_impact"] * escalation_rate

        mean_lm = productivity + response + regulatory + reputation
        ale = lef * mean_lm
        # Without per-iteration data, approximate P10/P90
        p10_loss = ale * 0.3
        p90_loss = ale * 2.5

    return {
        "ale": round(ale, 2),
        "p10_loss": round(p10_loss, 2),
        "p90_loss": round(p90_loss, 2),
        "calibration_inputs": cal,
    }


def _compute_iteration_lm(iteration: dict, cal: dict) -> float:
    """Compute Loss Magnitude for a single MC iteration.

    Even successful containment has real costs:
    - The IR team is pulled off normal business tasks for the duration
    - Systems may be isolated, deployments frozen, access revoked
    - Post-incident forensics, report writing, and policy updates
    - Opportunity cost of engineering time spent on incident

    LM = defender_cost + response_cost + business_disruption + regulatory + reputation
    """
    containment_rounds = iteration.get("containment_round") or iteration.get("total_rounds", 10)
    total_rounds = iteration.get("total_rounds", 10) or 10
    total_actions = iteration.get("total_actions", 0)
    outcome = iteration.get("outcome", "not_contained")
    compliance_round = iteration.get("first_compliance_notification_round")

    # 1. Defender productivity loss — team is working the incident, not their normal jobs
    #    Every round of response = team × hourly cost pulled from BAU
    defender_cost = total_rounds * cal["hourly_cost"] * cal["team_size"]

    # 2. Business disruption — systems isolated, deployments frozen during response
    #    Proportional to how many rounds the incident ran (even if contained)
    #    Baseline: 2x hourly cost per round for broader org impact
    disruption_multiplier = 2.0 if outcome == "escalated" else 1.0 if outcome == "contained_late" else 0.5
    business_disruption = total_rounds * cal["hourly_cost"] * disruption_multiplier

    # 3. IR response cost — formal incident response engagement
    if outcome == "escalated":
        response = cal["incident_response_retainer"] * 1.0
    elif outcome == "contained_late":
        response = cal["incident_response_retainer"] * 0.3
    elif outcome == "contained_early":
        response = cal["incident_response_retainer"] * 0.1  # mobilization + triage
    else:  # not_contained
        response = cal["incident_response_retainer"] * 0.5

    # 4. Post-incident overhead — forensics, lessons learned, policy updates
    #    Always incurred regardless of outcome. Scales with action count.
    post_incident = cal["hourly_cost"] * cal["team_size"] * max(2, total_actions / 20)

    # 5. Regulatory — based on notification timing
    regulatory_window = cal["regulatory_window_rounds"]
    if compliance_round is not None:
        delay_ratio = max(0, (compliance_round - regulatory_window) / total_rounds)
        regulatory = cal["regulatory_penalty"] * delay_ratio
    else:
        regulatory = cal["regulatory_penalty"] * 0.5

    # 6. Reputation damage — proportional to escalation
    if outcome == "escalated":
        reputation = cal["estimated_customer_impact"]
    elif outcome in ("not_contained", "contained_late"):
        reputation = cal["estimated_customer_impact"] * 0.2
    else:
        reputation = 0.0  # contained early = no public impact

    return defender_cost + business_disruption + response + post_incident + regulatory + reputation
