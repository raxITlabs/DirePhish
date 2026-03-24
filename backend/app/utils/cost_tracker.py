"""
Cost Tracker for Google API usage per simulation.

Tracks LLM token usage (including cached tokens), search grounding queries,
and embedding requests, then calculates estimated cost based on Google's pricing.

Pricing source: https://ai.google.dev/gemini-api/docs/pricing (verified 2026-03-23)
Uses batch-tier rates as baseline — standard tier is currently free for most models
but batch rates represent the actual compute cost at scale.
"""

import json
import os
import logging
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ─── LLM Pricing per 1M tokens (USD) ───
# Format: model_prefix → (input_per_1m, output_per_1m, cached_input_per_1m)
# Source: https://ai.google.dev/gemini-api/docs/pricing (March 2026 batch rates)
MODEL_PRICING = {
    # Gemini 3.x (latest)
    "gemini-3.1-pro":        (2.00, 12.00, 0.20),
    "gemini-3.1-flash-lite": (0.25, 1.50,  0.025),
    "gemini-3-flash":        (0.25, 1.50,  0.025),
    # Gemini 2.5
    "gemini-2.5-pro":        (1.25, 10.00, 0.125),
    "gemini-2.5-flash-lite": (0.05, 0.20,  0.01),
    "gemini-2.5-flash":      (0.15, 1.25,  0.03),
    # Gemini 2.0 (deprecated June 2026)
    "gemini-2.0-flash":      (0.05, 0.20,  0.025),
    # Fallback
    "default":               (0.25, 1.50,  0.025),
}

# ─── Search Grounding Pricing ───
# Gemini 3.x: $14 per 1,000 search queries
# Gemini 2.5: $35 per 1,000 grounded prompts
SEARCH_GROUNDING_PER_QUERY_GEMINI3 = 14.0 / 1000   # $0.014
SEARCH_GROUNDING_PER_PROMPT_GEMINI25 = 35.0 / 1000  # $0.035
# Default (used when model version unknown)
SEARCH_GROUNDING_PER_QUERY = 14.0 / 1000  # $0.014

# ─── Embedding Pricing per 1M tokens ───
EMBEDDING_PRICING = {
    "gemini-embedding-2": 0.20,    # gemini-embedding-2-preview
    "gemini-embedding-001": 0.15,
    "default": 0.20,
}

# ─── Context Cache Storage (per 1M tokens per hour) ───
CACHE_STORAGE_PER_1M_PER_HOUR = {
    "gemini-3.1-flash-lite": 1.00,
    "gemini-3-flash": 1.00,
    "gemini-2.5-flash": 1.00,
    "gemini-2.5-flash-lite": 1.00,
    "gemini-2.5-pro": 4.50,
    "gemini-3.1-pro": 4.50,
    "default": 1.00,
}


def _get_model_pricing(model_name: str) -> tuple:
    """Get (input_per_1m, output_per_1m, cached_per_1m) for a model."""
    for prefix, pricing in MODEL_PRICING.items():
        if prefix != "default" and model_name.startswith(prefix):
            return pricing
    return MODEL_PRICING["default"]


# ─── Firestore Pricing ───
# Reads: $0.03/100K, Writes: $0.09/100K
FIRESTORE_READ_PER_100K = 0.03
FIRESTORE_WRITE_PER_100K = 0.09


def _get_embedding_pricing(model_name: str) -> float:
    """Get per-1M-token cost for an embedding model."""
    for prefix, price in EMBEDDING_PRICING.items():
        if prefix != "default" and model_name.startswith(prefix):
            return price
    return EMBEDDING_PRICING["default"]


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
        cached_tokens: int = 0,
    ):
        """Track an LLM API call with optional cached token breakdown."""
        input_per_1m, output_per_1m, cached_per_1m = _get_model_pricing(model)

        # Cached tokens are charged at the cached rate, remaining at full rate
        non_cached_input = max(0, input_tokens - cached_tokens)
        cost = (
            non_cached_input * input_per_1m
            + cached_tokens * cached_per_1m
            + output_tokens * output_per_1m
        ) / 1_000_000

        self.entries.append({
            "type": "llm",
            "phase": phase,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cached_tokens": cached_tokens,
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

    def track_embedding(
        self,
        phase: str,
        input_tokens: int,
        description: str = "",
        model: str = "gemini-embedding-2-preview",
    ):
        """Track embedding API usage by input tokens."""
        price_per_1m = _get_embedding_pricing(model)
        cost = (input_tokens * price_per_1m) / 1_000_000
        self.entries.append({
            "type": "embedding",
            "phase": phase,
            "model": model,
            "input_tokens": input_tokens,
            "cost_usd": round(cost, 6),
            "description": description,
        })

    def track_firestore(
        self,
        phase: str,
        reads: int = 0,
        writes: int = 0,
        description: str = "",
    ):
        """Track Firestore read/write operations."""
        cost = (
            reads * FIRESTORE_READ_PER_100K / 100_000
            + writes * FIRESTORE_WRITE_PER_100K / 100_000
        )
        self.entries.append({
            "type": "firestore",
            "phase": phase,
            "reads": reads,
            "writes": writes,
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
                    "llm_cached_tokens": 0,
                    "llm_cost_usd": 0.0,
                    "search_queries": 0,
                    "search_cost_usd": 0.0,
                    "embedding_tokens": 0,
                    "embedding_cost_usd": 0.0,
                    "firestore_reads": 0,
                    "firestore_writes": 0,
                    "firestore_cost_usd": 0.0,
                    "cost_usd": 0.0,
                }
            p = phases[phase]
            p["cost_usd"] += entry["cost_usd"]
            if entry["type"] == "llm":
                p["llm_input_tokens"] += entry.get("input_tokens", 0)
                p["llm_output_tokens"] += entry.get("output_tokens", 0)
                p["llm_cached_tokens"] += entry.get("cached_tokens", 0)
                p["llm_cost_usd"] += entry.get("cost_usd", 0)
            elif entry["type"] == "search":
                p["search_queries"] += entry.get("query_count", 0)
                p["search_cost_usd"] += entry.get("cost_usd", 0)
            elif entry["type"] == "embedding":
                p["embedding_tokens"] += entry.get("input_tokens", 0)
                p["embedding_cost_usd"] += entry.get("cost_usd", 0)
            elif entry["type"] == "firestore":
                p["firestore_reads"] += entry.get("reads", 0)
                p["firestore_writes"] += entry.get("writes", 0)
                p["firestore_cost_usd"] += entry.get("cost_usd", 0)

        # Round costs
        for p in phases.values():
            p["cost_usd"] = round(p["cost_usd"], 6)
            p["llm_cost_usd"] = round(p["llm_cost_usd"], 6)
            p["search_cost_usd"] = round(p["search_cost_usd"], 6)
            p["embedding_cost_usd"] = round(p["embedding_cost_usd"], 6)
            p["firestore_cost_usd"] = round(p["firestore_cost_usd"], 6)

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
