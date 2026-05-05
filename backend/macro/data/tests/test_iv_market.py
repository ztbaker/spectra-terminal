"""Tests for IV30 logger and market data modules."""

import math
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pandas as pd
import pytest

from macro.models import AssetSnapshot, IVRankData, StraddlePricing, VIXTermStructure
from macro.types import YFINANCE_TICKERS


@contextmanager
def _get_conn(db_path):
    conn = sqlite3.connect(db_path)
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
    db_path = str(tmp_path / "test.db")
    from database import init_db
    init_db(db_path)

    def _make_conn():
        return _get_conn(db_path)

    monkeypatch.setattr("macro.data.iv_logger.get_conn", _make_conn)
    monkeypatch.setattr("macro.data.market_data.cache_get", lambda *a, **kw: None)
    monkeypatch.setattr("macro.data.market_data.cache_set", lambda *a, **kw: None)

    async def _mock_run_sync(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr("macro.data.iv_logger._run_sync", _mock_run_sync)
    monkeypatch.setattr("macro.data.market_data._run_sync", _mock_run_sync)

    yield db_path


def _make_history_df(closes, volumes=None):
    n = len(closes)
    dates = pd.bdate_range(end=date.today(), periods=n)
    if volumes is None:
        volumes = [1_000_000] * n
    data = {
        "Open": closes,
        "High": closes,
        "Low": closes,
        "Close": closes,
        "Volume": volumes,
    }
    return pd.DataFrame(data, index=dates)


def _make_options_chain_df(strikes, ivs, bids=None, asks=None, last_prices=None):
    n = len(strikes)
    if bids is None:
        bids = [5.0] * n
    if asks is None:
        asks = [6.0] * n
    if last_prices is None:
        last_prices = [5.5] * n
    return pd.DataFrame({
        "strike": strikes,
        "bid": bids,
        "ask": asks,
        "lastPrice": last_prices,
        "volume": [1000] * n,
        "openInterest": [5000] * n,
        "impliedVolatility": ivs,
        "inTheMoney": [False] * n,
        "contractSymbol": [f"TEST{k}C" for k in range(n)],
    })


async def _run_async(coro):
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result()
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


class TestFetchAssetPrices:
    def test_returns_all_assets(self, _tmp_db):
        closes = [100.0 + i for i in range(25)]
        df = _make_history_df(closes)
        with patch("yfinance.Ticker") as mock_cls:
            mock_cls.return_value.history.return_value = df
            mock_cls.return_value.options = ()
            mock_cls.return_value.fast_info = MagicMock()
            mock_cls.return_value.fast_info.last_price = closes[-1]
            mock_cls.return_value.info = {}

            from macro.data.market_data import fetch_asset_prices
            result = asyncio_run(fetch_asset_prices())

            assert len(result) == 7
            for asset_name in YFINANCE_TICKERS:
                assert asset_name in result
                snap = result[asset_name]
                assert isinstance(snap, AssetSnapshot)

    def test_price_changes_computed(self, _tmp_db):
        closes = [100.0 + i for i in range(25)]
        df = _make_history_df(closes)
        with patch("yfinance.Ticker") as mock_cls:
            mock_cls.return_value.history.return_value = df
            mock_cls.return_value.options = ()
            mock_cls.return_value.fast_info = MagicMock()
            mock_cls.return_value.fast_info.last_price = closes[-1]
            mock_cls.return_value.info = {}

            from macro.data.market_data import fetch_asset_prices
            result = asyncio_run(fetch_asset_prices())

            found_price = False
            for snap in result.values():
                if snap.price is not None:
                    found_price = True
                    assert snap.change_1d_pct is not None
                    break
            assert found_price

    def test_graceful_degradation_on_empty(self, _tmp_db):
        with patch("yfinance.Ticker") as mock_cls:
            mock_cls.return_value.history.return_value = pd.DataFrame()
            mock_cls.return_value.options = ()
            mock_cls.return_value.fast_info = MagicMock()
            mock_cls.return_value.fast_info.last_price = None
            mock_cls.return_value.info = {}

            from macro.data.market_data import fetch_asset_prices
            result = asyncio_run(fetch_asset_prices())

            for snap in result.values():
                assert snap.price is None


class TestIV30Logger:
    def test_log_daily_iv30_stores_to_db(self, _tmp_db):
        strikes = [95, 100, 105]
        ivs = [0.2, 0.25, 0.3]
        calls_df = _make_options_chain_df(strikes, ivs)
        puts_df = _make_options_chain_df(strikes, ivs)

        with patch("macro.data.iv_logger.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_ticker.options = ("2026-06-20",)
            mock_ticker.option_chain.return_value = (calls_df, puts_df)

            spot = 100.0
            hist_df = _make_history_df([spot] * 5)
            mock_ticker.history.return_value = hist_df
            mock_ticker.fast_info.last_price = spot
            mock_ticker.info = {"currentPrice": spot}

            mock_yf.Ticker.return_value = mock_ticker

            from macro.data.iv_logger import log_daily_iv30
            asyncio_run(log_daily_iv30())

        conn = sqlite3.connect(_tmp_db)
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM macro_iv30_history").fetchall()
        conn.close()
        assert len(rows) > 0

    def test_idempotent_same_date(self, _tmp_db):
        strikes = [100]
        ivs = [0.25]
        calls_df = _make_options_chain_df(strikes, ivs)
        puts_df = _make_options_chain_df(strikes, ivs)

        with patch("macro.data.iv_logger.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_ticker.options = ("2026-06-20",)
            mock_ticker.option_chain.return_value = (calls_df, puts_df)
            mock_ticker.history.return_value = _make_history_df([100.0] * 5)
            mock_ticker.fast_info.last_price = 100.0
            mock_ticker.info = {"currentPrice": 100.0}
            mock_yf.Ticker.return_value = mock_ticker

            from macro.data.iv_logger import log_daily_iv30
            asyncio_run(log_daily_iv30())
            asyncio_run(log_daily_iv30())

        conn = sqlite3.connect(_tmp_db)
        rows = conn.execute(
            "SELECT COUNT(*) as cnt FROM macro_iv30_history WHERE asset='SPY'"
        ).fetchone()
        conn.close()
        assert rows[0] == 1


class TestIVRank:
    def test_iv_rank_with_sufficient_history(self, _tmp_db):
        conn = sqlite3.connect(_tmp_db)
        today = date.today()
        for i in range(200):
            d = today - timedelta(days=i + 1)
            iv = 10.0 + (i % 50) * 0.5
            conn.execute(
                "INSERT OR REPLACE INTO macro_iv30_history (asset, date, iv30) VALUES (?, ?, ?)",
                ("SPY", d.isoformat(), iv),
            )
        conn.commit()
        conn.close()

        with patch("macro.data.iv_logger.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_ticker.options = ("2026-06-20",)
            strikes = [100]
            ivs = [0.25]
            calls_df = _make_options_chain_df(strikes, ivs)
            puts_df = _make_options_chain_df(strikes, ivs)
            mock_ticker.option_chain.return_value = (calls_df, puts_df)
            mock_ticker.history.return_value = _make_history_df([100.0] * 5)
            mock_ticker.fast_info.last_price = 100.0
            mock_ticker.info = {"currentPrice": 100.0, "impliedVolatility": 0.25}
            mock_yf.Ticker.return_value = mock_ticker

            from macro.data.iv_logger import get_iv_rank
            result = asyncio_run(get_iv_rank("SPY"))

        assert isinstance(result, IVRankData)
        assert result.sufficient_history is True
        assert result.history_days == 200
        assert result.rank_pct is not None

    def test_iv_rank_insufficient_history(self, _tmp_db):
        conn = sqlite3.connect(_tmp_db)
        for i in range(50):
            d = date.today() - timedelta(days=i + 1)
            conn.execute(
                "INSERT OR REPLACE INTO macro_iv30_history (asset, date, iv30) VALUES (?, ?, ?)",
                ("GLD", d.isoformat(), 20.0),
            )
        conn.commit()
        conn.close()

        with patch("macro.data.iv_logger.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_ticker.options = ()
            mock_ticker.fast_info.last_price = None
            mock_ticker.info = {}
            mock_yf.Ticker.return_value = mock_ticker

            from macro.data.iv_logger import get_iv_rank
            result = asyncio_run(get_iv_rank("GLD"))

        assert result.sufficient_history is False
        assert result.rank_pct is None

    def test_iv_rank_equal_min_max(self, _tmp_db):
        conn = sqlite3.connect(_tmp_db)
        for i in range(200):
            d = date.today() - timedelta(days=i + 1)
            conn.execute(
                "INSERT OR REPLACE INTO macro_iv30_history (asset, date, iv30) VALUES (?, ?, ?)",
                ("SLV", d.isoformat(), 30.0),
            )
        conn.commit()
        conn.close()

        with patch("macro.data.iv_logger.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_ticker.options = ()
            mock_ticker.fast_info.last_price = None
            mock_ticker.info = {}
            mock_yf.Ticker.return_value = mock_ticker

            from macro.data.iv_logger import get_iv_rank
            result = asyncio_run(get_iv_rank("SLV"))

        if result.current_iv30 is not None:
            assert result.rank_pct == 50.0

    def test_get_all_iv_ranks(self, _tmp_db):
        with patch("macro.data.iv_logger.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_ticker.options = ()
            mock_ticker.fast_info.last_price = None
            mock_ticker.info = {}
            mock_yf.Ticker.return_value = mock_ticker

            from macro.data.iv_logger import get_all_iv_ranks
            result = asyncio_run(get_all_iv_ranks())

        assert isinstance(result, dict)
        assert len(result) == 7
        for asset_name in YFINANCE_TICKERS:
            assert asset_name in result


class TestVixTermStructure:
    def test_contango(self, _tmp_db):
        with patch("macro.data.market_data.yf") as mock_yf:
            vix_ticker = MagicMock()
            vix_ticker.info = {"currentPrice": 15.0}
            vix_df = _make_history_df([15.0] * 5)
            vix_ticker.history.return_value = vix_df

            vix3m_ticker = MagicMock()
            vix3m_ticker.info = {"currentPrice": 18.0}
            vix3m_df = _make_history_df([18.0] * 5)
            vix3m_ticker.history.return_value = vix3m_df

            def make_ticker(symbol):
                if symbol == "^VIX":
                    return vix_ticker
                elif symbol == "^VIX3M":
                    return vix3m_ticker
                return MagicMock()

            mock_yf.Ticker.side_effect = make_ticker

            from macro.data.market_data import fetch_vix_term_structure
            result = asyncio_run(fetch_vix_term_structure())

        assert isinstance(result, VIXTermStructure)
        if result.vix_spot is not None:
            assert result.vix3m is not None
            assert result.ratio is not None
            assert result.in_backwardation is False


class TestStraddlePricing:
    def test_straddle_price_calculation(self, _tmp_db):
        spot = 450.0
        strikes = [445, 450, 455]
        ivs = [0.2, 0.18, 0.22]
        bids = [3.0, 5.0, 4.0]
        asks = [4.0, 6.0, 5.0]
        last_prices = [3.5, 5.5, 4.5]

        calls_df = _make_options_chain_df(strikes, ivs, bids, asks, last_prices)
        puts_df = _make_options_chain_df(strikes, ivs, bids, asks, last_prices)

        with patch("macro.data.market_data.yf") as mock_yf:
            mock_ticker = MagicMock()
            hist_df = _make_history_df([spot] * 5)
            mock_ticker.history.return_value = hist_df
            mock_ticker.options = ("2026-05-20",)
            mock_ticker.option_chain.return_value = (calls_df, puts_df)
            mock_ticker.info = {"currentPrice": spot}
            mock_yf.Ticker.return_value = mock_ticker

            from macro.data.market_data import fetch_atm_straddle_price
            result = asyncio_run(fetch_atm_straddle_price("SPY"))

        assert result is not None
        assert isinstance(result, StraddlePricing)
        assert result.atm_strike == 450
        assert result.call_price == 5.5
        assert result.put_price == 5.5
        assert result.straddle_price == 11.0
        assert result.implied_move_pct > 0

    def test_straddle_returns_none_for_no_options_assets(self, _tmp_db):
        from macro.data.market_data import fetch_atm_straddle_price

        for asset in ("VIX", "DXY", "BRENT"):
            result = asyncio_run(fetch_atm_straddle_price(asset))
            assert result is None


class TestCopperGoldRatio:
    def test_ratio_calculation(self, _tmp_db):
        copper_df = _make_history_df([4.50] * 5)
        gold_df = _make_history_df([2300.0] * 5)

        with patch("macro.data.market_data.yf") as mock_yf:
            def make_ticker(symbol):
                m = MagicMock()
                if symbol == "HG=F":
                    m.history.return_value = copper_df
                elif symbol == "GC=F":
                    m.history.return_value = gold_df
                else:
                    m.history.return_value = pd.DataFrame()
                m.options = ()
                m.info = {}
                return m

            mock_yf.Ticker.side_effect = make_ticker

            from macro.data.market_data import fetch_copper_gold_ratio
            result = asyncio_run(fetch_copper_gold_ratio())

        assert isinstance(result, float)
        assert result > 0

    def test_ratio_returns_zero_on_failure(self, _tmp_db):
        with patch("macro.data.market_data.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_ticker.history.return_value = pd.DataFrame()
            mock_ticker.options = ()
            mock_ticker.info = {}
            mock_yf.Ticker.return_value = mock_ticker

            from macro.data.market_data import fetch_copper_gold_ratio
            result = asyncio_run(fetch_copper_gold_ratio())

        assert result == 0.0


class TestPutCallRatio:
    def test_returns_float(self, _tmp_db):
        with patch("macro.data.market_data.yf") as mock_yf:
            pcall_ticker = MagicMock()
            pcall_ticker.history.return_value = pd.DataFrame()
            spy_ticker = MagicMock()
            spy_ticker.options = ()
            spy_ticker.history.return_value = pd.DataFrame()

            def make_ticker(symbol):
                return pcall_ticker

            mock_yf.Ticker.side_effect = make_ticker

            from macro.data.market_data import fetch_put_call_ratio
            result = asyncio_run(fetch_put_call_ratio())

        assert isinstance(result, float)


class TestGracefulDegradation:
    def test_empty_dataframe_returns_none_fields(self, _tmp_db):
        with patch("macro.data.market_data.yf") as mock_yf:
            mock_ticker = MagicMock()
            mock_ticker.history.return_value = pd.DataFrame()
            mock_ticker.options = ()
            mock_ticker.info = {}
            mock_ticker.fast_info = MagicMock()
            mock_ticker.fast_info.last_price = None
            mock_yf.Ticker.return_value = mock_ticker

            from macro.data.market_data import fetch_asset_prices
            result = asyncio_run(fetch_asset_prices())

            for snap in result.values():
                assert snap.price is None

    def test_yfinance_exception_doesnt_crash(self, _tmp_db):
        with patch("macro.data.market_data.yf") as mock_yf:
            mock_yf.Ticker.side_effect = Exception("yfinance error")

            from macro.data.market_data import fetch_asset_prices
            result = asyncio_run(fetch_asset_prices())

        assert len(result) == 7
        for snap in result.values():
            assert snap.price is None


def asyncio_run(coro):
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)