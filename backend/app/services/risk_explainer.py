"""Risk Explainer — driver attribution via stratified comparison.

Identifies the top behavioral drivers of risk score by splitting
MC iterations into groups based on behavior presence/absence and
comparing mean scores.

Zero LLM calls. Template-based descriptions.
"""
from statistics import mean


# Maximum candidate divergence points to evaluate
MAX_CANDIDATES = 10

# Minimum iterations per group for reportable driver
MIN_GROUP_SIZE = 3


def compute_drivers(
    per_iteration_scores: list[float],
    per_iteration_data: list[dict],
    divergence_points: list[dict],
    dimension_weights: dict | None = None,
) -> list[dict]:
    """Compute top risk drivers via stratified comparison.

    Args:
        per_iteration_scores: Composite score per MC iteration
        per_iteration_data: Per-iteration results with actions, outcomes, etc.
        divergence_points: From MC aggregation, sorted by entropy (highest first)
        dimension_weights: Optional dimension weights for scaling

    Returns:
        List of top 5 drivers, each: {description, evidence, impact, correlation}
    """
    if not per_iteration_scores or not per_iteration_data or not divergence_points:
        return []

    if len(per_iteration_scores) != len(per_iteration_data):
        return []

    # Take top MAX_CANDIDATES divergence points by entropy (already sorted)
    candidates = divergence_points[:MAX_CANDIDATES]

    drivers = []
    for dp in candidates:
        driver = _evaluate_divergence_point(
            dp, per_iteration_scores, per_iteration_data
        )
        if driver is not None:
            drivers.append(driver)

    # Sort by absolute impact, take top 5
    drivers.sort(key=lambda d: abs(d["impact"]), reverse=True)
    return drivers[:5]


def _evaluate_divergence_point(
    dp: dict,
    scores: list[float],
    iterations: list[dict],
) -> dict | None:
    """Evaluate a single divergence point as a potential driver.

    Splits iterations by whether the agent's most common action occurred,
    computes mean score for each group, and returns the driver if
    both groups meet minimum size.
    """
    target_round = dp.get("round", 0)
    target_agent = dp.get("agent", "")
    action_dist = dp.get("action_distribution", {})

    if not action_dist:
        return None

    # Find the dominant action (most common across iterations)
    dominant_action = max(action_dist, key=action_dist.get)

    # Split iterations: those where agent took dominant action vs didn't
    group_with = []
    group_without = []

    for i, it in enumerate(iterations):
        if i >= len(scores):
            break

        agent_actions = _get_agent_actions_at_round(it, target_agent, target_round)

        if dominant_action in agent_actions:
            group_with.append(scores[i])
        else:
            group_without.append(scores[i])

    # Check minimum group sizes
    if len(group_with) < MIN_GROUP_SIZE or len(group_without) < MIN_GROUP_SIZE:
        return None

    # Compute impact as difference in means
    mean_with = mean(group_with)
    mean_without = mean(group_without)
    impact = mean_with - mean_without

    # Determine which group is "better"
    total = len(group_with) + len(group_without)
    pct_with = len(group_with) / total * 100

    # Generate template-based description
    if impact > 0:
        direction = "positively"
        outcome_desc = "higher containment rates"
    else:
        direction = "negatively"
        outcome_desc = "lower containment rates"

    description = (
        f"{target_agent} action '{dominant_action}' at round {target_round}"
    )

    evidence = (
        f"In {pct_with:.0f}% of iterations, {target_agent} took "
        f"'{dominant_action}' at round {target_round}. "
        f"Mean score with action: {mean_with:.1f}, without: {mean_without:.1f}."
    )

    correlation = (
        f"This action {direction} correlated with {outcome_desc} "
        f"(score delta: {abs(impact):.1f} points)."
    )

    return {
        "description": description,
        "evidence": evidence,
        "impact": round(impact, 1),
        "correlation": correlation,
    }


def _get_agent_actions_at_round(
    iteration: dict, agent: str, round_num: int
) -> list[str]:
    """Extract action names for an agent at a specific round from iteration data."""
    actions = iteration.get("actions", [])
    result = []
    for action in actions:
        if (action.get("agent", "") == agent and
            action.get("round", -1) == round_num):
            action_name = action.get("action", "") or action.get("action_name", "")
            if action_name:
                result.append(action_name)
    return result
