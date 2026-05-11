"""R5: track_cost after_model_callback over the existing CostTracker.

The callback's job is narrow: extract usage from an LlmResponse, look
up (or create) the per-sim CostTracker, record one entry. These tests
exercise that contract with hand-built fakes — no real ADK runner,
no real LLM.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from adk.callbacks.track_cost import track_cost
from app.utils.cost_tracker import get_or_create_tracker, reset_trackers


@dataclass
class _FakeUsage:
    prompt_token_count: int = 0
    candidates_token_count: int = 0
    cached_content_token_count: int = 0


@dataclass
class _FakeLlmResponse:
    usage_metadata: Any = None
    model: str = "gemini-2.5-pro"


@dataclass
class _FakeCallbackContext:
    """Mimics ADK's CallbackContext for unit testing.

    Real CallbackContext (= Context) has ``agent_name`` (a property)
    and ``state`` (dict-like). We mirror the surface track_cost uses.
    """

    agent_name: str = "ir_lead"
    state: dict = field(default_factory=lambda: {"simulation_id": "test-sim"})


@pytest.fixture(autouse=True)
def _reset_cost_trackers():
    """Each test starts with an empty tracker cache."""
    reset_trackers()
    yield
    reset_trackers()


def test_track_cost_records_one_entry_for_gemini_usage():
    response = _FakeLlmResponse(
        usage_metadata=_FakeUsage(
            prompt_token_count=120, candidates_token_count=45, cached_content_token_count=10
        ),
        model="gemini-2.5-pro",
    )
    ctx = _FakeCallbackContext(agent_name="ir_lead")

    result = track_cost(ctx, response)

    assert result is None, "track_cost must return None to leave response untouched"

    tracker = get_or_create_tracker("test-sim")
    assert len(tracker.entries) == 1
    entry = tracker.entries[0]
    assert entry["phase"] == "ir_lead"
    assert entry["model"] == "gemini-2.5-pro"
    assert entry["input_tokens"] == 120
    assert entry["output_tokens"] == 45
    assert entry["cached_tokens"] == 10
    assert entry["cost_usd"] > 0.0


def test_track_cost_uses_simulation_id_from_state():
    response = _FakeLlmResponse(
        usage_metadata=_FakeUsage(prompt_token_count=100, candidates_token_count=10)
    )
    ctx = _FakeCallbackContext(state={"simulation_id": "sim-xyz"})

    track_cost(ctx, response)

    assert "sim-xyz" in tracker_cache_keys()
    assert "test-sim" not in tracker_cache_keys()


def test_track_cost_skips_when_usage_metadata_missing():
    response = _FakeLlmResponse(usage_metadata=None)
    ctx = _FakeCallbackContext()

    track_cost(ctx, response)

    # No tracker created for "test-sim" because we returned early.
    assert "test-sim" not in tracker_cache_keys()


def test_track_cost_skips_when_token_counts_are_zero():
    """Tool-only responses report 0 in/out — no cost entry to record."""
    response = _FakeLlmResponse(
        usage_metadata=_FakeUsage(
            prompt_token_count=0, candidates_token_count=0
        ),
    )
    ctx = _FakeCallbackContext()

    track_cost(ctx, response)

    assert "test-sim" not in tracker_cache_keys()


def test_track_cost_falls_back_to_anthropic_attribute_names():
    """Claude returns input_tokens/output_tokens/cache_read_input_tokens.

    The callback normalizes both Gemini and Anthropic attribute names.
    """

    @dataclass
    class _AnthropicUsage:
        input_tokens: int = 200
        output_tokens: int = 50
        cache_read_input_tokens: int = 30

    response = _FakeLlmResponse(
        usage_metadata=_AnthropicUsage(),
        model="claude-sonnet-4-5",
    )
    ctx = _FakeCallbackContext(agent_name="adversary")

    track_cost(ctx, response)

    tracker = get_or_create_tracker("test-sim")
    assert len(tracker.entries) == 1
    assert tracker.entries[0]["input_tokens"] == 200
    assert tracker.entries[0]["output_tokens"] == 50
    assert tracker.entries[0]["cached_tokens"] == 30


def test_track_cost_accumulates_across_calls_for_same_sim():
    usage = _FakeUsage(prompt_token_count=50, candidates_token_count=10)
    ctx1 = _FakeCallbackContext(agent_name="ir_lead")
    ctx2 = _FakeCallbackContext(agent_name="ciso")

    track_cost(ctx1, _FakeLlmResponse(usage_metadata=usage))
    track_cost(ctx2, _FakeLlmResponse(usage_metadata=usage))

    tracker = get_or_create_tracker("test-sim")
    assert len(tracker.entries) == 2
    phases = [e["phase"] for e in tracker.entries]
    assert phases == ["ir_lead", "ciso"]


def tracker_cache_keys():
    """Helper: peek at the module-level cache."""
    from app.utils import cost_tracker

    return set(cost_tracker._trackers.keys())
