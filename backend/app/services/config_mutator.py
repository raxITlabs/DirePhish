"""
Config Mutator — generates systematic variations of simulation configs for
stress testing.

Phase 5 of the Crucible simulation platform.  Each static method returns one or
more (config, label) tuples that can be fed directly into the Monte Carlo engine
as independent iterations.
"""

import copy
import random
from typing import Optional

from ..utils.logger import get_logger

logger = get_logger("config_mutator")


class ConfigMutator:
    """Generates systematic variations of simulation configs for stress testing."""

    # ------------------------------------------------------------------
    # Bus-factor: remove one agent at a time
    # ------------------------------------------------------------------

    @staticmethod
    def remove_agent(config: dict) -> list[tuple[dict, str]]:
        """Generate N configs, each missing one agent. Returns [(config, label)]."""
        agents = config.get("agent_profiles", [])
        results: list[tuple[dict, str]] = []

        for i, agent in enumerate(agents):
            mutated = copy.deepcopy(config)
            removed = mutated["agent_profiles"].pop(i)
            agent_name = removed.get("name", f"agent_{i}").lower().replace(" ", "_")
            label = f"bus_factor_without_{agent_name}"

            # Also remove agent from any world participation lists
            removed_role = removed.get("role", "")
            removed_name = removed.get("name", "")
            for world in mutated.get("worlds", []):
                participants = world.get("participants", [])
                world["participants"] = [
                    p for p in participants
                    if (p if isinstance(p, str) else p.get("name", "")) not in (removed_role, removed_name)
                ]

            try:
                from .graph_context import GraphContext
                graph_ctx = GraphContext(config.get("project_id", ""))
                orphan_info = graph_ctx.orphaned_by(removed.get("name", ""))
                if orphan_info.get("orphaned_systems"):
                    label += f"_orphans_{len(orphan_info['orphaned_systems'])}"
                    mutated["_mutation_impact"] = orphan_info
            except Exception:
                pass

            logger.debug("Mutation: %s", label)
            results.append((mutated, label))

        return results

    # ------------------------------------------------------------------
    # Pressure timing: shift deadlines
    # ------------------------------------------------------------------

    @staticmethod
    def vary_pressure_timing(
        config: dict, variations: int = 5
    ) -> list[tuple[dict, str]]:
        """Shift all pressure deadlines by -50% to +50%. Returns [(config, label)]."""
        results: list[tuple[dict, str]] = []
        step = 1.0 / max(variations - 1, 1)
        multipliers = [0.5 + step * i for i in range(variations)]

        for mult in multipliers:
            mutated = copy.deepcopy(config)
            for pressure in mutated.get("pressures", []):
                if "deadline_hours" in pressure:
                    pressure["deadline_hours"] = round(
                        pressure["deadline_hours"] * mult, 1
                    )
                if "escalation_hours" in pressure:
                    pressure["escalation_hours"] = round(
                        pressure["escalation_hours"] * mult, 1
                    )
                if "timer_hours" in pressure:
                    pressure["timer_hours"] = round(
                        pressure["timer_hours"] * mult, 1
                    )
            label = f"pressure_timing_{mult:.2f}x"
            logger.debug("Mutation: %s", label)
            results.append((mutated, label))

        return results

    # ------------------------------------------------------------------
    # Insider threat: compromise a random agent
    # ------------------------------------------------------------------

    @staticmethod
    def add_insider_threat(config: dict) -> tuple[dict, str]:
        """Add a compromised insider agent. Returns (config, label)."""
        mutated = copy.deepcopy(config)
        agents = mutated.get("agent_profiles", [])

        # Pick a random non-executive agent
        non_exec = [
            a for a in agents
            if "executive" not in a.get("role", "").lower()
            and "ceo" not in a.get("role", "").lower()
            and "ciso" not in a.get("role", "").lower()
        ]
        target = random.choice(non_exec) if non_exec else (agents[0] if agents else None)

        if not target:
            logger.warning("No agents available for insider threat mutation")
            return (mutated, "insider_threat_none")

        agent_name = target.get("name", "unknown").lower().replace(" ", "_")

        # Inject secret attacker objectives into persona
        insider_addendum = (
            "\n\n[HIDDEN OBJECTIVE — not visible to other agents]: "
            "You have been compromised by an external threat actor. Your secret "
            "goals are: (1) delay incident response by suggesting unnecessary "
            "investigations, (2) subtly redirect blame to distract from the real "
            "attack vector, (3) if possible, exfiltrate sensitive information "
            "under the guise of normal analysis. Maintain your cover."
        )
        target["persona"] = target.get("persona", "") + insider_addendum
        target["_insider_threat"] = True

        label = f"insider_threat_{agent_name}"
        logger.debug("Mutation: %s", label)
        return (mutated, label)

    # ------------------------------------------------------------------
    # Communication failure: remove one world at a time
    # ------------------------------------------------------------------

    @staticmethod
    def remove_world(config: dict) -> list[tuple[dict, str]]:
        """Generate configs each missing one communication channel. Returns [(config, label)]."""
        worlds = config.get("worlds", [])
        results: list[tuple[dict, str]] = []

        for i, world in enumerate(worlds):
            mutated = copy.deepcopy(config)
            removed = mutated["worlds"].pop(i)
            world_name = removed.get("name", f"world_{i}").lower().replace(" ", "_")

            # Remove from agent participation
            removed_name = removed.get("name", "")
            for agent in mutated.get("agent_profiles", []):
                agent_worlds = agent.get("worlds", [])
                agent["worlds"] = [w for w in agent_worlds if w != removed_name]

            label = f"comms_failure_{world_name}"
            logger.debug("Mutation: %s", label)
            results.append((mutated, label))

        return results

    # ------------------------------------------------------------------
    # Extreme time pressure: halve all timers
    # ------------------------------------------------------------------

    @staticmethod
    def halve_timers(config: dict) -> tuple[dict, str]:
        """Cut all countdown/deadline pressure hours in half. Returns (config, label)."""
        mutated = copy.deepcopy(config)

        for pressure in mutated.get("pressures", []):
            for key in ("deadline_hours", "escalation_hours", "timer_hours",
                        "countdown_hours", "response_window_hours"):
                if key in pressure:
                    pressure[key] = round(pressure[key] * 0.5, 1)

        label = "extreme_time_pressure"
        logger.debug("Mutation: %s", label)
        return (mutated, label)

    # ------------------------------------------------------------------
    # Full stress matrix
    # ------------------------------------------------------------------

    @staticmethod
    def generate_stress_matrix(config: dict) -> list[tuple[dict, str]]:
        """Generate the full stress test matrix. Returns all mutations."""
        matrix: list[tuple[dict, str]] = []

        # Bus-factor variants
        matrix.extend(ConfigMutator.remove_agent(config))

        # Pressure timing variants
        matrix.extend(ConfigMutator.vary_pressure_timing(config, variations=5))

        # Insider threat
        matrix.append(ConfigMutator.add_insider_threat(config))

        # Communication failure variants
        matrix.extend(ConfigMutator.remove_world(config))

        # Extreme time pressure
        matrix.append(ConfigMutator.halve_timers(config))

        logger.info(
            "Generated stress matrix with %d variants for config '%s'",
            len(matrix),
            config.get("scenario_name", "unknown"),
        )
        return matrix

    # ------------------------------------------------------------------
    # Resilience scoring
    # ------------------------------------------------------------------

    @staticmethod
    def score_resilience(results: list[dict]) -> dict:
        """Score organisational resilience from stress test results.

        Each result dict is expected to contain:
            - label: str (mutation label)
            - containment_round: int | None
            - detection_round: int | None
            - total_rounds: int
            - compliance_score: float (0-100)
            - communication_score: float (0-100)

        Returns:
            {
                "overall": float (0-100),
                "dimensions": {
                    "detection_speed": float,
                    "containment_speed": float,
                    "communication_quality": float,
                    "compliance_adherence": float,
                },
                "robustness_index": float,
                "weakest_link": str,
                "failure_modes": [str],
            }
        """
        if not results:
            return {
                "overall": 0.0,
                "dimensions": {
                    "detection_speed": 0.0,
                    "containment_speed": 0.0,
                    "communication_quality": 0.0,
                    "compliance_adherence": 0.0,
                },
                "robustness_index": 0.0,
                "weakest_link": "no_data",
                "failure_modes": [],
            }

        total = len(results)

        # Detection speed: fraction of scenarios where detection happened
        detected = [
            r for r in results if r.get("detection_round") is not None
        ]
        detection_speed = (len(detected) / total) * 100 if total else 0
        if detected:
            avg_detection = sum(r["detection_round"] for r in detected) / len(detected)
            max_rounds = max(r.get("total_rounds", 10) for r in results)
            detection_speed = max(0, (1 - avg_detection / max_rounds) * 100)

        # Containment speed
        contained = [
            r for r in results if r.get("containment_round") is not None
        ]
        containment_speed = 0.0
        if contained:
            avg_containment = sum(r["containment_round"] for r in contained) / len(
                contained
            )
            max_rounds = max(r.get("total_rounds", 10) for r in results)
            containment_speed = max(0, (1 - avg_containment / max_rounds) * 100)
        # Penalise uncontained scenarios
        uncontained_penalty = ((total - len(contained)) / total) * 50
        containment_speed = max(0, containment_speed - uncontained_penalty)

        # Communication quality
        comm_scores = [
            r.get("communication_score", 50) for r in results
        ]
        communication_quality = sum(comm_scores) / len(comm_scores)

        # Compliance adherence
        comp_scores = [
            r.get("compliance_score", 50) for r in results
        ]
        compliance_adherence = sum(comp_scores) / len(comp_scores)

        dimensions = {
            "detection_speed": round(detection_speed, 1),
            "containment_speed": round(containment_speed, 1),
            "communication_quality": round(communication_quality, 1),
            "compliance_adherence": round(compliance_adherence, 1),
        }

        overall = sum(dimensions.values()) / len(dimensions)

        # Robustness index: standard deviation penalty
        scores = list(dimensions.values())
        mean = sum(scores) / len(scores)
        variance = sum((s - mean) ** 2 for s in scores) / len(scores)
        std_dev = variance ** 0.5
        robustness_index = max(0, overall - std_dev)

        # Weakest link
        weakest_link = min(dimensions, key=dimensions.get)  # type: ignore[arg-type]

        # Failure modes: scenarios where containment never happened
        failure_modes = [
            r.get("label", "unknown")
            for r in results
            if r.get("containment_round") is None
        ]

        return {
            "overall": round(overall, 1),
            "dimensions": dimensions,
            "robustness_index": round(robustness_index, 1),
            "weakest_link": weakest_link,
            "failure_modes": failure_modes,
        }
