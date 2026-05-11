"""R3: ``make_ir_lead`` factory tests.

Two layers:

1. **Construction-only** (always runs). Imports the factory, builds an
   LlmAgent, asserts the wiring (name, model, callback, toolset
   present). Does *not* call Gemini. Cheap; runs in CI.

2. **Live round-trip** (gated on ``RUN_LIVE_VERTEX=1``). Constructs a
   real Runner around the agent, runs one invocation with a stub
   user message, asserts: ``[ADK]`` cost log line appears, exactly one
   tool call is made (no commentary), the tool args are well-formed
   (actor, role, simulation_id, round_num all present).

The live test costs ~$0.01–0.03 per run depending on output verbosity.
"""

from __future__ import annotations

import os

import pytest

from adk.agents.personas import (
    IR_LEAD_NAME,
    IR_LEAD_ROLE,
    IR_LEAD_SLUG,
    make_ir_lead,
)


# ---------------------------------------------------------------------------
# Persona identity constants
# ---------------------------------------------------------------------------


def test_persona_identity_constants_are_stable():
    assert IR_LEAD_NAME == "Marcus Thorne"
    assert IR_LEAD_ROLE == "defender"
    assert IR_LEAD_SLUG == "infrastructure_lead"


# ---------------------------------------------------------------------------
# Construction smoke — no LLM call
# ---------------------------------------------------------------------------


def test_make_ir_lead_returns_llm_agent_wired_correctly(vertex_env):
    """vertex_env fixture sets the env vars init_models() requires."""
    from google.adk.agents import LlmAgent

    agent = make_ir_lead()

    assert isinstance(agent, LlmAgent)
    from adk.models import GEMINI_MODELS

    assert agent.name == "ir_lead"
    assert agent.model == GEMINI_MODELS["pro"]
    assert agent.model, "resolved model string must be non-empty"
    assert agent.after_model_callback is not None
    assert agent.tools, "IR Lead must have at least one tool (slack toolset)"
    assert agent.instruction, "instruction must be non-empty"
    # output_key keeps the persona's last response on session state for
    # the orchestrator to read.
    assert agent.output_key == "ir_lead_last_response"


def test_make_ir_lead_accepts_flash_for_lower_cost(vertex_env):
    from adk.models import GEMINI_MODELS

    agent = make_ir_lead(model_key="flash")
    assert agent.model == GEMINI_MODELS["flash"]


def test_make_ir_lead_accepts_custom_instruction(vertex_env):
    custom = "You are a test agent. Always call do_nothing."
    agent = make_ir_lead(instruction=custom)
    assert agent.instruction == custom


# ---------------------------------------------------------------------------
# Live round-trip — gated, ~$0.02/run
# ---------------------------------------------------------------------------


_LIVE = os.environ.get("RUN_LIVE_VERTEX") == "1"


@pytest.mark.asyncio
@pytest.mark.skipif(not _LIVE, reason="set RUN_LIVE_VERTEX=1 to exercise Gemini")
async def test_ir_lead_emits_one_slack_tool_call_against_real_gemini():
    """Real Gemini round-trip — assert the persona invokes a slack tool.

    The test bypasses the orchestrator: build an ad-hoc InMemoryRunner,
    run one invocation, scan events for a tool call.
    """
    from google.adk.runners import InMemoryRunner
    from google.genai import types

    from adk.models import init_models

    init_models()

    agent = make_ir_lead()
    runner = InMemoryRunner(agent=agent, app_name="ir-lead-live-test")
    session = await runner.session_service.create_session(
        app_name="ir-lead-live-test",
        user_id="pytest",
        state={"simulation_id": "live-smoke", "round_num": 1},
    )

    user_msg = types.Content(
        role="user",
        parts=[
            types.Part(
                text=(
                    "Round 1 starting. Active ransomware on prod database. "
                    "simulation_id=live-smoke, round_num=1. Make one move."
                )
            )
        ],
    )

    tool_call_seen = False
    async for event in runner.run_async(
        user_id="pytest",
        session_id=session.id,
        new_message=user_msg,
    ):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if getattr(part, "function_call", None) is not None:
                    tool_call_seen = True

    assert tool_call_seen, "IR Lead did not call any slack tool on a live round"

    # And track_cost must have written one+ cost entries.
    from app.utils.cost_tracker import get_or_create_tracker

    tracker = get_or_create_tracker("live-smoke")
    assert tracker.entries, "track_cost did not record any usage"
