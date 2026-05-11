"""Probe Vertex AI for which Gemini model IDs the active project can reach.

Tries a list of candidate IDs against multiple regions and reports
which combinations resolve. Used to pick the right values for
GEMINI_PRO_MODEL_NAME / GEMINI_FLASH_MODEL_NAME in .env.

Usage:
    cd backend && uv run python scripts/probe_vertex_models.py

Requires: GOOGLE_CLOUD_PROJECT, GOOGLE_GENAI_USE_VERTEXAI=TRUE,
Application Default Credentials set up.
"""

from __future__ import annotations

import asyncio
import os
import sys

# Candidates spanning Gemini 3.1, 3.0, 2.5 families. Covers both the
# preview-suffixed AI Studio names and the GA-on-Vertex names.
GEMINI_CANDIDATES = [
    "gemini-3.1-pro-preview",
    "gemini-3.1-pro",
    "gemini-3.1-flash",
    "gemini-3.1-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash",
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",  # known retired 2026-03-26
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
]

REGIONS = ["us-east5", "us-central1", "global"]


async def probe_one(project: str, location: str, model_id: str) -> tuple[bool, str]:
    """Return (ok, message) for one (location, model) attempt."""
    from google.genai import types as _types
    from google.genai import Client

    os.environ["GOOGLE_CLOUD_LOCATION"] = location  # mutate per attempt
    try:
        client = Client(vertexai=True, project=project, location=location)
        resp = client.models.generate_content(
            model=model_id,
            contents="ping",
            config=_types.GenerateContentConfig(max_output_tokens=4),
        )
        text = resp.text if resp and getattr(resp, "text", None) else "(no text)"
        return True, f"ok: {text[:30]!r}"
    except Exception as e:
        msg = str(e)
        if "404" in msg or "NOT_FOUND" in msg:
            return False, "404 not found"
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            return True, "429 quota (model exists)"
        if "403" in msg or "PERMISSION_DENIED" in msg:
            return False, "403 no access"
        return False, msg[:100]


async def main() -> int:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        print("error: GOOGLE_CLOUD_PROJECT not set", file=sys.stderr)
        return 2

    print(f"Probing project={project} across {len(REGIONS)} regions × "
          f"{len(GEMINI_CANDIDATES)} model IDs\n")

    results: dict[str, list[tuple[str, str]]] = {r: [] for r in REGIONS}

    for region in REGIONS:
        print(f"--- {region} ---")
        for model_id in GEMINI_CANDIDATES:
            ok, note = await probe_one(project, region, model_id)
            mark = "✓" if ok else "✗"
            print(f"  {mark} {model_id:<40} {note}")
            results[region].append((model_id, note if ok else ""))
        print()

    # Summary: per region, which models we can actually use
    print("=" * 60)
    print("SUMMARY — usable IDs per region (200 OK or 429 quota):")
    for region, rows in results.items():
        usable = [m for m, n in rows if n]
        print(f"  {region}: {usable if usable else '(none)'}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
