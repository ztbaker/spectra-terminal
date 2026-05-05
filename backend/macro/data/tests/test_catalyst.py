"""Tests for catalyst calendar builder."""

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from macro.data.catalyst import (
    FRED_RELEASE_MAP,
    _assets_to_str,
    _generate_eia_events,
    _generate_opec_events,
    _store_events,
    _str_to_assets,
)
from macro.models import CatalystEvent
from macro.types import AssetSymbol


# ─── Fixtures ──────────────────────────────────────────────────────────────────

_db_path = None


@contextmanager
def _test_get_conn(db_path=None):
    path = db_path or _db_path
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@pytest.fixture(autouse=True)
def _tmp_db(tmp_path, monkeypatch):
    global _db_path
    db_path = str(tmp_path / "test.db")
    _db_path = db_path

    from database import init_db
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_macro_catalysts_dedup "
        "ON macro_catalysts(event_date, event_type, event_label)"
    )
    conn.commit()
    conn.close()

    monkeypatch.setattr("macro.data.catalyst.cache_get", lambda *a, **kw: None)
    monkeypatch.setattr("macro.data.catalyst.cache_set", lambda *a, **kw: None)

    @contextmanager
    def _patched_get_conn(db_path_arg=None):
        path = db_path_arg or _db_path
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    monkeypatch.setattr("macro.data.catalyst.get_conn", _patched_get_conn)
    yield db_path


def _make_catalyst(**overrides) -> CatalystEvent:
    defaults = dict(
        event_date=date.today().isoformat(),
        event_time="08:30",
        event_type="CPI",
        event_label="CPI MoM (Jan)",
        assets_impacted=[AssetSymbol.SPY, AssetSymbol.VIX, AssetSymbol.GLD, AssetSymbol.DXY],
        consensus_value=None,
        prior_value=0.3,
        surprise_weight=1.5,
        straddle_implied_move=None,
    )
    defaults.update(overrides)
    return CatalystEvent(**defaults)


def _count_rows(db_path, where="1=1"):
    conn = sqlite3.connect(db_path)
    count = conn.execute(f"SELECT COUNT(*) FROM macro_catalysts WHERE {where}").fetchone()[0]
    conn.close()
    return count


# ─── Unit Tests ─────────────────────────────────────────────────────────────────

class TestAssetSerialization:
    def test_assets_to_str(self):
        assets = [AssetSymbol.SPY, AssetSymbol.VIX]
        s = _assets_to_str(assets)
        parsed = json.loads(s)
        assert parsed == ["SPY", "VIX"]

    def test_str_to_assets(self):
        s = json.dumps(["SPY", "VIX", "GLD"])
        assets = _str_to_assets(s)
        assert assets == [AssetSymbol.SPY, AssetSymbol.VIX, AssetSymbol.GLD]


class TestEIAGeneration:
    def test_generates_wednesdays_only(self):
        events = _generate_eia_events(21)
        for ev in events:
            d = date.fromisoformat(ev.event_date)
            assert d.weekday() == 2, f"{ev.event_date} is not a Wednesday"

    def test_eia_fields(self):
        events = _generate_eia_events(21)
        assert len(events) >= 2
        ev = events[0]
        assert ev.event_type == "EIA"
        assert ev.event_time == "10:30"
        assert AssetSymbol.WTI in ev.assets_impacted
        assert AssetSymbol.BRENT in ev.assets_impacted
        assert ev.surprise_weight == 1.0

    def test_eia_within_window(self):
        events = _generate_eia_events(14)
        today = date.today()
        end = today + timedelta(days=14)
        for ev in events:
            d = date.fromisoformat(ev.event_date)
            assert today <= d <= end


class TestOPECGeneration:
    def test_opec_events_in_window(self):
        events = _generate_opec_events(365)
        assert len(events) > 0
        for ev in events:
            assert ev.event_type == "OPEC"
            assert AssetSymbol.WTI in ev.assets_impacted
            assert ev.surprise_weight == 1.5

    def test_opec_future_dates_only(self):
        events = _generate_opec_events(365)
        today = date.today()
        for ev in events:
            d = date.fromisoformat(ev.event_date)
            assert d >= today


class TestStoreAndRetrieve:
    def test_store_and_retrieve(self, _tmp_db):
        ev = _make_catalyst()
        _store_events([ev])
        from macro.data.catalyst import get_conn
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT event_type, event_label FROM macro_catalysts WHERE event_type='CPI'"
            ).fetchall()
        assert len(rows) >= 1

    def test_no_duplicates_on_repeated_store(self, _tmp_db):
        ev = _make_catalyst()
        _store_events([ev])
        _store_events([ev])
        count = _count_rows(_tmp_db, "event_type='CPI'")
        assert count == 1

    def test_past_event_cleanup(self, _tmp_db):
        from macro.data.catalyst import get_conn
        past_ev = _make_catalyst(
            event_date=(date.today() - timedelta(days=7)).isoformat(),
            event_label="Past CPI",
        )
        future_ev = _make_catalyst(event_label="Future CPI")
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_catalysts (event_date, event_time, event_type, event_label, assets_impacted, consensus_value, prior_value, surprise_weight, straddle_implied_move) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (past_ev.event_date, past_ev.event_time, past_ev.event_type, past_ev.event_label, _assets_to_str(past_ev.assets_impacted), None, None, 1.0, None),
            )
        _store_events([future_ev])
        count = _count_rows(_tmp_db)
        assert count == 1


def _run_async(coro):
    import asyncio
    return asyncio.run(coro)


class TestCatalystDensity:
    def test_density_count(self, _tmp_db):
        ev1 = _make_catalyst(
            event_type="CPI",
            event_label="CPI Test 1",
            assets_impacted=[AssetSymbol.SPY, AssetSymbol.VIX],
        )
        ev2 = _make_catalyst(
            event_type="PPI",
            event_label="PPI Test 1",
            assets_impacted=[AssetSymbol.SPY, AssetSymbol.WTI],
        )
        _store_events([ev1, ev2])

        from macro.data.catalyst import get_catalyst_density
        density = _run_async(get_catalyst_density("SPY", 1))
        assert density == 2

    def test_density_per_asset(self, _tmp_db):
        ev = _make_catalyst(
            event_type="PPI",
            event_label="PPI Oil",
            assets_impacted=[AssetSymbol.WTI, AssetSymbol.BRENT],
        )
        _store_events([ev])

        from macro.data.catalyst import get_catalyst_density
        density_wti = _run_async(get_catalyst_density("WTI", 1))
        density_spy = _run_async(get_catalyst_density("SPY", 1))
        assert density_wti == 1
        assert density_spy == 0


class TestFREDMapping:
    def test_fred_release_mapping_covers_key_events(self):
        assert "Consumer Price Index" in FRED_RELEASE_MAP
        assert "Employment Situation" in FRED_RELEASE_MAP
        assert "FOMC Press Release" in FRED_RELEASE_MAP
        assert "Producer Price Index" in FRED_RELEASE_MAP
        assert "Advance Retail Sales" in FRED_RELEASE_MAP

    def test_fred_event_types(self):
        types = {v["event_type"] for v in FRED_RELEASE_MAP.values()}
        assert "CPI" in types
        assert "PPI" in types
        assert "NFP" in types
        assert "FOMC" in types
        assert "RETAIL" in types

    @pytest.mark.asyncio
    async def test_fred_fetch_with_mock(self, _tmp_db):
        from macro.data.catalyst import _fetch_fred_release_dates
        mock_response_data = {
            "release_dates": [
                {
                    "release_name": "Consumer Price Index",
                    "release_id": 10,
                    "date": (date.today() + timedelta(days=5)).isoformat(),
                },
            ],
        }
        with patch("macro.data.catalyst.httpx.AsyncClient") as mock_client_cls:
            mock_resp = MagicMock()
            mock_resp.json.return_value = mock_response_data
            mock_resp.raise_for_status = MagicMock()
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            with patch.dict(os.environ, {"FRED_API_KEY": "testkey"}):
                events = await _fetch_fred_release_dates("testkey", 21)
                assert len(events) >= 1
                assert events[0].event_type == "CPI"