import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Awaitable, TypeVar, AsyncIterator

T = TypeVar("T")

IO_EXECUTOR = ThreadPoolExecutor(max_workers=32, thread_name_prefix="spectra-io")

_inflight: dict[str, asyncio.Task] = {}


async def coalesce(key: str, factory: Callable[[], Awaitable[T]]) -> T:
    if key in _inflight:
        return await _inflight[key]
    task = asyncio.ensure_future(factory())
    _inflight[key] = task
    try:
        return await task
    finally:
        _inflight.pop(key, None)


class MemCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str, ttl: float) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.monotonic() - ts > ttl:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (time.monotonic(), value)

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)


MEM = MemCache()


class Circuit:
    def __init__(self, cooldown_s: float = 30.0) -> None:
        self._cooldown_s = cooldown_s
        self._tripped: dict[str, float] = {}

    def trip(self, key: str) -> None:
        self._tripped[key] = time.monotonic() + self._cooldown_s

    def is_tripped(self, key: str) -> bool:
        until = self._tripped.get(key)
        if until is None:
            return False
        if time.monotonic() < until:
            return True
        del self._tripped[key]
        return False


CIRCUIT = Circuit()


async def stream_quotes(
    ticker: str,
    fetch: Callable[[str], Awaitable[dict]],
    interval_s: float = 1.0,
) -> AsyncIterator[dict]:
    while True:
        try:
            data = await fetch(ticker)
            yield data
        except Exception as e:
            yield {"error": str(e), "ticker": ticker}
        await asyncio.sleep(interval_s)