"""IV30 daily logger and IV rank computation."""

import asyncio
import math
from datetime import date, datetime, timezone

import yfinance as yf

from macro.models import IVRankData
from macro.types import YFINANCE_TICKERS, ASSETS
from database import get_conn

EXTRA_YFINANCE_TICKERS: dict[str, str] = {
    "VIX3M": "^VIX3M",
    "COPPER": "HG=F",
    "GOLD_FUTURES": "GC=F",
}

_TICKERS_NO_OPTIONS = {"VIX", "DXY", "BRENT"}

_MIN_HISTORY_DAYS = 126
_LOOKBACK_DAYS = 252


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return None if math.isnan(v) or math.isinf(v) else v
    except (TypeError, ValueError):
        return None


async def _run_sync(func, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: func(*args, **kwargs))


async def _fetch_iv30_from_options(ticker_symbol: str) -> float | None:
    try:
        t = yf.Ticker(ticker_symbol)
        expiries = await _run_sync(lambda: t.options or ())
        if not expiries:
            return None

        today = date.today()
        target_dte = 30
        best_expiry = min(
            expiries,
            key=lambda e: abs((datetime.strptime(e, "%Y-%m-%d").date() - today).days - target_dte),
        )

        chain = await _run_sync(t.option_chain, best_expiry)
        if chain is None:
            return None
        calls_df, puts_df = chain

        if calls_df.empty:
            return None

        spot = await _run_sync(lambda: yf.Ticker(ticker_symbol).fast_info.last_price)
        if spot is None or spot <= 0:
            info = await _run_sync(lambda: yf.Ticker(ticker_symbol).info or {})
            spot = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        if spot is None or spot <= 0:
            return None

        calls_df = calls_df.copy()
        calls_df["strike_diff"] = (calls_df["strike"] - spot).abs()
        calls_df = calls_df.sort_values("strike_diff")
        atm_rows = calls_df.head(2)

        iv_values = []
        for _, row in atm_rows.iterrows():
            iv = _safe_float(row.get("impliedVolatility"))
            if iv is not None:
                iv_values.append(iv)

        if not iv_values:
            return None

        return sum(iv_values) / len(iv_values)
    except Exception:
        return None


async def _fetch_iv_from_info(ticker_symbol: str) -> float | None:
    try:
        t = yf.Ticker(ticker_symbol)
        info = await _run_sync(lambda: t.info or {})
        return _safe_float(info.get("impliedVolatility"))
    except Exception:
        return None


async def log_daily_iv30() -> None:
    today_str = date.today().isoformat()

    async def _process_asset(asset_name: str) -> None:
        yf_ticker = YFINANCE_TICKERS.get(asset_name)
        if yf_ticker is None:
            return

        iv30: float | None = None

        if asset_name not in _TICKERS_NO_OPTIONS:
            iv30 = await _fetch_iv30_from_options(yf_ticker)

        if iv30 is None and asset_name not in _TICKERS_NO_OPTIONS:
            iv30 = await _fetch_iv_from_info(yf_ticker)

        if iv30 is None and asset_name == "VIX":
            try:
                t = yf.Ticker(yf_ticker)
                price = await _run_sync(lambda: t.fast_info.last_price)
                iv30 = _safe_float(price)
            except Exception:
                pass

        with get_conn() as conn:
            conn.execute(
                """INSERT INTO macro_iv30_history (asset, date, iv30)
                   VALUES (?, ?, ?)
                   ON CONFLICT(asset, date) DO UPDATE SET iv30=excluded.iv30""",
                (asset_name, today_str, iv30),
            )

    await asyncio.gather(
        *[_process_asset(asset.value) for asset in ASSETS],
        return_exceptions=True,
    )


async def get_iv_rank(asset: str) -> IVRankData:
    yf_ticker = YFINANCE_TICKERS.get(asset)
    if yf_ticker is None:
        return IVRankData(
            asset=asset,
            current_iv30=None,
            rank_pct=None,
            sufficient_history=False,
            history_days=0,
        )

    current_iv30: float | None = None

    if asset not in _TICKERS_NO_OPTIONS:
        current_iv30 = await _fetch_iv30_from_options(yf_ticker)

    if current_iv30 is None and asset not in _TICKERS_NO_OPTIONS:
        current_iv30 = await _fetch_iv_from_info(yf_ticker)

    if current_iv30 is None and asset == "VIX":
        try:
            t = yf.Ticker(yf_ticker)
            price = await _run_sync(lambda: t.fast_info.last_price)
            current_iv30 = _safe_float(price)
        except Exception:
            pass

    history_days = 0
    rank_pct: float | None = None
    sufficient_history = False

    with get_conn() as conn:
        rows = conn.execute(
            """SELECT iv30 FROM macro_iv30_history
               WHERE asset = ? AND iv30 IS NOT NULL
               ORDER BY date DESC LIMIT ?""",
            (asset, _LOOKBACK_DAYS),
        ).fetchall()
        historical = [row["iv30"] for row in rows if row["iv30"] is not None]
        history_days = len(historical)

    if history_days >= _MIN_HISTORY_DAYS and current_iv30 is not None:
        sufficient_history = True
        min_iv = min(historical)
        max_iv = max(historical)
        if max_iv == min_iv:
            rank_pct = 50.0
        else:
            rank_pct = round((current_iv30 - min_iv) / (max_iv - min_iv) * 100, 2)
    elif history_days >= _MIN_HISTORY_DAYS:
        sufficient_history = True

    return IVRankData(
        asset=asset,
        current_iv30=current_iv30,
        rank_pct=rank_pct,
        sufficient_history=sufficient_history,
        history_days=history_days,
    )


async def get_all_iv_ranks() -> dict[str, IVRankData]:
    results = await asyncio.gather(
        *[get_iv_rank(asset.value) for asset in ASSETS],
        return_exceptions=True,
    )
    output: dict[str, IVRankData] = {}
    for asset, result in zip(ASSETS, results):
        if isinstance(result, Exception):
            output[asset.value] = IVRankData(
                asset=asset.value,
                current_iv30=None,
                rank_pct=None,
                sufficient_history=False,
                history_days=0,
            )
        else:
            output[asset.value] = result
    return output