"""AdkSimulationRunner — drop-in replacement for scripts/run_crucible_simulation.py.

CLI surface:
    python -m backend.adk.runner --config <path> --output <dir>

Reads config.json, drives N rounds via the existing Orchestrator,
writes actions.jsonl / summary.json / costs.json + Firestore episodes.

This file is the A2 skeleton — A3 wires multi-round driving, A4 wires
personas + adversary + judge, A5/A6 wire output sinks.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger("direphish.adk.runner")


class AdkSimulationRunner:
    """Top-level multi-round driver wrapping the per-round Orchestrator."""

    def __init__(self, *, config: dict[str, Any], output_dir: Path) -> None:
        self.config = config
        self.output_dir = Path(output_dir)
        self.simulation_id: str = config.get("simulation_id") or "unknown"
        self.project_id: str = config.get("project_id") or "unknown"
        self.total_rounds: int = int(config.get("total_rounds", 10))
        self.hours_per_round: float = float(config.get("hours_per_round", 1.0))
        self._orchestrator = None  # lazy; populated in A3

    async def run(self) -> dict[str, Any]:
        """Drive all rounds; returns a summary dict.

        Filled in Task A3+ — this skeleton raises so callers know it's not ready.
        """
        raise NotImplementedError("A3 implements round driving")


def main(dry_run: bool = False) -> int:
    parser = argparse.ArgumentParser(description="ADK simulation runner")
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    config = json.loads(args.config.read_text())
    runner = AdkSimulationRunner(config=config, output_dir=args.output)

    if dry_run:
        logger.info(
            "[runner] dry-run sim=%s rounds=%d", runner.simulation_id, runner.total_rounds
        )
        return 0

    summary = asyncio.run(runner.run())
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    sys.exit(main())
