"""Tests for CFTC COT scraper and CME FedWatch probability extractor."""

import sqlite3
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from macro.models import CftcPosition, FedWatchMeeting, FedWatchState


COMMODITIES_SAMPLE = (
    "Market_and_Exchange_Names|As_of_Date_In_Form_YYYY-MM-DD|Open_Interest|"
    "NonComm_Long|NonComm_Short|Change_in_NonComm_Long|Change_in_NonComm_Short\n"
    "GOLD - COMMODITY EXCHANGE|2025-01-21|600000|250000|120000|5000|-3000\n"
    "SILVER - COMMODITY EXCHANGE|2025-01-21|180000|75000|40000|2000|-1000\n"
    "CRUDE OIL, LIGHT SWEET - NEW YORK|2025-01-21|1500000|350000|200000|8000|-5000\n"
    "COPPER - COMMODITY EXCHANGE|2025-01-21|80000|30000|20000|1000|-500\n"
)

FINANCIALS_SAMPLE = (
    "Market_and_Exchange_Names|As_of_Date_In_Form_YYYY-MM-DD|Open_Interest|"
    "NonComm_Long|NonComm_Short|Change_in_NonComm_Long|Change_in_NonComm_Short\n"
    "U.S. DOLLAR INDEX - ICE|2025-01-21|50000|20000|15000|2000|-1000\n"
    "S&P 500 - CME|2025-01-21|2000000|500000|300000|10000|-5000\n"
)


@pytest.fixture
def db(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS macro_cftc_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_date TEXT NOT NULL,
            asset TEXT NOT NULL,
            net_long INTEGER,
            pct_oi REAL,
            change_1w INTEGER,
            UNIQUE(report_date, asset)
        );
        CREATE TABLE IF NOT EXISTS macro_input_cache (
            input_key TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            cached_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    conn.close()
    return db_path


class TestCftcParser:
    def test_parse_pipe_csv(self):
        from macro.data.cftc_scraper import _parse_pipe_csv

        df = _parse_pipe_csv(COMMODITIES_SAMPLE)
        assert not df.empty
        assert len(df) >= 3

    def test_extract_positions_gold(self):
        from macro.data.cftc_scraper import _extract_positions, _parse_pipe_csv

        comm_df = _parse_pipe_csv(COMMODITIES_SAMPLE)
        fin_df = _parse_pipe_csv(FINANCIALS_SAMPLE)
        positions = _extract_positions(comm_df, fin_df)

        gold = [p for p in positions if p["asset"] == "GC"]
        assert len(gold) == 1
        assert gold[0]["net_long"] == 250000 - 120000
        assert gold[0]["report_date"] == "2025-01-21"

    def test_extract_positions_all_assets(self):
        from macro.data.cftc_scraper import _extract_positions, _parse_pipe_csv

        comm_df = _parse_pipe_csv(COMMODITIES_SAMPLE)
        fin_df = _parse_pipe_csv(FINANCIALS_SAMPLE)
        positions = _extract_positions(comm_df, fin_df)

        assets_found = {p["asset"] for p in positions}
        assert "GC" in assets_found
        assert "SI" in assets_found
        assert "CL" in assets_found
        assert "DX" in assets_found

    def test_extract_pct_oi(self):
        from macro.data.cftc_scraper import _extract_positions, _parse_pipe_csv

        comm_df = _parse_pipe_csv(COMMODITIES_SAMPLE)
        fin_df = _parse_pipe_csv(FINANCIALS_SAMPLE)
        positions = _extract_positions(comm_df, fin_df)

        gold = [p for p in positions if p["asset"] == "GC"][0]
        expected_pct = round((130000 / 600000) * 100, 2)
        assert gold["pct_oi"] == expected_pct

    def test_extract_empty_data(self):
        from macro.data.cftc_scraper import _extract_positions

        positions = _extract_positions(
            pd.DataFrame if False else __import__("pandas").DataFrame(),
            __import__("pandas").DataFrame(),
        )
        assert positions == []


class TestCftcDb:
    def test_store_and_load(self, db):
        from macro.data.cftc_scraper import _store_positions, _load_from_db

        positions = [
            {"report_date": "2025-01-21", "asset": "GC", "net_long": 130000, "pct_oi": 21.67, "change_1w": 5000},
        ]

        import macro.data.cftc_scraper as mod
        with patch.object(mod, "get_conn", side_effect=_make_get_conn(db)):
            _store_positions(positions)

        with patch.object(mod, "get_conn", side_effect=_make_get_conn(db)):
            loaded = _load_from_db()

        assert len(loaded) == 1
        assert loaded[0].asset == "GC"
        assert loaded[0].net_long == 130000

    def test_upsert_no_duplicates(self, db):
        from macro.data.cftc_scraper import _store_positions

        positions = [
            {"report_date": "2025-01-21", "asset": "GC", "net_long": 130000, "pct_oi": 21.67, "change_1w": 5000},
        ]

        import macro.data.cftc_scraper as mod
        with patch.object(mod, "get_conn", side_effect=_make_get_conn(db)):
            _store_positions(positions)
            _store_positions(positions)

        conn = sqlite3.connect(db)
        count = conn.execute("SELECT COUNT(*) FROM macro_cftc_positions").fetchone()[0]
        conn.close()
        assert count == 1

    def test_historical_positions(self, db):
        from macro.data.cftc_scraper import _store_positions

        positions = [
            {"report_date": "2025-01-14", "asset": "GC", "net_long": 125000, "pct_oi": 20.83, "change_1w": 3000},
            {"report_date": "2025-01-21", "asset": "GC", "net_long": 130000, "pct_oi": 21.67, "change_1w": 5000},
        ]

        import macro.data.cftc_scraper as mod
        with patch.object(mod, "get_conn", side_effect=_make_get_conn(db)):
            _store_positions(positions)

    def test_fetch_cot_fallback_on_error(self, db):
        from macro.data.cftc_scraper import fetch_cot_positions

        import macro.data.cftc_scraper as mod
        with patch.object(mod, "get_conn", side_effect=_make_get_conn(db)):
                with patch.object(mod, "_fetch_raw_csv", side_effect=Exception("Connection error")):
                    with patch.object(mod, "cache_get", return_value=None):
                        result = asyncio_run(fetch_cot_positions())

        assert result == []

    def test_uses_cache(self, db):
        from macro.data.cftc_scraper import fetch_cot_positions
        from macro.models import CftcPosition

        cached_data = [
            {"report_date": "2025-01-21", "asset": "GC", "net_long": 130000, "pct_oi": 21.67, "change_1w": 5000},
        ]

        import macro.data.cftc_scraper as mod
        with patch.object(mod, "cache_get", return_value=cached_data):
            with patch.object(mod, "_fetch_raw_csv", side_effect=AssertionError("Should not be called")):
                result = asyncio_run(fetch_cot_positions())

        assert len(result) == 1
        assert result[0].asset == "GC"


class TestFedWatch:
    def test_next_fomc_dates(self):
        from macro.data.fedwatch import _next_fomc_dates
        dates = _next_fomc_dates(3)
        assert len(dates) <= 3
        for d in dates:
            assert len(d) == 10
            assert d[4] == "-"
            assert d[7] == "-"

    def test_compute_probabilities_hawkish(self):
        from macro.data.fedwatch import _compute_probabilities

        meetings = _compute_probabilities(5.25, {"2025-06-15": 5.50})
        assert len(meetings) == 1
        assert meetings[0].prob_hike > meetings[0].prob_cut
        assert meetings[0].implied_rate == 5.50

    def test_compute_probabilities_dovish(self):
        from macro.data.fedwatch import _compute_probabilities

        meetings = _compute_probabilities(5.25, {"2025-06-15": 4.75})
        assert len(meetings) == 1
        assert meetings[0].prob_cut > meetings[0].prob_hike

    def test_compute_probabilities_neutral(self):
        from macro.data.fedwatch import _compute_probabilities

        meetings = _compute_probabilities(5.25, {"2025-06-15": 5.25})
        assert len(meetings) == 1
        assert meetings[0].prob_hold > 80

    def test_determine_direction(self):
        from macro.data.fedwatch import _determine_direction

        hawkish = FedWatchMeeting(date="2025-06-15", prob_hike=70, prob_hold=20, prob_cut=10, implied_rate=5.50)
        assert _determine_direction([hawkish]) == "hawkish"

        dovish = FedWatchMeeting(date="2025-06-15", prob_hike=10, prob_hold=20, prob_cut=70, implied_rate=4.75)
        assert _determine_direction([dovish]) == "dovish"

        neutral = FedWatchMeeting(date="2025-06-15", prob_hike=30, prob_hold=40, prob_cut=30, implied_rate=5.25)
        assert _determine_direction([neutral]) == "neutral"

    def test_determine_direction_empty(self):
        from macro.data.fedwatch import _determine_direction
        assert _determine_direction([]) == "unknown"

    def test_graceful_degradation(self, db):
        from macro.data.fedwatch import fetch_fedwatch_probs

        import macro.data.fedwatch as fw_mod
        with patch.object(fw_mod, "cache_get", return_value=None):
            with patch.object(fw_mod, "cache_set"):
                with patch.object(fw_mod, "_fetch_current_rate", return_value=None):
                    with patch.object(fw_mod, "_fetch_futures_rates", return_value={}):
                        result = asyncio_run(fetch_fedwatch_probs())

        assert result.implied_direction == "unknown"
        assert result.meetings == []

    def test_cache_hit(self, db):
        from macro.data.fedwatch import fetch_fedwatch_probs

        cached_state = {
            "as_of": "2025-01-21T00:00:00+00:00",
            "meetings": [
                {"date": "2025-06-15", "prob_hike": 70.0, "prob_hold": 20.0, "prob_cut": 10.0, "implied_rate": 5.50}
            ],
            "implied_direction": "hawkish",
        }

        import macro.data.fedwatch as fw_mod
        with patch.object(fw_mod, "cache_get", return_value=cached_state):
            result = asyncio_run(fetch_fedwatch_probs())

        assert result.implied_direction == "hawkish"
        assert len(result.meetings) == 1


def _make_get_conn(db_path):
    import contextlib

    @contextlib.contextmanager
    def _ctx():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _get_conn():
        return _ctx()

    return _get_conn


def asyncio_run(coro):
    import asyncio
    return asyncio.run(coro)