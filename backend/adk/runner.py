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
        """Drive all configured rounds via the orchestrator."""
        from adk.sinks.actions_jsonl import ActionsJsonlSink
        from adk.sinks.summary_json import SummaryJsonSink

        if self._orchestrator is None:
            self._orchestrator = self._build_orchestrator()

        actions_sink = ActionsJsonlSink(output_dir=self.output_dir)
        summary_sink = SummaryJsonSink(output_dir=self.output_dir)

        action_count = 0
        rounds_completed = 0

        try:
            for round_num in range(1, self.total_rounds + 1):
                report = await self._orchestrator.run_round(round_num)
                logger.info(
                    "[runner] round %d/%d complete phases=%s",
                    round_num, self.total_rounds, report.phases,
                )
                rounds_completed = round_num

                # Write adversary action if present
                if report.adversary_action is not None:
                    actions_sink.write(report.adversary_action)
                    action_count += 1

                # Write all defender actions
                for ev in report.defender_actions:
                    actions_sink.write(ev)
                    action_count += 1

                # Check for early halt flag
                halt_requested = getattr(report, "halt_requested", False)
                if halt_requested:
                    logger.info("[runner] early halt requested at round %d", round_num)
                    break
        finally:
            actions_sink.close()

        summary_sink.finalize(
            simulation_id=self.simulation_id,
            rounds_completed=rounds_completed,
            total_rounds_configured=self.total_rounds,
            action_count=action_count,
        )

        return {
            "simulation_id": self.simulation_id,
            "rounds_completed": rounds_completed,
            "total_rounds_configured": self.total_rounds,
            "action_count": action_count,
        }

    def _build_orchestrator(self):
        """Construct the per-round Orchestrator with W2 personas + adversary + judge.

        Per the design (Q2=C), config's agent_profiles field is ignored —
        the W2 hardcoded factories produce the canonical persona graph.
        env=None because real LlmAgents talk to MCP subprocesses, not an
        in-process env; Orchestrator's adapter layer handles that.
        """
        from crucible.config.pressure_config import PressureConfig
        from google.adk.agents import ParallelAgent

        from adk.agents.attacker_observation import AttackerObservationAgent
        from adk.agents.personas import (
            make_containment_judge,
            make_defender_team,
            make_threat_actor,
        )
        from adk.agents.pressure_engine import PressureEngineAgent
        from adk.agents.scheduled_injects import InjectAgent
        from adk.orchestrator import Orchestrator

        pressure_cfgs = [PressureConfig(**p) for p in self.config.get("pressures", [])]
        pressure = PressureEngineAgent(
            configs=pressure_cfgs,
            hours_per_round=self.hours_per_round,
        )

        defenders = make_defender_team()  # 5 LlmAgents in canonical order
        defender_team = ParallelAgent(name="defender_team", sub_agents=defenders)

        adversary = make_threat_actor()
        judge = make_containment_judge()

        inject = InjectAgent(events=self.config.get("scheduled_events", []))
        attacker_obs = AttackerObservationAgent()

        return Orchestrator(
            env=None,
            pressure=pressure,
            inject=inject,
            attacker_observation=attacker_obs,
            adversary=adversary,
            defenders=[defender_team],
            judge=judge,
            simulation_id=self.simulation_id,
        )


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
