"""ADK smoke blueprint — proves the new backend/adk/* code path is live.

Exposes three endpoints under ``/api/adk``:

- ``GET /api/adk/health`` — confirms the ADK module tree imports cleanly
  in the Flask process. Cheap; no Vertex calls.
- ``POST /api/adk/smoke`` — runs ONE round of the ADK orchestrator
  against fake collaborators (FakeEnv / FakeAdversary / FakeJudge with
  IRLeadPersona using a deterministic strategy). Emits ``[ADK]``
  log lines per phase and publishes records to the SSE bus. Returns
  the ``RoundReport`` as JSON.
- ``GET /api/adk/sse/<simulation_id>`` — Server-Sent Events stream of
  every record published to the in-process ``SSEBus`` for that sim id.

This is **smoke instrumentation**, not the real migration cutover. Real
sim flips onto ADK come in W2+ when personas become real LlmAgents and
the env wires through MCP world handlers. The smoke proves the Flask
process can call into ``backend/adk/*`` and the orchestrator runs to
completion — visible signal in logs the user can grep for.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

logger = logging.getLogger("direphish.adk")

adk_bp = Blueprint("adk", __name__)


# Module-level SSE bus shared across all requests. One Flask process
# owns one bus; subscribers see records published during their lifetime.
def _get_bus():
    from adk.sse import SSEBus

    if not hasattr(_get_bus, "_instance"):
        _get_bus._instance = SSEBus(queue_size=512)
    return _get_bus._instance


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
            }
        )
    except Exception as e:
        logger.exception("[ADK] health probe failed")
        return jsonify({"status": "error", "error": str(e), "type": type(e).__name__}), 500


@adk_bp.route("/smoke", methods=["POST"])
def smoke():
    """Run one ADK orchestrator round end-to-end against fakes.

    Body (JSON, all optional):
        {"simulation_id": "...", "round_num": 1}

    Logs ``[ADK]`` traces per phase and publishes records to the SSE bus.
    Returns the round report.
    """
    body = request.get_json(silent=True) or {}
    sim_id = body.get("simulation_id") or f"adk-smoke-{int(time.time() * 1000)}"
    round_num = int(body.get("round_num") or 1)

    logger.info("[ADK] smoke request sim=%s round=%d", sim_id, round_num)

    try:
        result = asyncio.run(_run_smoke_round(sim_id, round_num))
        return jsonify(result)
    except Exception as e:
        logger.exception("[ADK] smoke run failed sim=%s round=%d", sim_id, round_num)
        return jsonify({"status": "error", "error": str(e), "type": type(e).__name__}), 500


@adk_bp.route("/sse/<simulation_id>", methods=["GET"])
def sse_stream(simulation_id: str):
    """Server-Sent Events stream — one frame per record on the bus."""
    bus = _get_bus()
    logger.info("[ADK] SSE subscribe sim=%s", simulation_id)

    @stream_with_context
    def gen():
        # Bridge async iterator → sync generator for Flask's WSGI streaming.
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
# Smoke harness — fakes + the actual orchestrator run.
# ----------------------------------------------------------------------


class _FakeEnv:
    """Records calls; returns canned ActionEvents.

    Same shape as ``backend/tests/adk/test_orchestrator_smoke.py::FakeEnv``
    — kept here (not imported) so this module has zero test-package deps
    in production.
    """

    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def apply_action(
        self,
        actor: str,
        role: str,
        world: str,
        action: str,
        args: dict,
        simulation_id: str,
        round_num: int,
    ):
        from crucible.events import ActionEvent

        self.calls.append(
            {
                "actor": actor,
                "role": role,
                "world": world,
                "action": action,
                "args": args,
                "simulation_id": simulation_id,
                "round_num": round_num,
            }
        )
        return ActionEvent(
            round=round_num,
            timestamp=datetime.now(timezone.utc).isoformat(),
            simulation_id=simulation_id,
            agent=actor,
            role=role,
            world=world,
            action=action,
            args=args,
            result={"success": True, "smoke": True},
        )


class _FakeAdversary:
    name = "The Silent IP Drain Operator"
    role = "attacker"

    async def act(self, env, round_num: int, simulation_id: str):
        logger.info("[ADK] phase=adversary round=%d agent=%r", round_num, self.name)
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
            "[ADK] phase=judge round=%d pressure=%d adversary=%r defenders=%d",
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


async def _ir_lead_strategy(env, round_num, simulation_id):
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


async def _run_smoke_round(simulation_id: str, round_num: int) -> dict:
    """Build the orchestrator with fakes + canned configs, run one round."""
    # Imports inside the function so /health surfaces import errors in JSON
    # rather than 500'ing the blueprint at registration time.
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
    env = _FakeEnv()
    ir_lead = IRLeadPersona(strategy=_ir_lead_strategy)
    orchestrator = Orchestrator(
        env=env,
        pressure=pressure,
        adversary=_FakeAdversary(),
        defenders=[ir_lead],
        judge=_FakeJudge(),
        simulation_id=simulation_id,
    )

    logger.info("[ADK] phase=pressure round=%d", round_num)
    report = await orchestrator.run_round(round_num)

    # Publish to the SSE bus so /api/adk/sse/<sim_id> subscribers see live data.
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
        "[ADK] round complete sim=%s round=%d phases=%s defender_actions=%d",
        simulation_id,
        round_num,
        report.phases,
        len(report.defender_actions),
    )

    # Hand-serialize the dataclass — pydantic models inside need .model_dump.
    return {
        "simulation_id": simulation_id,
        "round": report.round,
        "phases": report.phases,
        "pressure_events": [e.model_dump() for e in report.pressure_events],
        "adversary_action": (
            report.adversary_action.model_dump() if report.adversary_action else None
        ),
        "defender_actions": [a.model_dump() for a in report.defender_actions],
        "judge_score": report.judge_score,
        "env_call_count": len(env.calls),
    }
