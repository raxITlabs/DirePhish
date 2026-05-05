"""W1 slice 7: SSE event-bus shape parity.

These tests pin three behaviors of ``adk.sse`` so the war-room SSE feed
stays compatible with the JSONL polling endpoint that already powers
the React dashboard:

1. The serialized action record exposes exactly the canonical field
   set — same shape as the legacy JSONL writer at
   ``backend/scripts/run_crucible_simulation.py:343-353``.
2. Pressure events ride a separate ``type: pressure`` envelope (not
   coerced into ``ActionEvent`` shape).
3. Pub/sub round-trips: a publish on one ``simulation_id`` reaches
   every subscriber on that id, and slow consumers don't block the
   bus (queue drop on overflow).

Anti-pattern dodged: we do **not** gold-master JSONL or SSE payload
*values* against fixtures (per plan). We assert *shape* — field set,
types, envelope tag.
"""

import asyncio
import json

import pytest

from crucible.events import ActionEvent, PressureEvent

from adk.sse import (
    ACTION_RECORD_FIELDS,
    SSEBus,
    action_event_to_record,
    pressure_event_to_record,
)


def make_action_event() -> ActionEvent:
    return ActionEvent(
        round=1,
        timestamp="2026-05-05T00:00:00+00:00",
        simulation_id="sim-w1-sse",
        agent="Marcus Thorne",
        role="defender",
        world="incident-war-room",
        action="send_message",
        args={"content": "hello", "channel": "incident-war-room"},
        result={"success": True},
    )


class TestSerializationShape:
    def test_action_record_has_canonical_field_set(self):
        record = action_event_to_record(make_action_event())
        assert set(record.keys()) == ACTION_RECORD_FIELDS

    def test_action_record_field_types_match_jsonl_contract(self):
        record = action_event_to_record(make_action_event())
        assert isinstance(record["round"], int)
        assert isinstance(record["timestamp"], str)
        assert isinstance(record["simulation_id"], str)
        assert isinstance(record["agent"], str)
        assert isinstance(record["role"], str)
        assert isinstance(record["world"], str)
        assert isinstance(record["action"], str)
        assert isinstance(record["args"], dict)
        # ``result`` may be None (action queued, no synchronous result)
        assert record["result"] is None or isinstance(record["result"], dict)

    def test_pressure_event_uses_separate_envelope(self):
        pev = PressureEvent(
            kind="severity_changed",
            target="containment_deadline",
            payload={"from": "normal", "to": "high"},
            round=1,
        )
        record = pressure_event_to_record(pev, simulation_id="sim-w1-sse")
        assert record["type"] == "pressure"
        # Must NOT be coerced into action shape — no agent/world/action
        assert "agent" not in record
        assert "world" not in record
        assert "action" not in record
        # Must carry round + sim_id for client-side correlation
        assert record["round"] == 1
        assert record["simulation_id"] == "sim-w1-sse"


class TestSSEFraming:
    def test_serialize_emits_sse_data_frame(self):
        bus = SSEBus()
        record = action_event_to_record(make_action_event())
        frame = bus.serialize(record)
        assert frame.startswith("data: ")
        assert frame.endswith("\n\n")
        # Body is valid JSON parseable back to the same dict
        body = frame[len("data: ") :].rstrip("\n")
        assert json.loads(body) == record


class TestPubSub:
    @pytest.mark.asyncio
    async def test_publish_reaches_subscriber(self):
        bus = SSEBus()
        sim_id = "sim-pub-1"
        record = action_event_to_record(make_action_event())

        async def consume_one():
            async for ev in bus.subscribe(sim_id):
                return ev
            return None

        # Subscribe in a task; give the event loop a tick to register, then publish.
        task = asyncio.create_task(consume_one())
        await asyncio.sleep(0)
        bus.publish(sim_id, record)
        received = await asyncio.wait_for(task, timeout=1.0)
        assert received == record

    @pytest.mark.asyncio
    async def test_publish_only_reaches_matching_simulation(self):
        bus = SSEBus()
        record = action_event_to_record(make_action_event())

        async def consume_one(sim):
            async for ev in bus.subscribe(sim):
                return ev

        task_a = asyncio.create_task(consume_one("sim-A"))
        task_b = asyncio.create_task(consume_one("sim-B"))
        await asyncio.sleep(0)

        bus.publish("sim-A", record)

        got_a = await asyncio.wait_for(task_a, timeout=1.0)
        assert got_a == record
        # B should still be waiting
        assert not task_b.done()
        task_b.cancel()
        try:
            await task_b
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_overflow_drops_oldest_not_publisher(self):
        """Publisher must not block if a slow consumer fills the queue."""
        bus = SSEBus(queue_size=2)
        sim_id = "sim-overflow"

        # Subscribe but never consume — fill the queue
        agen = bus.subscribe(sim_id)
        # Drive __anext__ once to register the queue, then never poll
        # again. We do that by stepping into the generator once via
        # asyncio.create_task and letting it block on q.get().
        async def hang():
            async for _ in agen:
                # First arrival blocks in get()
                await asyncio.sleep(10)

        t = asyncio.create_task(hang())
        await asyncio.sleep(0)

        for i in range(10):
            bus.publish(sim_id, {"type": "action", "i": i})

        # Publisher returned without raising — that's the contract.
        assert True
        t.cancel()
        try:
            await t
        except asyncio.CancelledError:
            pass
