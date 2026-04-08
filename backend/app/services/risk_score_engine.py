"""
Risk Score Engine — pure computation, zero LLM calls.

Computes a composite risk score (0-100) from MC aggregation data
and exercise report resilience dimensions.
"""

import hashlib
import random
from statistics import mean


# ---------------------------------------------------------------------------
# Dimension weights
# ---------------------------------------------------------------------------
DIMENSIONS = {
    "detection_speed": 0.20,
    "containment_effectiveness": 0.25,
    "communication_quality": 0.15,
    "decision_consistency": 0.15,
    "compliance_adherence": 0.10,
    "escalation_resistance": 0.15,
}

# ---------------------------------------------------------------------------
# Score interpretation tiers
# ---------------------------------------------------------------------------
INTERPRETATION = [
    (30, "Critical", "Severe response coordination failures"),
    (50, "Poor", "Significant gaps in incident response"),
    (70, "Moderate", "Functional but with notable weaknesses"),
    (85, "Good", "Solid response capability with minor gaps"),
    (100, "Excellent", "Strong, coordinated incident response"),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def interpret_score(score: float) -> dict:
    """Return {tier, label, description} for a composite score."""
    for threshold, label, description in INTERPRETATION:
        if score <= threshold:
            return {"tier": label.lower(), "label": label, "description": description}
    return {"tier": "excellent", "label": "Excellent", "description": INTERPRETATION[-1][2]}


def compute_composite_score(
    aggregation: dict,
    resilience: dict | None = None,
    per_iteration_data: list[dict] | None = None,
    batch_id: str = "",
) -> dict:
    """Compute composite risk score from MC aggregation + resilience data.

    Args:
        aggregation: MC batch aggregation with outcome_distribution,
                     containment_round_stats, decision_divergence_points,
                     agent_consistency.
        resilience: From exercise report {overall, dimensions:
                    {detection_speed, ...}}.
        per_iteration_data: List of per-iteration results for CI computation.
        batch_id: MC batch ID for deterministic CI seed.

    Returns:
        {composite_score, dimensions, confidence_interval, confidence_flag,
         interpretation}
    """
    outcome = aggregation.get("outcome_distribution", {})
    total = sum(outcome.values())
    if total == 0:
        return {
            "composite_score": 0.0,
            "dimensions": {k: 0.0 for k in DIMENSIONS},
            "confidence_interval": {"lower": 0.0, "upper": 0.0},
            "confidence_flag": "low",
            "interpretation": interpret_score(0.0),
        }

    dims: dict[str, float] = {}

    # Detection Speed (20%) — from resilience or 50 as fallback
    if resilience and resilience.get("dimensions", {}).get("detection_speed") is not None:
        dims["detection_speed"] = float(resilience["dimensions"]["detection_speed"])
    else:
        dims["detection_speed"] = 50.0  # neutral fallback

    # Containment Effectiveness (25%) — from outcome_distribution + stats
    early = outcome.get("contained_early", 0)
    late = outcome.get("contained_late", 0)
    stats = aggregation.get("containment_round_stats") or {}
    std = stats.get("std", 0)
    max_rounds = stats.get("max", 1) or 1
    base = (early * 1.0 + late * 0.5) / total * 100
    dims["containment_effectiveness"] = base * (1 - min(std / max_rounds, 1.0))

    # Communication Quality (15%) — from resilience or 50 as fallback
    if resilience and resilience.get("dimensions", {}).get("communication_quality") is not None:
        dims["communication_quality"] = float(resilience["dimensions"]["communication_quality"])
    else:
        dims["communication_quality"] = 50.0

    # Decision Consistency (15%) — from agent_consistency
    consistency = aggregation.get("agent_consistency", {})
    if consistency:
        dims["decision_consistency"] = mean(consistency.values()) * 100
    else:
        dims["decision_consistency"] = 50.0

    # Compliance Adherence (10%) — from resilience or 50 as fallback
    if resilience and resilience.get("dimensions", {}).get("compliance_adherence") is not None:
        dims["compliance_adherence"] = float(resilience["dimensions"]["compliance_adherence"])
    else:
        dims["compliance_adherence"] = 50.0

    # Escalation Resistance (15%) — from outcome_distribution
    escalated = outcome.get("escalated", 0)
    dims["escalation_resistance"] = (1 - escalated / total) * 100

    # Clamp all dimensions to 0-100
    for k in dims:
        dims[k] = max(0.0, min(100.0, dims[k]))

    # Composite score
    composite = sum(dims[k] * DIMENSIONS[k] for k in DIMENSIONS)
    composite = max(0.0, min(100.0, composite))

    # Confidence interval from per-iteration data
    ci = {"lower": composite, "upper": composite}
    iterations = aggregation.get("iteration_count", 0)
    if per_iteration_data and len(per_iteration_data) >= 2:
        per_iter_scores = []
        for it in per_iteration_data:
            score = _compute_per_iteration_score(it, aggregation)
            per_iter_scores.append(score)
        ci = _bootstrap_ci(per_iter_scores, batch_id)

    confidence_flag = "high" if iterations >= 25 else "low"

    return {
        "composite_score": round(composite, 1),
        "dimensions": {k: round(v, 1) for k, v in dims.items()},
        "confidence_interval": {"lower": round(ci["lower"], 1), "upper": round(ci["upper"], 1)},
        "confidence_flag": confidence_flag,
        "interpretation": interpret_score(composite),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_per_iteration_score(iteration: dict, aggregation: dict) -> float:
    """Compute composite score for a single iteration using proxy metrics."""
    total_rounds = iteration.get("total_rounds", 1) or 1

    # Detection speed proxy
    first_alert = iteration.get("first_alert_round")
    if first_alert is not None:
        detection = (1 - first_alert / total_rounds) * 100
    else:
        detection = 50.0

    # Containment effectiveness — binary per iteration
    outcome = iteration.get("outcome", "not_contained")
    if outcome == "contained_early":
        containment = 100.0
    elif outcome == "contained_late":
        containment = 50.0
    elif outcome == "escalated":
        containment = 0.0
    else:
        containment = 25.0

    # Communication proxy
    cross_channel = iteration.get("cross_channel_messages", 0)
    total_messages = iteration.get("total_messages", 1) or 1
    communication = (cross_channel / total_messages) * 100

    # Decision consistency per iteration
    consistency_score = iteration.get("consistency_score", 0.5)
    consistency = consistency_score * 100

    # Compliance proxy
    first_compliance = iteration.get("first_compliance_notification_round")
    if first_compliance is not None:
        compliance = (1 - first_compliance / total_rounds) * 100
    else:
        compliance = 0.0  # never notified

    # Escalation resistance — binary per iteration
    escalation = 0.0 if outcome == "escalated" else 100.0

    dims = {
        "detection_speed": max(0, min(100, detection)),
        "containment_effectiveness": containment,
        "communication_quality": max(0, min(100, communication)),
        "decision_consistency": max(0, min(100, consistency)),
        "compliance_adherence": max(0, min(100, compliance)),
        "escalation_resistance": escalation,
    }

    return sum(dims[k] * DIMENSIONS[k] for k in DIMENSIONS)


def _bootstrap_ci(scores: list[float], batch_id: str, n_resamples: int = 10000) -> dict:
    """Deterministic bootstrap CI using SHA-256 seed from batch_id."""
    if len(scores) < 2:
        s = scores[0] if scores else 0.0
        return {"lower": s, "upper": s}

    seed = int.from_bytes(hashlib.sha256(batch_id.encode()).digest()[:8], "big")
    rng = random.Random(seed)

    n = len(scores)
    means = []
    for _ in range(n_resamples):
        sample = [rng.choice(scores) for _ in range(n)]
        means.append(mean(sample))

    means.sort()
    lower_idx = int(n_resamples * 0.025)
    upper_idx = int(n_resamples * 0.975)

    return {
        "lower": means[lower_idx],
        "upper": means[upper_idx],
    }
