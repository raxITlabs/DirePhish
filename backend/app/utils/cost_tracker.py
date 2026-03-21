"""
Cost Tracker for Google API usage per simulation.

Tracks LLM token usage, search grounding queries, and embedding requests,
then calculates estimated cost based on Google's pricing.
"""

import json
import os
import logging
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Pricing per 1M tokens (USD) — Google AI Studio rates (verified 2026-03-21)
MODEL_PRICING = {
    # model_name_prefix: (input_per_1m, output_per_1m)
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.0-flash": (0.15, 0.60),
    "gemini-2.5-pro": (1.25, 10.00),
    # Fallback
    "default": (0.25, 1.50),
}

# Google Search grounding: $14 per 1K search queries for Gemini 3.1 models
SEARCH_GROUNDING_PER_QUERY = 14.0 / 1000  # $0.014

# Embeddings: $0.20 per 1M input tokens (gemini-embedding-2-preview)
EMBEDDING_PER_1M_TOKENS = 0.20


def _get_model_pricing(model_name: str) -> tuple:
    """Get (input_per_1m, output_per_1m) for a model."""
    for prefix, pricing in MODEL_PRICING.items():
        if prefix != "default" and model_name.startswith(prefix):
            return pricing
    return MODEL_PRICING["default"]


class CostTracker:
    """Accumulates API costs for a single simulation."""

    def __init__(self, sim_id: str):
        self.sim_id = sim_id
        self.entries: list[dict] = []
        self._created_at = datetime.now(timezone.utc).isoformat()

    def track_llm(
        self,
        phase: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        description: str = "",
    ):
        """Track an LLM API call."""
        input_per_1m, output_per_1m = _get_model_pricing(model)
        cost = (input_tokens * input_per_1m + output_tokens * output_per_1m) / 1_000_000
        self.entries.append({
            "type": "llm",
            "phase": phase,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": round(cost, 6),
            "description": description,
        })

    def track_search(self, phase: str, query_count: int, description: str = ""):
        """Track Google Search grounding queries."""
        cost = query_count * SEARCH_GROUNDING_PER_QUERY
        self.entries.append({
            "type": "search",
            "phase": phase,
            "query_count": query_count,
            "cost_usd": round(cost, 6),
            "description": description,
        })

    def track_embedding(self, phase: str, input_tokens: int, description: str = ""):
        """Track embedding API usage by input tokens."""
        cost = (input_tokens * EMBEDDING_PER_1M_TOKENS) / 1_000_000
        self.entries.append({
            "type": "embedding",
            "phase": phase,
            "input_tokens": input_tokens,
            "cost_usd": round(cost, 6),
            "description": description,
        })

    def total_cost(self) -> float:
        return round(sum(e["cost_usd"] for e in self.entries), 6)

    def summary(self) -> dict:
        """Return cost summary grouped by phase."""
        phases: dict[str, dict] = {}
        for entry in self.entries:
            phase = entry["phase"]
            if phase not in phases:
                phases[phase] = {
                    "llm_input_tokens": 0,
                    "llm_output_tokens": 0,
                    "search_queries": 0,
                    "embedding_tokens": 0,
                    "cost_usd": 0.0,
                }
            p = phases[phase]
            p["cost_usd"] += entry["cost_usd"]
            if entry["type"] == "llm":
                p["llm_input_tokens"] += entry.get("input_tokens", 0)
                p["llm_output_tokens"] += entry.get("output_tokens", 0)
            elif entry["type"] == "search":
                p["search_queries"] += entry.get("query_count", 0)
            elif entry["type"] == "embedding":
                p["embedding_tokens"] += entry.get("input_tokens", 0)

        # Round phase costs
        for p in phases.values():
            p["cost_usd"] = round(p["cost_usd"], 6)

        return {
            "sim_id": self.sim_id,
            "total_cost_usd": self.total_cost(),
            "created_at": self._created_at,
            "phases": phases,
            "entries": self.entries,
        }

    def save(self, base_dir: Optional[str] = None):
        """Persist costs to uploads/simulations/{sim_id}/costs.json."""
        if base_dir is None:
            base_dir = os.path.join("uploads", "simulations", self.sim_id)
        os.makedirs(base_dir, exist_ok=True)
        path = os.path.join(base_dir, "costs.json")
        with open(path, "w") as f:
            json.dump(self.summary(), f, indent=2)
        logger.info(f"Cost summary saved: {path} (total: ${self.total_cost():.4f})")

    @staticmethod
    def load(sim_id: str, base_dir: Optional[str] = None) -> Optional[dict]:
        """Load costs.json for a simulation, returns None if not found."""
        if base_dir is None:
            base_dir = os.path.join("uploads", "simulations", sim_id)
        path = os.path.join(base_dir, "costs.json")
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return json.load(f)
