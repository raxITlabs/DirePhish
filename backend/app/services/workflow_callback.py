"""Workflow callback helper — resumes WDK hooks on the frontend when backend phases complete."""

import os
import time
import logging

import requests

logger = logging.getLogger(__name__)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "")

_cached_frontend_url: str | None = None


def _detect_frontend_url() -> str:
    """Auto-detect the frontend URL by trying known endpoints."""
    global _cached_frontend_url
    if FRONTEND_URL:
        return FRONTEND_URL
    if _cached_frontend_url:
        return _cached_frontend_url
    # Try portless proxy first, then direct ports
    candidates = [
        "http://direphish.localhost:1355",  # portless proxy
        "http://localhost:3000",             # next start (prod)
        "http://localhost:4942",             # next dev (portless dev port)
    ]
    for url in candidates:
        try:
            resp = requests.get(f"{url}/api/runs", timeout=2)
            if resp.status_code == 200:
                logger.info("Auto-detected frontend at %s", url)
                _cached_frontend_url = url
                return url
        except requests.RequestException:
            continue
    _cached_frontend_url = candidates[0]
    return candidates[0]


def resume_workflow_hook(token: str, data: dict, max_retries: int = 5) -> bool:
    """POST to frontend to resume a WDK workflow hook.

    Retries with exponential backoff if the hook isn't created yet (404).
    Returns True on success, False if all retries exhausted.
    """
    base = _detect_frontend_url()
    url = f"{base}/api/pipeline/resume"
    for attempt in range(max_retries):
        try:
            resp = requests.post(
                url, json={"token": token, "data": data}, timeout=5
            )
            if resp.status_code == 200:
                logger.info("Resumed workflow hook %s", token)
                return True
            if resp.status_code == 404:
                delay = min(2**attempt, 16)
                logger.debug(
                    "Hook %s not ready, retry in %ds (attempt %d/%d)",
                    token,
                    delay,
                    attempt + 1,
                    max_retries,
                )
                time.sleep(delay)
                continue
            logger.warning(
                "Hook resume %s returned HTTP %d: %s",
                token,
                resp.status_code,
                resp.text[:200],
            )
            return False
        except requests.RequestException as e:
            delay = min(2**attempt, 16)
            logger.warning(
                "Hook resume %s failed: %s, retry in %ds", token, e, delay
            )
            time.sleep(delay)

    logger.error("Failed to resume hook %s after %d retries", token, max_retries)
    return False
