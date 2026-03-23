import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
import pytest
from database import init_db


def test_financials_cache_table_exists(temp_db):
    """financials_cache table is created by init_db."""
    init_db(temp_db)
    with sqlite3.connect(temp_db) as conn:
        tables = [
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
    assert "financials_cache" in tables


def test_financials_cache_columns(temp_db):
    """financials_cache has the right schema."""
    init_db(temp_db)
    with sqlite3.connect(temp_db) as conn:
        cols = [
            r[1] for r in conn.execute(
                "PRAGMA table_info(financials_cache)"
            ).fetchall()
        ]
    assert "ticker" in cols
    assert "data_json" in cols
    assert "cached_at" in cols


def test_financials_cache_set_and_get(temp_db):
    """cache_set/cache_get round-trip works for the 'financials' key."""
    init_db(temp_db)
    from cache import cache_set, cache_get, TTL
    payload = {"revenue_ttm": 385_706_000_000.0, "eps_ttm": 6.13}
    cache_set("financials", "AAPL", payload)
    result = cache_get("financials", "AAPL", TTL["financials"])
    assert result == payload


def test_financials_cache_miss_returns_none(temp_db):
    """cache_get returns None when key is not present."""
    init_db(temp_db)
    from cache import cache_get, TTL
    result = cache_get("financials", "MISSING", TTL["financials"])
    assert result is None
