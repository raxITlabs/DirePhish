"""SSE event bus for war-room live updates.

Additive to the existing JSONL polling endpoint — the orchestrator
publishes the same record shape to both, so consumers can choose their
transport. SSE pushes round artifacts (action events, pressure events,
judge scores) the moment they happen; JSONL stays as the durable
audit log.

This module is pure Python — no Flask coupling. The Flask route that
exposes ``/api/crucible/simulations/{id}/events`` is a thin wrapper
that calls ``SSEBus.subscribe`` and serializes each event as
``data: <json>\\n\\n``. That wrapper lives under ``backend/app/routes/``
and is not in the W1 scope (added when the full Flask backend ships).
"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any, AsyncIterator

from crucible.events import ActionEvent, PressureEvent


def action_event_to_record(ev: ActionEvent) -> dict[str, Any]:
    """Serialize ``ActionEvent`` to the canonical war-room record shape.

    Keeps field-for-field parity with the legacy JSONL contract written
    at ``backend/scripts/run_crucible_simulation.py:343-353``: ``round,
    timestamp, simulation_id, agent, role, world, action, args, result``.
    """
    return {
        "type": "action",
        "round": ev.round,
        "timestamp": ev.timestamp,
        "simulation_id": ev.simulation_id,
        "agent": ev.agent,
        "role": ev.role,
        "world": ev.world,
        "action": ev.action,
        "args": ev.args,
        "result": ev.result,
    }


def pressure_event_to_record(ev: PressureEvent, simulation_id: str) -> dict[str, Any]:
    """Serialize ``PressureEvent`` for the bus.

    Pressure events are a different envelope than actions but share the
    ``round`` + ``simulation_id`` keys for client-side correlation.
    """
    return {
        "type": "pressure",
        "kind": ev.kind,
        "target": ev.target,
        "payload": ev.payload,
        "round": ev.round,
        "simulation_id": simulation_id,
    }


class SSEBus:
    """In-process pub/sub keyed by ``simulation_id``.

    Subscribers are async iterators over event dicts. ``publish`` is sync
    so it can be called from anywhere in the round driver without
    awaiting a queue (drops are non-fatal — JSONL is the source of
    truth). One bounded queue per (sim_id, subscriber) keeps slow
    clients from blocking the orchestrator.
    """

    def __init__(self, queue_size: int = 256) -> None:
        self._subs: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._queue_size = queue_size

    def publish(self, simulation_id: str, record: dict[str, Any]) -> None:
        for q in list(self._subs.get(simulation_id, [])):
            try:
                q.put_nowait(record)
            except asyncio.QueueFull:
                # Drop oldest, push newest. Slow client; durable JSONL
                # remains the source of truth.
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                q.put_nowait(record)

    async def subscribe(self, simulation_id: str) -> AsyncIterator[dict[str, Any]]:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._queue_size)
        self._subs[simulation_id].append(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subs[simulation_id].remove(q)

    def serialize(self, record: dict[str, Any]) -> str:
        """Format a record as an SSE ``data:`` frame."""
        return f"data: {json.dumps(record)}\n\n"


# Canonical field set for the action record. Use this in tests to pin
# parity rather than gold-mastering whole payloads (anti-pattern).
ACTION_RECORD_FIELDS: frozenset[str] = frozenset(
    {
        "type",
        "round",
        "timestamp",
        "simulation_id",
        "agent",
        "role",
        "world",
        "action",
        "args",
        "result",
    }
)
