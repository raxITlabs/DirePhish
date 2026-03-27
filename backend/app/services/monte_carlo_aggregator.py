"""
Monte Carlo aggregator for simulation batch results.

Analyzes results across Monte Carlo simulation iterations to produce
statistical summaries: outcome distributions, containment timing,
decision divergence, agent consistency, and cost projections.
"""

import math
import re
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from ..utils.logger import get_logger

logger = get_logger("monte_carlo_aggregator")

# ---------------------------------------------------------------------------
# Keywords used to classify iteration outcomes
# ---------------------------------------------------------------------------
CONTAINMENT_KEYWORDS = re.compile(
    r"\b(isolat|contain|block|quarantin|lockdown|shut\s*down|revok|suspend|kill)\w*\b",
    re.IGNORECASE,
)
ESCALATION_KEYWORDS = re.compile(
    r"\b(exfiltrat|ransom|encrypt|deploy\s*payload|lateral\s*mov|data\s*leak)\w*\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------
@dataclass
class IterationResult:
    """Output of a single Monte Carlo iteration."""

    iteration_id: str
    seed: int
    total_rounds: int
    total_actions: int
    actions: list[dict]          # rows from actions.jsonl
    summary: dict                # contents of summary.json
    cost_usd: float
    variation_description: str
    completed_at: str
    output_dir: str


@dataclass
class ContainmentRoundStats:
    mean: float
    median: float
    std: float
    min: int
    max: int
    histogram: dict[int, int]


@dataclass
class DivergencePoint:
    round: int
    agent: str
    divergence_score: float
    action_distribution: dict[str, int]


@dataclass
class CostSummary:
    total_usd: float
    per_iteration_avg: float
    min_usd: float
    max_usd: float


@dataclass
class CostExtrapolation:
    observed_iterations: int
    per_iteration_avg: float
    estimates: dict[int, float]   # {10: $x, 50: $y, 100: $z}


@dataclass
class PerIterationResult:
    """Cached per-iteration classification for risk scoring."""

    iteration_id: str
    outcome: str                    # contained_early, contained_late, escalated, not_contained
    containment_round: int | None
    total_rounds: int
    total_actions: int
    actions: list[dict]             # raw action records
    first_alert_round: int | None   # round of first detection/alert action
    first_compliance_notification_round: int | None  # round of first compliance/legal action
    cross_channel_messages: int     # messages across multiple worlds
    total_messages: int             # total messages
    consistency_score: float        # agent consistency for this iteration


@dataclass
class BatchAggregation:
    """Full statistical summary of a Monte Carlo batch."""

    iteration_count: int
    outcome_distribution: dict[str, int]
    containment_round_stats: ContainmentRoundStats | None
    decision_divergence_points: list[DivergencePoint]
    agent_consistency: dict[str, float]
    cost_summary: CostSummary
    cost_extrapolation: CostExtrapolation
    per_iteration_results: list[PerIterationResult] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _action_text(action: dict) -> str:
    """Extract searchable text from an action record."""
    parts: list[str] = []
    parts.append(action.get("action", ""))
    args = action.get("args", {})
    if isinstance(args, dict):
        for v in args.values():
            if isinstance(v, str):
                parts.append(v)
    result = action.get("result", {})
    if isinstance(result, dict):
        for v in result.values():
            if isinstance(v, str):
                parts.append(v)
    return " ".join(parts)


def classify_iteration(result: IterationResult) -> tuple[str, int | None]:
    """Classify an iteration outcome and return (label, containment_round|None)."""
    containment_round: int | None = None
    has_escalation = False
    midpoint = result.total_rounds / 2.0

    for action in result.actions:
        text = _action_text(action)
        rnd = action.get("round", 0)

        if ESCALATION_KEYWORDS.search(text):
            has_escalation = True

        if containment_round is None and CONTAINMENT_KEYWORDS.search(text):
            containment_round = rnd

    if has_escalation and containment_round is None:
        return "escalated", None
    if containment_round is not None:
        label = "contained_early" if containment_round <= midpoint else "contained_late"
        return label, containment_round
    return "not_contained", None


def _shannon_entropy(counts: Counter) -> float:
    """Shannon entropy (bits) of a frequency distribution."""
    total = sum(counts.values())
    if total == 0:
        return 0.0
    entropy = 0.0
    for c in counts.values():
        if c > 0:
            p = c / total
            entropy -= p * math.log2(p)
    return entropy


def _safe_stdev(values: list[float | int]) -> float:
    """Return stdev, or 0.0 when there are fewer than 2 data points."""
    if len(values) < 2:
        return 0.0
    return statistics.stdev(values)


# ---------------------------------------------------------------------------
# Main aggregation
# ---------------------------------------------------------------------------

def aggregate_batch(results: list[IterationResult]) -> BatchAggregation:
    """Aggregate a list of Monte Carlo iteration results into a BatchAggregation."""
    if not results:
        raise ValueError("Cannot aggregate an empty results list")

    # Try to get system criticality scores from knowledge graph
    system_scores = {}
    try:
        if results and results[0].actions:
            sim_id = results[0].actions[0].get("simulation_id", "")
            project_id = sim_id.replace("_sim", "").rsplit("_scenario", 1)[0] if sim_id else ""
            if project_id:
                from .graph_context import GraphContext
                system_scores = GraphContext(project_id).system_criticality()
    except Exception:
        pass

    n = len(results)
    logger.info("Aggregating %d Monte Carlo iterations", n)

    # ----- 1. Outcome distribution ----------------------------------------
    outcome_counts: dict[str, int] = {
        "contained_early": 0,
        "contained_late": 0,
        "not_contained": 0,
        "escalated": 0,
    }
    containment_rounds: list[int] = []
    per_iter_results: list[PerIterationResult] = []

    for r in results:
        label, c_round = classify_iteration(r)
        outcome_counts[label] += 1
        if c_round is not None:
            containment_rounds.append(c_round)

        # Cache per-iteration data for risk scoring
        first_alert = None
        first_compliance = None
        worlds_seen: set[str] = set()
        total_msgs = 0
        for act in r.actions:
            rnd = act.get("round", 0)
            action_text = _action_text(act)
            world = act.get("world", "")
            total_msgs += 1
            if world:
                worlds_seen.add(world)
            if first_alert is None and CONTAINMENT_KEYWORDS.search(action_text):
                first_alert = rnd
            if first_compliance is None and re.search(
                r"\b(legal|compliance|regulat|notif|report\s+breach)\w*\b",
                action_text,
                re.IGNORECASE,
            ):
                first_compliance = rnd

        cross_channel = total_msgs if len(worlds_seen) > 1 else 0

        per_iter_results.append(
            PerIterationResult(
                iteration_id=r.iteration_id,
                outcome=label,
                containment_round=c_round,
                total_rounds=r.total_rounds,
                total_actions=r.total_actions,
                actions=r.actions,
                first_alert_round=first_alert,
                first_compliance_notification_round=first_compliance,
                cross_channel_messages=cross_channel,
                total_messages=total_msgs,
                consistency_score=0.0,  # filled after agent consistency computed
            )
        )

    # ----- 2. Containment round stats -------------------------------------
    containment_stats: ContainmentRoundStats | None = None
    if containment_rounds:
        histogram = dict(Counter(containment_rounds))
        containment_stats = ContainmentRoundStats(
            mean=statistics.mean(containment_rounds),
            median=statistics.median(containment_rounds),
            std=_safe_stdev(containment_rounds),
            min=min(containment_rounds),
            max=max(containment_rounds),
            histogram=dict(sorted(histogram.items())),
        )

    # ----- 3. Decision divergence points ----------------------------------
    # Build: (round, agent) -> Counter of action names across iterations
    round_agent_actions: dict[tuple[int, str], Counter] = defaultdict(Counter)
    for r in results:
        for act in r.actions:
            rnd = act.get("round", 0)
            agent = act.get("agent", "unknown")
            action_name = act.get("action", "unknown")
            round_agent_actions[(rnd, agent)][action_name] += 1

    divergence_entries: list[DivergencePoint] = []
    for (rnd, agent), counter in round_agent_actions.items():
        entropy = _shannon_entropy(counter)
        if entropy > 0:
            divergence_entries.append(
                DivergencePoint(
                    round=rnd,
                    agent=agent,
                    divergence_score=round(entropy, 4),
                    action_distribution=dict(counter),
                )
            )

    divergence_entries.sort(key=lambda d: d.divergence_score, reverse=True)
    top_divergence = divergence_entries[:5]

    # ----- 4. Agent consistency -------------------------------------------
    # Per agent: for each (round, world) slot, how consistent is the action?
    # Consistency = average (max_freq / total) across all slots
    agent_slot_actions: dict[str, dict[tuple[int, str], Counter]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    for r in results:
        for act in r.actions:
            agent = act.get("agent", "unknown")
            rnd = act.get("round", 0)
            world = act.get("world", "unknown")
            action_name = act.get("action", "unknown")
            agent_slot_actions[agent][(rnd, world)][action_name] += 1

    agent_consistency: dict[str, float] = {}
    for agent, slots in agent_slot_actions.items():
        consistencies: list[float] = []
        for counter in slots.values():
            total = sum(counter.values())
            if total > 0:
                most_common_count = counter.most_common(1)[0][1]
                consistencies.append(most_common_count / total)
        if consistencies:
            agent_consistency[agent] = round(statistics.mean(consistencies), 4)
        else:
            agent_consistency[agent] = 0.0

    # ----- 4b. Backfill per-iteration consistency scores -------------------
    # Use overall agent consistency mean as proxy per iteration
    if agent_consistency:
        avg_consistency = statistics.mean(agent_consistency.values())
        for pir in per_iter_results:
            pir.consistency_score = avg_consistency

    # ----- 5. Cost summary ------------------------------------------------
    costs = [r.cost_usd for r in results]
    cost_summary = CostSummary(
        total_usd=round(sum(costs), 6),
        per_iteration_avg=round(statistics.mean(costs), 6),
        min_usd=round(min(costs), 6),
        max_usd=round(max(costs), 6),
    )

    # ----- 6. Cost extrapolation ------------------------------------------
    avg_cost = cost_summary.per_iteration_avg
    targets = [10, 50, 100]
    estimates = {t: round(avg_cost * t, 4) for t in targets}
    cost_extrapolation = CostExtrapolation(
        observed_iterations=n,
        per_iteration_avg=avg_cost,
        estimates=estimates,
    )

    return BatchAggregation(
        iteration_count=n,
        outcome_distribution=outcome_counts,
        containment_round_stats=containment_stats,
        decision_divergence_points=top_divergence,
        agent_consistency=agent_consistency,
        cost_summary=cost_summary,
        cost_extrapolation=cost_extrapolation,
        per_iteration_results=per_iter_results,
    )
