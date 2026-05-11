"""ADK callbacks for DirePhish — observability + guardrails.

Each callable here matches one of ADK's callback signatures
(``before_model_callback``, ``after_model_callback``,
``before_tool_callback``, ``after_tool_callback``,
``before_agent_callback``, ``after_agent_callback``). Personas wire
them at factory time so the model plane never needs to know about
DirePhish-specific bookkeeping.

Current callbacks:
- ``track_cost`` — after_model_callback. Records per-call token cost
  into the existing ``app.utils.cost_tracker.CostTracker`` keyed by
  ``simulation_id`` from session state.

W3 adds:
- ``track_latency`` — before/after pair recording wall-clock per LLM call.
- ``redact_pii`` — before_model_callback scrubbing emails/IPs from
  context before sending to the model.
- ``enforce_tool_permissions`` — before_tool_callback that consults
  the persona-role matrix.
"""

from .track_cost import track_cost

__all__ = ["track_cost"]
