import json
import time as _time
from datetime import datetime, timezone
from database import get_conn

# TTL in seconds
TTL = {
    "price":      5,
    "intraday":   300,   # 5 min
    "daily":      3600,  # 1 hr
    "news":       30,    # 30 sec — live news feed
    "econ":       3600,  # 1 hr
    "options":    300,   # 5 min
    "screener":   3600,  # 1 hr
    "financials": 3600,  # 1 hr
}

_TABLE_MAP = {
    "price":      ("price_cache",      "ticker"),
    "news":       ("news_cache",       "ticker"),
    "chart":      ("chart_cache",      "cache_key"),
    "econ":       ("econ_cache",       "series_id"),
    "financials": ("financials_cache", "ticker"),
    "macro":      ("macro_input_cache", "input_key"),
    "options":    ("options_cache",    "cache_key"),
    "screener":   ("screener_cache",   "cache_key"),
}


def _now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()


def _table_for(table_name: str) -> tuple[str, str]:
    """Return (table, key_column) for a given logical table name."""
    try:
        return _TABLE_MAP[table_name]
    except KeyError:
        raise KeyError(f"Unknown cache table key: {table_name!r}. Valid keys: {list(_TABLE_MAP)}")


_HOT: dict[tuple[str, str], tuple[float, object]] = {}


def cache_get(table: str, key: str, ttl: int) -> dict | list | None:
    hot_key = (table, key)
    hot_entry = _HOT.get(hot_key)
    if hot_entry is not None:
        ts, val = hot_entry
        if _time.monotonic() - ts < min(ttl, 1.0):
            return val
    tbl, col = _table_for(table)
    with get_conn() as conn:
        row = conn.execute(
            f"SELECT data_json, cached_at FROM {tbl} WHERE {col} = ?", (key,)
        ).fetchone()
        if row is None:
            return None
        cached_at = datetime.fromisoformat(row["cached_at"]).replace(tzinfo=timezone.utc)
        age = _now_ts() - cached_at.timestamp()
        if age > ttl:
            return None
        return json.loads(row["data_json"])


def cache_set(table: str, key: str, data: dict | list) -> None:
    tbl, col = _table_for(table)
    now = datetime.now(timezone.utc).isoformat()
    payload = json.dumps(data)
    with get_conn() as conn:
        conn.execute(
            f"""INSERT INTO {tbl} ({col}, data_json, cached_at)
                VALUES (?, ?, ?)
                ON CONFLICT({col}) DO UPDATE SET data_json=excluded.data_json, cached_at=excluded.cached_at""",
            (key, payload, now),
        )
    _HOT[(table, key)] = (_time.monotonic(), data)


def cache_invalidate(table: str, key: str) -> None:
    tbl, col = _table_for(table)
    with get_conn() as conn:
        conn.execute(f"DELETE FROM {tbl} WHERE {col} = ?", (key,))
    _HOT.pop((table, key), None)
