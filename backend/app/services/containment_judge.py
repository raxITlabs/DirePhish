"""
Containment judge for Monte Carlo iteration classification.

Replaces pure keyword matching with LLM-as-a-judge evaluation.
Falls back to keyword matching when no LLM is provided or on failure.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from ..utils.logger import get_logger

if TYPE_CHECKING:
    from ..utils.cost_tracker import CostTracker
    from ..utils.llm_client import LLMClient

logger = get_logger("containment_judge")

CONTAINMENT_KEYWORDS = re.compile(
    r"\b(isolat|contain|block|quarantin|lockdown|shut\s*down|revok|suspend|kill)\w*\b",
    re.IGNORECASE,
)
ESCALATION_KEYWORDS = re.compile(
    r"\b(exfiltrat|ransom|encrypt|deploy\s*payload|lateral\s*mov|data\s*leak)\w*\b",
    re.IGNORECASE,
)

VALID_OUTCOMES = {"contained_early", "contained_late", "escalated", "not_contained"}


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


def classify_iteration_keyword(result) -> tuple[str, int | None]:
    """Classify iteration outcome using keyword matching (fallback)."""
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


def build_round_digest(result) -> str:
    """Build a condensed round-level digest of an iteration's actions.

    Produces ~1-2K tokens summarizing what happened each round:
    injects, arbiter decisions, agent actions (who/where/what).
    """
    rounds: dict[int, list[dict]] = {}
    for action in result.actions:
        rnd = action.get("round", 0)
        rounds.setdefault(rnd, []).append(action)

    total_rounds = result.total_rounds or max(rounds.keys(), default=0)
    lines: list[str] = []

    ad = result.summary.get("adaptive_depth") if result.summary else None
    if ad and ad.get("enabled"):
        stop_round = ad.get("stopped_at_round")
        stop_reason = ad.get("stop_reason")
        if stop_round:
            lines.append(
                f"[ADAPTIVE DEPTH] Simulation stopped at round {stop_round}"
                f" (of {total_rounds}). Arbiter reason: {stop_reason or 'unknown'}"
            )
            lines.append("")

    for rnd_num in sorted(rounds.keys()):
        rnd_actions = rounds[rnd_num]
        lines.append(f"ROUND {rnd_num} (of {total_rounds}):")

        for act in rnd_actions:
            act_type = act.get("type", "")

            if act_type == "inject":
                desc = act.get("description", "unknown event")
                lines.append(f"  [INJECT] {desc}")
            elif act_type == "arbiter":
                decision = act.get("decision", "?")
                reason = act.get("reason", "")
                complication = act.get("complication")
                line = f"  [ARBITER] {decision}"
                if reason:
                    line += f" -- {reason[:120]}"
                if complication:
                    line += f" | Complication injected: {complication[:100]}"
                lines.append(line)
            else:
                agent = act.get("agent", "?")
                role = act.get("role", "")
                world = act.get("world", "?")
                action_name = act.get("action", "?")

                content = ""
                args = act.get("args", {})
                if isinstance(args, dict):
                    content = args.get("content", "") or args.get("message", "") or ""
                if content:
                    content = f": {content[:100]}"

                role_str = f" ({role})" if role else ""
                lines.append(f"  {agent}{role_str} [{world}] {action_name}{content}")

        lines.append("")

    return "\n".join(lines)


_JUDGE_PROMPT_TEMPLATE = """You are a cybersecurity incident response evaluator. Analyze this simulation transcript and classify the OUTCOME of the defenders' response.

SIMULATION:
- Rounds: {total_rounds}, Actions: {total_actions}
- Agents: {agents_list}
{adaptive_depth_context}

TRANSCRIPT:
{digest}

CLASSIFICATION TASK:
Determine whether the defenders ACTUALLY CONTAINED the threat, not just whether they ATTEMPTED containment. A containment attempt that the attacker subsequently bypasses is NOT successful containment.

Consider:
1. Did defenders successfully neutralize the attacker's access or persistence?
2. Did the attacker continue to operate AFTER defender containment actions?
3. Did attacker activity cease or become ineffective after a specific round?
4. Were there escalation events (exfiltration, ransomware, lateral movement) that were NOT stopped?

Classify as EXACTLY ONE of:
- "contained_early": Effective containment in first half (round <= {midpoint}). Attacker genuinely stopped.
- "contained_late": Effective containment in second half (round > {midpoint}). Attacker eventually stopped.
- "escalated": Attacker achieved significant objectives despite defender actions.
- "not_contained": No clear containment. Ambiguous outcome or attacker maintained presence.

Return ONLY valid JSON:
{{"outcome": "...", "containment_round": <int or null>, "confidence": <0.0-1.0>, "reasoning": "2-3 sentences"}}"""


def classify_iteration_llm(
    result,
    llm: LLMClient,
    cost_tracker: CostTracker | None = None,
) -> tuple[str, int | None, dict]:
    """Classify iteration outcome using LLM-as-a-judge.

    Returns (label, containment_round, metadata).
    Falls back to keyword classification on any failure.
    """
    meta: dict = {"fallback": False, "judge_model": getattr(llm, "model", "unknown")}

    try:
        digest = build_round_digest(result)

        # Extract agent list
        agents_seen: dict[str, str] = {}
        for act in result.actions:
            agent = act.get("agent", "")
            role = act.get("role", "")
            if agent and agent not in agents_seen:
                agents_seen[agent] = role
        agents_list = ", ".join(
            f"{a} ({r})" if r else a for a, r in agents_seen.items()
        ) or "unknown"

        # Adaptive depth context
        ad = result.summary.get("adaptive_depth") if result.summary else None
        adaptive_ctx = ""
        if ad and ad.get("enabled"):
            stop_round = ad.get("stopped_at_round")
            stop_reason = ad.get("stop_reason")
            if stop_round:
                adaptive_ctx = (
                    f"- Adaptive depth: simulation stopped at round {stop_round}."
                    f" Arbiter reason: {stop_reason or 'unknown'}"
                )

        midpoint = result.total_rounds / 2.0
        prompt = _JUDGE_PROMPT_TEMPLATE.format(
            total_rounds=result.total_rounds,
            total_actions=result.total_actions,
            agents_list=agents_list,
            adaptive_depth_context=adaptive_ctx,
            digest=digest,
            midpoint=int(midpoint),
        )

        response = llm.chat_json(
            [{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=512,
        )

        # Track cost
        if cost_tracker and llm.last_usage:
            cost_tracker.track_llm(
                "mc_judge",
                llm.model,
                llm.last_usage["input_tokens"],
                llm.last_usage["output_tokens"],
                f"judge_{result.iteration_id}",
                cached_tokens=llm.last_usage.get("cached_tokens", 0),
            )

        # Validate response
        outcome = response.get("outcome", "")
        if outcome not in VALID_OUTCOMES:
            logger.warning(
                "Judge returned invalid outcome %r for %s, falling back to keyword",
                outcome, result.iteration_id,
            )
            label, c_round = classify_iteration_keyword(result)
            meta["fallback"] = True
            return label, c_round, meta

        c_round = response.get("containment_round")
        if c_round is not None:
            c_round = int(c_round)

        meta["confidence"] = response.get("confidence", 0.0)
        meta["reasoning"] = response.get("reasoning", "")
        return outcome, c_round, meta

    except Exception as e:
        logger.warning(
            "Judge failed for %s: %s — falling back to keyword",
            result.iteration_id, e,
        )
        label, c_round = classify_iteration_keyword(result)
        meta["fallback"] = True
        return label, c_round, meta
