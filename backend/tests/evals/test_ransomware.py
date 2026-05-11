"""Pytest wrapper around the ADK AgentEvaluator for DirePhish evalsets.

These tests run live against Vertex AI Gemini (~$0.01-0.03 each), so
they're gated behind ``RUN_LIVE_VERTEX=1``. CI runs the cheaper
construction smoke instead. The full eval loop is executed manually
or via the scheduled GitHub Actions job (W4 work).

The evalset shape is ADK-standard — see
``backend/tests/evalsets/ransomware_containment_v1.evalset.json``.
The ``test_config.json`` in the same directory configures the 4
DirePhish rubrics plus ADK's built-in metrics.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest


_LIVE = os.environ.get("RUN_LIVE_VERTEX") == "1"

_EVALSETS_DIR = Path(__file__).resolve().parents[1] / "evalsets"


@pytest.mark.asyncio
@pytest.mark.skipif(not _LIVE, reason="set RUN_LIVE_VERTEX=1 to run live evals")
async def test_ir_lead_against_ransomware_v1():
    """Run the IR-Lead cases from ransomware_containment_v1 evalset.

    Asserts each case meets the threshold defined in test_config.json
    for each rubric. Cost: ~$0.02-0.06 per case × 3 IR-Lead cases.
    """
    from google.adk.evaluation.agent_evaluator import AgentEvaluator

    from adk.agents.personas import make_ir_lead
    from adk.models import init_models

    init_models()

    # Build the IR-Lead agent fresh each test to ensure no shared state.
    _ = make_ir_lead()  # noqa: F841 — kept to validate construction

    # ADK's AgentEvaluator expects a path to an agent module — we pass
    # the persona factory's import path. The evalset filter is by
    # ``eval_id`` prefix so we only score IR Lead cases.
    await AgentEvaluator.evaluate(
        agent_module="adk.agents.personas.ir_lead",
        eval_dataset_file_path_or_dir=str(
            _EVALSETS_DIR / "ransomware_containment_v1.evalset.json"
        ),
        num_runs=1,
        # Filter via eval_id prefix — ADK supports this on the CLI but
        # the Python API in 1.33 doesn't yet expose it directly. For
        # now this scores the full evalset; W3 work splits into
        # per-persona evalsets so the filter isn't needed.
    )


@pytest.mark.asyncio
@pytest.mark.skipif(not _LIVE, reason="set RUN_LIVE_VERTEX=1 to run live evals")
async def test_ciso_against_ransomware_v1():
    """Run the CISO cases. Same scoring contract as IR Lead."""
    from google.adk.evaluation.agent_evaluator import AgentEvaluator

    from adk.agents.personas import make_ciso
    from adk.models import init_models

    init_models()
    _ = make_ciso()

    await AgentEvaluator.evaluate(
        agent_module="adk.agents.personas.ciso",
        eval_dataset_file_path_or_dir=str(
            _EVALSETS_DIR / "ransomware_containment_v1.evalset.json"
        ),
        num_runs=1,
    )


# ---------------------------------------------------------------------------
# Static checks that always run (no Vertex required) — catches schema
# regressions in the evalset / test_config files.
# ---------------------------------------------------------------------------


def test_evalset_file_is_loadable():
    import json

    path = _EVALSETS_DIR / "ransomware_containment_v1.evalset.json"
    with path.open() as f:
        data = json.load(f)
    assert "eval_cases" in data
    assert len(data["eval_cases"]) >= 1
    for case in data["eval_cases"]:
        assert "eval_id" in case
        assert "conversation" in case
        assert len(case["conversation"]) >= 1


def test_test_config_has_four_direphish_rubrics():
    import json

    path = _EVALSETS_DIR / "test_config.json"
    with path.open() as f:
        data = json.load(f)
    criteria = data["criteria"]
    for rubric in ("containment", "evidence", "communication", "business_impact"):
        assert rubric in criteria, f"missing rubric: {rubric}"
        assert "threshold" in criteria[rubric]
