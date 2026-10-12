"""Small in-process sliding-window rate limiter for authentication endpoints.

Limitation (documented in docs/SECURITY.md): state is per process, so with N replicas the
effective limit is N times higher. Replace with a shared store if/when the deployment needs it.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from app.core.errors import RateLimited


class RateLimiter:
    def __init__(self, max_events: int, window_seconds: float) -> None:
        self.max_events = max_events
        self.window = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Record an attempt; raise RateLimited when the key exceeded the window budget."""
        now = time.monotonic()
        with self._lock:
            events = self._events[key]
            while events and now - events[0] > self.window:
                events.popleft()
            if len(events) >= self.max_events:
                raise RateLimited()
            events.append(now)
            if len(self._events) > 10_000:  # bound memory
                stale = [k for k, v in self._events.items() if not v or now - v[-1] > self.window]
                for key in stale:
                    del self._events[key]

    def reset(self) -> None:
        with self._lock:
            self._events.clear()
