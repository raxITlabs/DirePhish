"""Output sinks for AdkSimulationRunner.

Matches the legacy contract from scripts/run_crucible_simulation.py:
- actions.jsonl: one ActionEvent.model_dump() per line, frontend reads this
- summary.json: per-sim summary (rounds_completed, action_count, etc.)
- Firestore episodes + graph: written via FirestoreSink (later task)
"""
