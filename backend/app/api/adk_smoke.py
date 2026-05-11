"""ADK smoke blueprint — proves the new backend/adk/* code path is live.

Exposes three endpoints under ``/api/adk``:

- ``GET /api/adk/health`` — confirms the ADK module tree imports
  cleanly inside Flask. Cheap; no Vertex calls.
- ``POST /api/adk/smoke`` — runs ONE round of the ADK orchestrator.
  Two modes:

  - **live mode** (default when Vertex env vars are set): the full
    real cast — 5 defender ``LlmAgent``s on Gemini (CISO, IR Lead, SOC
    Analyst, Legal, CEO), 1 adversary on Claude (Sonnet via Vertex
    Model Garden), 1 judge on Gemini Pro. Defenders run in parallel
    via ``ParallelAgent``. All connect to Slack/Email/PagerDuty MCP
    servers over stdio.
  - **fake mode** (when Vertex env vars are missing): IR Lead uses a
    deterministic strategy. Adversary + Judge are deterministic
    fakes. No Gemini/Claude calls. Useful for CI smoke without
    cloud auth.

  Force the mode via JSON body: ``{"mode": "fake"}`` or
  ``{"mode": "live"}``. Default is auto-detect.

- ``GET /api/adk/sse/<simulation_id>`` — Server-Sent Events stream of
  every record published to the in-process ``SSEBus`` for that sim id.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

logger = logging.getLogger("direphish.adk")

adk_bp = Blueprint("adk", __name__)


def _get_bus():
    from adk.sse import SSEBus

    if not hasattr(_get_bus, "_instance"):
        _get_bus._instance = SSEBus(queue_size=512)
    return _get_bus._instance


def _vertex_env_ready() -> bool:
    return (
        os.environ.get("GOOGLE_GENAI_USE_VERTEXAI") == "TRUE"
        and bool(os.environ.get("GOOGLE_CLOUD_PROJECT"))
        and bool(os.environ.get("GOOGLE_CLOUD_LOCATION"))
    )


@adk_bp.route("/health", methods=["GET"])
def health():
    """Cheap import probe — proves backend/adk/* loads inside Flask."""
    try:
        from adk import models, orchestrator, sse
        from adk.agents.personas import IRLeadPersona, PERSONA_BY_AGENT_NAME
        from adk.agents.pressure_engine import PressureEngineAgent

        logger.info("[ADK] health probe — modules imported")
        return jsonify(
            {
                "status": "ok",
                "adk_modules": {
                    "models": models.__name__,
                    "orchestrator": orchestrator.__name__,
                    "sse": sse.__name__,
                },
                "personas_registered": len(PERSONA_BY_AGENT_NAME),
                "claude_models": list(models.CLAUDE_MODELS.keys()),
                "gemini_models": list(models.GEMINI_MODELS.keys()),
                "vertex_env_ready": _vertex_env_ready(),
            }
        )
    except Exception as e:
        logger.exception("[ADK] health probe failed")
        return jsonify({"status": "error", "error": str(e), "type": type(e).__name__}), 500


@adk_bp.route("/smoke", methods=["POST"])
def smoke():
    """Run one ADK orchestrator round.

    Body (JSON, all optional):
        {"simulation_id": "...", "round_num": 1, "mode": "live" | "fake"}
    """
    body = request.get_json(silent=True) or {}
    sim_id = body.get("simulation_id") or f"adk-smoke-{int(time.time() * 1000)}"
    round_num = int(body.get("round_num") or 1)
    requested_mode = body.get("mode")
    if requested_mode in ("live", "fake"):
        mode = requested_mode
    else:
        mode = "live" if _vertex_env_ready() else "fake"

    logger.info(
        "[ADK] smoke request sim=%s round=%d mode=%s", sim_id, round_num, mode
    )

    try:
        result = asyncio.run(_run_smoke_round(sim_id, round_num, mode=mode))
        return jsonify(result)
    except Exception as e:
        logger.exception("[ADK] smoke run failed sim=%s round=%d", sim_id, round_num)
        return jsonify({"status": "error", "error": str(e), "type": type(e).__name__}), 500


@adk_bp.route("/sse/<simulation_id>", methods=["GET"])
def sse_stream(simulation_id: str):
    bus = _get_bus()
    logger.info("[ADK] SSE subscribe sim=%s", simulation_id)

    @stream_with_context
    def gen():
        loop = asyncio.new_event_loop()
        try:
            agen = bus.subscribe(simulation_id).__aiter__()
            while True:
                record = loop.run_until_complete(agen.__anext__())
                yield bus.serialize(record)
        finally:
            loop.close()

    return Response(gen(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache"})


# ----------------------------------------------------------------------
# Fake-mode collaborators (used when Vertex auth isn't configured).
# Live mode replaces ALL of these with real LlmAgents.
# ----------------------------------------------------------------------


class _FakeAdversary:
    name = "The Silent IP Drain Operator"
    role = "attacker"

    async def act(self, env, round_num: int, simulation_id: str):
        logger.info("[ADK] phase=adversary round=%d agent=%r (fake)", round_num, self.name)
        return await env.apply_action(
            actor=self.name,
            role=self.role,
            world="c2-channel",
            action="send_message",
            args={
                "content": "[OPERATOR] Burn the SP. Pivot to PostgreSQL low-and-slow.",
                "channel": "c2-channel",
            },
            simulation_id=simulation_id,
            round_num=round_num,
        )


class _FakeJudge:
    async def score(self, round_num, pressure_events, adversary_action, defender_actions):
        logger.info(
            "[ADK] phase=judge round=%d pressure=%d adversary=%r defenders=%d (fake)",
            round_num,
            len(pressure_events),
            adversary_action.role if adversary_action else None,
            len(defender_actions),
        )
        return {
            "round": round_num,
            "containment": 0.62,
            "communication": 0.71,
            "decision_quality": 0.55,
        }


class _SmokeFakeEnv:
    """In-process fake env for the fake adversary's apply_action calls."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def apply_action(
        self, actor, role, world, action, args, simulation_id, round_num
    ):
        from crucible.events import ActionEvent

        self.calls.append({
            "actor": actor, "role": role, "world": world, "action": action,
            "args": args, "simulation_id": simulation_id, "round_num": round_num,
        })
        return ActionEvent(
            round=round_num,
            timestamp=datetime.now(timezone.utc).isoformat(),
            simulation_id=simulation_id,
            agent=actor, role=role, world=world, action=action,
            args=args, result={"success": True, "smoke": True},
        )


async def _deterministic_ir_lead_action(env, round_num, simulation_id):
    return (
        "incident-war-room",
        "send_message",
        {
            "content": (
                f"[IR Lead, round {round_num}] War room up. "
                "SOC: confirm containment scope. Infra: rotate the SP."
            ),
            "channel": "incident-war-room",
        },
    )


# ----------------------------------------------------------------------
# Round runner
# ----------------------------------------------------------------------


async def _run_smoke_round(simulation_id: str, round_num: int, *, mode: str) -> dict:
    """Build the orchestrator and run one round in the requested mode."""
    from crucible.config import PressureConfig

    from adk.agents.personas import IRLeadPersona
    from adk.agents.pressure_engine import PressureEngineAgent
    from adk.orchestrator import Orchestrator
    from adk.sse import action_event_to_record, pressure_event_to_record

    bus = _get_bus()

    pressure_cfg = PressureConfig(
        name="containment_deadline",
        type="countdown",
        affects_roles=["ciso"],
        hours=2.0,
        hours_until=None,
        value=None,
        unit=None,
        triggered_by=None,
        severity_at_50pct="high",
        severity_at_25pct="critical",
    )
    pressure = PressureEngineAgent(configs=[pressure_cfg], hours_per_round=1.0)

    if mode == "live":
        from adk.agents.personas import (
            make_containment_judge,
            make_defender_team,
            make_threat_actor,
        )
        from adk.models import init_models
        from google.adk.agents import SequentialAgent

        init_models()  # validates Vertex env vars + registers Claude

        defenders = make_defender_team()
        # SequentialAgent (not ParallelAgent) to stay under Vertex's
        # per-minute quota on new projects.
        defender_team = SequentialAgent(name="defender_team", sub_agents=defenders)
        adversary = make_threat_actor()
        judge = make_containment_judge()
        env = None  # real LlmAgents talk to MCP subprocesses, not in-process env

        # Log every agent's actual model string — the user can verify
        # against the Vertex quota page exactly which model is being hit.
        for d in defenders:
            logger.info("[ADK] live defender: name=%s model=%s", d.name, d.model)
        logger.info("[ADK] live adversary: name=%s model=%s", adversary.name, adversary.model)
        logger.info("[ADK] live judge: name=%s model=%s", judge.name, judge.model)

        orchestrator = Orchestrator(
            env=env,
            pressure=pressure,
            adversary=adversary,
            defenders=[defender_team],
            judge=judge,
            simulation_id=simulation_id,
        )
    else:
        env = _SmokeFakeEnv()
        defender = IRLeadPersona(strategy=_deterministic_ir_lead_action)
        logger.info("[ADK] fake mode — IR Lead is deterministic strategy")
        orchestrator = Orchestrator(
            env=env,
            pressure=pressure,
            adversary=_FakeAdversary(),
            defenders=[defender],
            judge=_FakeJudge(),
            simulation_id=simulation_id,
        )

    logger.info("[ADK] phase=pressure round=%d", round_num)
    report = await orchestrator.run_round(round_num)

    # Publish to SSE bus.
    for ev in report.pressure_events:
        bus.publish(simulation_id, pressure_event_to_record(ev, simulation_id))
    if report.adversary_action:
        bus.publish(simulation_id, action_event_to_record(report.adversary_action))
    for action in report.defender_actions:
        bus.publish(simulation_id, action_event_to_record(action))
    bus.publish(
        simulation_id,
        {
            "type": "judge_score",
            "round": round_num,
            "simulation_id": simulation_id,
            "score": report.judge_score,
        },
    )

    logger.info(
        "[ADK] round complete sim=%s round=%d mode=%s phases=%s defender_actions=%d",
        simulation_id, round_num, mode, report.phases, len(report.defender_actions),
    )

    return {
        "simulation_id": simulation_id,
        "round": report.round,
        "mode": mode,
        "phases": report.phases,
        "pressure_events": [e.model_dump() for e in report.pressure_events],
        "adversary_action": (
            report.adversary_action.model_dump() if report.adversary_action else None
        ),
        "defender_actions": [a.model_dump() for a in report.defender_actions],
        "judge_score": report.judge_score,
        "env_call_count": (
            len(env.calls) if isinstance(env, _SmokeFakeEnv) else 0
        ),
    }
