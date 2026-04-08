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
