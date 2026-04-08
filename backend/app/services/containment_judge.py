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
