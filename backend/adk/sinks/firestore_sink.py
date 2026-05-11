"""Per-round Firestore episode writes + every-N-round graph extraction.

Reuses backend/app/services/firestore_memory.py:FirestoreMemory.
"""

from __future__ import annotations

from typing import Any

from app.services.firestore_memory import FirestoreMemory


class FirestoreSink:
    def __init__(self, *, simulation_id: str, graph_every_n_rounds: int = 3,
                 cost_tracker=None) -> None:
        self.simulation_id = simulation_id
        self.graph_every_n_rounds = graph_every_n_rounds
        self._memory = FirestoreMemory(cost_tracker=cost_tracker)
        self._accumulated_text: list[str] = []

    def round_complete(self, *, round_num: int, actions: list[dict[str, Any]]) -> None:
        if not actions:
            return
        episodes = [
            {"action": a.get("action", "?"), "content": str(a)[:1000], "category": "round"}
            for a in actions
        ]
        self._memory.add_episodes_bulk(self.simulation_id, episodes)
        self._accumulated_text.extend(str(a)[:500] for a in actions)

        if round_num % self.graph_every_n_rounds == 0 and self._accumulated_text:
            self._memory.extract_and_store_graph(self.simulation_id, self._accumulated_text)
