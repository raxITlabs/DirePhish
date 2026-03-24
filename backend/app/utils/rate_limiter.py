"""
Rate limiter utilities for Gemini API calls during concurrent Monte Carlo simulations.

Provides both async and sync sliding-window rate limiters to stay within
RPM (requests per minute) quotas. Default is 60 RPM (free tier); paid tier
supports up to 1500 RPM. Configure via the GEMINI_RPM_LIMIT env var.
"""

import asyncio
import collections
import threading
import time
from typing import Optional

from app.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)


class AsyncRateLimiter:
    """Sliding window rate limiter for async LLM calls.

    Usage:
        limiter = AsyncRateLimiter(requests_per_minute=60)
        await limiter.acquire()
        try:
            response = client.chat.completions.create(...)
        finally:
            limiter.release()
    """

    def __init__(self, requests_per_minute: Optional[int] = None):
        self._rpm = requests_per_minute or Config.GEMINI_RPM_LIMIT
        self._window = 60.0  # seconds
        self._semaphore = asyncio.Semaphore(self._rpm)
        self._timestamps: collections.deque[float] = collections.deque()
        self._lock = asyncio.Lock()
        self._pending = 0
        logger.info(f"AsyncRateLimiter initialised: {self._rpm} RPM")

    async def acquire(self):
        """Wait until rate limit allows another request."""
        self._pending += 1
        try:
            await self._semaphore.acquire()
            async with self._lock:
                now = time.monotonic()
                # Evict timestamps outside the sliding window
                while self._timestamps and self._timestamps[0] <= now - self._window:
                    self._timestamps.popleft()
                # If window is full, sleep until the oldest request expires
                if len(self._timestamps) >= self._rpm:
                    sleep_for = self._timestamps[0] - (now - self._window)
                    if sleep_for > 0:
                        logger.debug(
                            f"Rate limit reached ({self._rpm} RPM). "
                            f"Sleeping {sleep_for:.2f}s"
                        )
                        await asyncio.sleep(sleep_for)
                    # Evict again after sleeping
                    now = time.monotonic()
                    while self._timestamps and self._timestamps[0] <= now - self._window:
                        self._timestamps.popleft()
                self._timestamps.append(time.monotonic())
        finally:
            self._pending -= 1

    def release(self):
        """Called after request completes."""
        self._semaphore.release()

    @property
    def pending(self) -> int:
        """Number of requests waiting to acquire."""
        return self._pending


class SyncRateLimiter:
    """Thread-safe rate limiter for synchronous code.

    Usage:
        limiter = SyncRateLimiter(requests_per_minute=60)
        limiter.acquire()
        try:
            response = client.chat.completions.create(...)
        finally:
            limiter.release()
    """

    def __init__(self, requests_per_minute: Optional[int] = None):
        self._rpm = requests_per_minute or Config.GEMINI_RPM_LIMIT
        self._window = 60.0  # seconds
        self._semaphore = threading.Semaphore(self._rpm)
        self._timestamps: collections.deque[float] = collections.deque()
        self._lock = threading.Lock()
        self._pending = 0
        logger.info(f"SyncRateLimiter initialised: {self._rpm} RPM")

    def acquire(self):
        """Wait until rate limit allows another request."""
        self._pending += 1
        try:
            self._semaphore.acquire()
            with self._lock:
                now = time.monotonic()
                # Evict timestamps outside the sliding window
                while self._timestamps and self._timestamps[0] <= now - self._window:
                    self._timestamps.popleft()
                # If window is full, sleep until the oldest request expires
                if len(self._timestamps) >= self._rpm:
                    sleep_for = self._timestamps[0] - (now - self._window)
                    if sleep_for > 0:
                        logger.debug(
                            f"Rate limit reached ({self._rpm} RPM). "
                            f"Sleeping {sleep_for:.2f}s"
                        )
                        time.sleep(sleep_for)
                    # Evict again after sleeping
                    now = time.monotonic()
                    while self._timestamps and self._timestamps[0] <= now - self._window:
                        self._timestamps.popleft()
                self._timestamps.append(time.monotonic())
        finally:
            self._pending -= 1

    def release(self):
        """Called after request completes."""
        self._semaphore.release()

    @property
    def pending(self) -> int:
        """Number of requests waiting to acquire."""
        return self._pending
