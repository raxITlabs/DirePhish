"""``after_model_callback`` for token + dollar cost tracking.

Wired to every ``LlmAgent`` (defenders, adversary, judge) so any model
call routes through ``CostTracker.track_llm``. The agent name becomes
the ``phase`` so per-persona costs roll up cleanly in
``CostTracker.summary``.

This is the *only* DirePhish-side cost accounting once W2 completes —
the legacy manual ``cost_tracker.track_llm`` calls in
``crucible_report_agent.py`` and ``monte_carlo_engine.py`` stay for
the legacy code path, but the ADK path uses this callback exclusively.

Design notes:
- ``CallbackContext`` is aliased to ``Context`` in ADK ≥ 1.30. The
  signature accepts both the old and new names.
- Returns ``None`` so the response is passed through untouched.
- Resilient to missing ``usage_metadata`` (Claude returns
  ``cached_content_token_count`` differently from Gemini — the
  attributes are normalized here).
- Sim id is pulled from ``ctx.state["simulation_id"]`` — the
  orchestrator sets this on every round via ``state_delta``.
"""

from __future__ import annotations

import logging
from typing import Optional

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_response import LlmResponse

from app.utils.cost_tracker import get_or_create_tracker

logger = logging.getLogger("direphish.adk.callbacks.track_cost")

_DEFAULT_PHASE = "adk"
_DEFAULT_SIM = "unknown"


def track_cost(
    callback_context: CallbackContext,
    llm_response: LlmResponse,
) -> Optional[LlmResponse]:
    """Record one LLM call's token cost into the per-sim CostTracker.

    Returns None so the response flows through unchanged.
    """
    usage = getattr(llm_response, "usage_metadata", None)
    if usage is None:
        return None

    input_tokens = (
        getattr(usage, "prompt_token_count", None)
        or getattr(usage, "input_tokens", None)
        or 0
    )
    output_tokens = (
        getattr(usage, "candidates_token_count", None)
        or getattr(usage, "output_tokens", None)
        or 0
    )
    cached_tokens = (
        getattr(usage, "cached_content_token_count", None)
        or getattr(usage, "cache_read_input_tokens", None)
        or 0
    )

    if input_tokens == 0 and output_tokens == 0:
        # Nothing useful to record (e.g. tool-only response).
        return None

    # Pull sim id + model from the context / response.
    state = callback_context.state if hasattr(callback_context, "state") else {}
    sim_id = state.get("simulation_id", _DEFAULT_SIM) if state else _DEFAULT_SIM
    phase = (
        getattr(callback_context, "agent_name", None)
        or _DEFAULT_PHASE
    )
    model = (
        getattr(llm_response, "model", None)
        or getattr(usage, "model", None)
        or "unknown"
    )

    tracker = get_or_create_tracker(sim_id)
    tracker.track_llm(
        phase=phase,
        model=model,
        input_tokens=int(input_tokens),
        output_tokens=int(output_tokens),
        cached_tokens=int(cached_tokens),
        description=f"adk.{phase}",
    )

    logger.info(
        "[ADK] cost sim=%s phase=%s model=%s in=%d out=%d cached=%d total=$%.6f",
        sim_id,
        phase,
        model,
        input_tokens,
        output_tokens,
        cached_tokens,
        tracker.total_cost(),
    )

    return None
