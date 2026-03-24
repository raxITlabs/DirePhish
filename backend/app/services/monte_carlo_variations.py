"""
Monte Carlo variation generator for simulation configs.

Generates controlled, seeded variations of a base simulation config
across four axes: temperature, persona, event timing, and agent order.
"""

import copy
import random
from dataclasses import dataclass

from ..utils.logger import get_logger

logger = get_logger("monte_carlo_variations")

PERSONA_MODIFIER_POOL = [
    "under extra stress today",
    "unusually cautious",
    "distracted by personal matter",
    "overconfident from recent success",
    "skeptical of the severity",
    "eager to prove themselves",
    "running on little sleep",
    "feeling pressure from board",
]


@dataclass
class VariationParams:
    """Parameters controlling which variation axes are active and their magnitude."""

    temperature_jitter: float = 0.15
    persona_perturbation: bool = True
    inject_timing_shift: int = 1
    agent_order_shuffle: bool = True


class VariationGenerator:
    """Generates reproducible variations of a simulation config for Monte Carlo runs."""

    def __init__(self, base_seed: int = 42):
        self.base_seed = base_seed

    def generate(
        self, iteration_index: int, base_config: dict, params: dict | VariationParams
    ) -> tuple[dict, str]:
        """Apply all enabled variations. Returns (modified_config, description_string).

        Args:
            iteration_index: The Monte Carlo iteration number (used to derive seed).
            base_config: The original simulation config dict.
            params: A VariationParams instance or dict with keys:
                temperature_jitter, persona_perturbation,
                inject_timing_shift, agent_order_shuffle.

        Returns:
            Tuple of (varied_config, human-readable description of changes).
        """
        if isinstance(params, dict):
            params = VariationParams(**params)

        seed = self.base_seed + iteration_index
        rng = random.Random(seed)
        config = copy.deepcopy(base_config)
        changes: list[str] = []

        logger.info(
            "Generating variation %d with seed %d",
            iteration_index,
            seed,
        )

        if params.temperature_jitter > 0:
            self._apply_temperature_jitter(config, rng, jitter=params.temperature_jitter)
            changes.append(f"temp={config['_temperature_override']:.2f}")

        if params.persona_perturbation:
            modified_agents = self._apply_persona_perturbation(config, rng)
            if modified_agents:
                changes.append(f"persona_mods=[{', '.join(modified_agents)}]")

        if params.inject_timing_shift > 0:
            shifted = self._apply_inject_timing_shift(
                config, rng, max_shift=params.inject_timing_shift
            )
            if shifted:
                changes.append(f"timing_shifts={shifted}")

        if params.agent_order_shuffle:
            self._apply_agent_order_shuffle(config, rng)
            agent_order = [a["name"] for a in config.get("agent_profiles", [])]
            changes.append(f"order=[{', '.join(agent_order)}]")

        description = f"iteration={iteration_index} seed={seed} | " + " | ".join(
            changes
        )
        logger.debug("Variation %d: %s", iteration_index, description)

        return config, description

    # ------------------------------------------------------------------
    # Variation axes
    # ------------------------------------------------------------------

    @staticmethod
    def _apply_temperature_jitter(
        config: dict, rng: random.Random, jitter: float = 0.15
    ) -> None:
        """Add a ``_temperature_override`` field to the config.

        Base temperature is 0.7; jitter is applied as uniform noise in
        [-jitter, +jitter], clamped to [0.1, 1.0].
        """
        base_temp = 0.7
        offset = rng.uniform(-jitter, jitter)
        temp = max(0.1, min(1.0, base_temp + offset))
        config["_temperature_override"] = round(temp, 4)

    @staticmethod
    def _apply_persona_perturbation(
        config: dict, rng: random.Random
    ) -> list[str]:
        """Append 1-2 random mood modifiers to each agent's persona.

        Returns a list of agent names that were modified.
        """
        modified: list[str] = []
        for agent in config.get("agent_profiles", []):
            count = rng.randint(1, 2)
            modifiers = rng.sample(PERSONA_MODIFIER_POOL, k=count)
            modifier_text = " and ".join(modifiers) if count == 2 else modifiers[0]
            original = agent.get("persona", "")
            agent["persona"] = f"{original} Today, they are {modifier_text}."
            modified.append(agent.get("name", "unknown"))
        return modified

    @staticmethod
    def _apply_inject_timing_shift(
        config: dict, rng: random.Random, max_shift: int = 1
    ) -> list[dict]:
        """Shift scheduled event rounds by up to ±max_shift with 30% probability.

        Round-1 events (initial conditions) are never shifted.
        All rounds are clamped to [1, total_rounds].

        Returns a list of dicts describing each shift applied.
        """
        total_rounds = config.get("total_rounds", 5)
        shifts: list[dict] = []

        for event in config.get("scheduled_events", []):
            original_round = event.get("round", 1)

            # Never shift round-1 events
            if original_round == 1:
                continue

            if rng.random() < 0.3:
                delta = rng.randint(-max_shift, max_shift)
                if delta == 0:
                    continue
                new_round = max(1, min(total_rounds, original_round + delta))
                if new_round != original_round:
                    shifts.append(
                        {"event_round": original_round, "shifted_to": new_round}
                    )
                    event["round"] = new_round

        return shifts

    @staticmethod
    def _apply_agent_order_shuffle(
        config: dict, rng: random.Random
    ) -> None:
        """Shuffle the ``agent_profiles`` list in-place to change acting order."""
        profiles = config.get("agent_profiles", [])
        rng.shuffle(profiles)
