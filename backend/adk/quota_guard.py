"""Gemini DSQ quota guard — retry-with-backoff (and optional throttle) around
the google-genai async call ADK uses.

On project ``raxit-ai`` Gemini runs under Dynamic Shared Quota (DSQ), tiered by
30-day spend. 429 RESOURCE_EXHAUSTED is transient pool contention, but ADK's
built-in retry backs off too briefly and gives up, which kills a multi-agent
sim. Installing this guard makes every Gemini call retry patiently, so a live
demo on a low tier completes instead of crashing.

Call ``install()`` once at process start (runner + judge service). Idempotent.
Env:
  DIREPHISH_GEMINI_BACKOFF=0   disable entirely
  DIREPHISH_GEMINI_THROTTLE=<s>  min seconds between calls (default 0 = none)
"""

from __future__ import annotations

import asyncio
import logging
import os
import time

logger = logging.getLogger("direphish.quota_guard")

_installed = False


def install() -> None:
    """Monkeypatch google.genai AsyncModels.generate_content with 429 backoff."""
    global _installed
    if _installed:
        return
    if os.environ.get("DIREPHISH_GEMINI_BACKOFF", "1") == "0":
        return

    try:
        import google.genai.models as _gm
    except Exception as exc:  # noqa: BLE001 - genai always present in prod
        logger.warning("quota_guard: google.genai unavailable: %s", exc)
        return

    throttle = float(os.environ.get("DIREPHISH_GEMINI_THROTTLE", "0"))
    orig = _gm.AsyncModels.generate_content
    gate = {"last": 0.0}
    lock = asyncio.Lock()

    async def guarded(self, *args, **kwargs):
        for attempt in range(6):
            if throttle > 0:
                async with lock:
                    delta = time.monotonic() - gate["last"]
                    if delta < throttle:
                        await asyncio.sleep(throttle - delta)
                    gate["last"] = time.monotonic()
            try:
                return await orig(self, *args, **kwargs)
            except Exception as exc:  # noqa: BLE001
                if "RESOURCE_EXHAUSTED" in str(exc) and attempt < 5:
                    backoff = 10.0 * (attempt + 1)
                    logger.warning(
                        "quota_guard: 429 -> backoff %.0fs (try %d)", backoff, attempt + 1
                    )
                    await asyncio.sleep(backoff)
                    continue
                raise

    _gm.AsyncModels.generate_content = guarded
    _installed = True
    logger.info(
        "quota_guard installed (throttle=%.1fs, max 6 tries, 10-50s backoff)", throttle
    )
