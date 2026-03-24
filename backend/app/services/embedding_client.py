# backend/app/services/embedding_client.py
"""
Gemini Embedding Client — wraps the Google Gemini Embedding API for generating
vector embeddings. Used by FirestoreMemory for semantic search over memories.

Uses gemini-embedding-001 with output_dimensionality=768 (Firestore max is 2048,
default model output is 3072).
"""

from typing import Optional

from google import genai
from google.genai import types

from ..config import Config
from ..utils.cost_tracker import CostTracker
from ..utils.logger import get_logger

logger = get_logger("embedding_client")

MODEL = "gemini-embedding-001"
OUTPUT_DIMENSIONALITY = 768
MAX_BATCH_SIZE = 250


class GeminiEmbeddingClient:
    """Generates vector embeddings via the Gemini Embedding API."""

    def __init__(self, api_key: Optional[str] = None, cost_tracker: Optional[CostTracker] = None):
        self.api_key = api_key or Config.LLM_API_KEY
        self.cost_tracker = cost_tracker
        self.client = genai.Client(api_key=self.api_key)
        logger.info(f"GeminiEmbeddingClient initialised (model={MODEL}, dims={OUTPUT_DIMENSIONALITY})")

    def embed_document(self, text: str) -> list[float]:
        """Embed a single text for storage (RETRIEVAL_DOCUMENT)."""
        return self._embed_single(text, task_type="RETRIEVAL_DOCUMENT")

    def embed_query(self, text: str) -> list[float]:
        """Embed a single text for querying (RETRIEVAL_QUERY)."""
        return self._embed_single(text, task_type="RETRIEVAL_QUERY")

    def embed_batch(self, texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        """Embed a batch of texts. Chunks into groups of MAX_BATCH_SIZE if needed."""
        if not texts:
            return []

        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), MAX_BATCH_SIZE):
            chunk = texts[i : i + MAX_BATCH_SIZE]
            embeddings = self._call_api(chunk, task_type)
            all_embeddings.extend(embeddings)

        return all_embeddings

    # ── internal ──────────────────────────────────────────────────────────

    def _embed_single(self, text: str, task_type: str) -> list[float]:
        """Embed a single text and return the vector."""
        results = self._call_api([text], task_type)
        return results[0]

    def _call_api(self, texts: list[str], task_type: str) -> list[list[float]]:
        """Call the Gemini embedding API for a list of texts (max 100)."""
        try:
            result = self.client.models.embed_content(
                model=MODEL,
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=OUTPUT_DIMENSIONALITY,
                ),
            )

            embeddings = [e.values for e in result.embeddings]

            # Track cost if tracker is available
            if self.cost_tracker:
                approx_tokens = sum(len(t.split()) * 1.3 for t in texts)
                self.cost_tracker.track_embedding(
                    phase="memory",
                    input_tokens=int(approx_tokens),
                    description=f"embed {len(texts)} text(s) ({task_type})",
                    model=MODEL,
                )

            logger.debug(f"Embedded {len(texts)} text(s) ({task_type}), dim={OUTPUT_DIMENSIONALITY}")
            return embeddings

        except Exception as e:
            logger.error(f"Embedding API call failed: {e}")
            raise
