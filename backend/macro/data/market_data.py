"""yfinance-sourced market data: prices, VIX term structure, ratios, straddle pricing."""

import asyncio
import math
from datetime import date, datetime

import yfinance as yf

from macro.models import AssetSnapshot, VIXTermStructure, StraddlePricing
from macro.types import YFINANCE_TICKERS, ASSETS
from cache import cache_get, cache_set

EXTRA_TICKERS: dict[str, str] = {
    "VIX3M": "^VIX3M",
    "COPPER": "HG=F",
    "GOLD_FUTURES": "GC=F",
}

_CACHE_TTL_PRICES = 60
_CACHE_TTL_300 = 300

_TICKERS_NO_OPTIONS = {"VIX", "DXY", "BRENT"}


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return None if math.isnan(v) or math.isinf(v) else v
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


async def _run_sync(func, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: func(*args, **kwargs))


async def _get_history(ticker: str, period: str = "1mo") -> dict[str, list] | None:
    try:
        t = yf.Ticker(ticker)
        df = await _run_sync(t.history, period=period, interval="1d", auto_adjust=True)
        if df is None or df.empty:
            return None
        closes = df["Close"].tolist()
        volumes = df["Volume"].tolist()
        dates = df.index.tolist()
        return {"closes": closes, "volumes": volumes, "dates": dates, "df": df}
    except Exception:
        return None


def _compute_changes(closes: list[float]) -> tuple[float | None, float | None, float | None]:
    change_1d = change_5d = change_21d = None
    n = len(closes)
    if n >= 2 and closes[-1] and closes[-2]:
        change_1d = round((closes[-1] / closes[-2] - 1) * 100, 4)
    if n >= 6 and closes[-1] and closes[-6]:
        change_5d = round((closes[-1] / closes[-6] - 1) * 100, 4)
    if n >= 22 and closes[-1] and closes[-22]:
        change_21d = round((closes[-1] / closes[-22] - 1) * 100, 4)
    return change_1d, change_5d, change_21d


async def _fetch_single_asset(asset: str) -> AssetSnapshot:
    yf_ticker = YFINANCE_TICKERS.get(asset)
    if yf_ticker is None:
        return AssetSnapshot(asset=asset, price=None, change_1d_pct=None,
                              change_5d_pct=None, change_21d_pct=None, volume=None)

    try:
        hist = await _get_history(yf_ticker)
        if hist is None:
            return AssetSnapshot(asset=asset, price=None, change_1d_pct=None,
                                  change_5d_pct=None, change_21d_pct=None, volume=None)

        closes = hist["closes"]
        volumes = hist["volumes"]
        price = _safe_float(closes[-1]) if closes else None
        change_1d, change_5d, change_21d = _compute_changes(closes)
        volume = _safe_float(volumes[-1]) if volumes else None

        return AssetSnapshot(
            asset=asset,
            price=price,
            change_1d_pct=change_1d,
            change_5d_pct=change_5d,
            change_21d_pct=change_21d,
            volume=volume,
        )
    except Exception:
        return AssetSnapshot(asset=asset, price=None, change_1d_pct=None,
                              change_5d_pct=None, change_21d_pct=None, volume=None)


async def fetch_asset_prices() -> dict[str, AssetSnapshot]:
    cached = cache_get("macro", "macro_asset_prices", _CACHE_TTL_PRICES)
    if cached is not None:
        return {k: AssetSnapshot(**v) for k, v in cached.items()}

    results = await asyncio.gather(
        *[_fetch_single_asset(asset.value) for asset in ASSETS],
        return_exceptions=True,
    )

    output: dict[str, AssetSnapshot] = {}
    for asset_enum, result in zip(ASSETS, results):
        if isinstance(result, Exception):
            output[asset_enum.value] = AssetSnapshot(
                asset=asset_enum.value, price=None, change_1d_pct=None,
                change_5d_pct=None, change_21d_pct=None, volume=None,
            )
        else:
            output[asset_enum.value] = result

    cache_set("macro", "macro_asset_prices", {k: v.model_dump() for k, v in output.items()})
    return output


async def fetch_vix_term_structure() -> VIXTermStructure:
    cached = cache_get("macro", "vix_term_structure", _CACHE_TTL_300)
    if cached is not None:
        return VIXTermStructure(**cached)

    vix_spot: float | None = None
    vix3m: float | None = None

    async def _fetch_vix_spot():
        nonlocal vix_spot
        try:
            t = yf.Ticker(YFINANCE_TICKERS["VIX"])
            info = await _run_sync(lambda: t.info or {})
            vix_spot = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
            if vix_spot is None:
                df = await _run_sync(t.history, period="5d", interval="1d", auto_adjust=True)
                if df is not None and not df.empty:
                    vix_spot = _safe_float(df["Close"].iloc[-1])
        except Exception:
            pass

    async def _fetch_vix3m():
        nonlocal vix3m
        try:
            t = yf.Ticker(EXTRA_TICKERS["VIX3M"])
            info = await _run_sync(lambda: t.info or {})
            vix3m = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
            if vix3m is None:
                df = await _run_sync(t.history, period="5d", interval="1d", auto_adjust=True)
                if df is not None and not df.empty:
                    vix3m = _safe_float(df["Close"].iloc[-1])
        except Exception:
            pass

    await asyncio.gather(_fetch_vix_spot(), _fetch_vix3m(), return_exceptions=True)

    ratio = None
    in_backwardation = False
    if vix_spot is not None and vix3m is not None and vix3m != 0:
        ratio = round(vix_spot / vix3m, 4)
        in_backwardation = ratio > 1.0

    result = VIXTermStructure(
        vix_spot=vix_spot,
        vix3m=vix3m,
        ratio=ratio,
        in_backwardation=in_backwardation,
    )
    cache_set("macro", "vix_term_structure", result.model_dump())
    return result


async def fetch_put_call_ratio() -> float:
    cached = cache_get("macro", "put_call_ratio", _CACHE_TTL_300)
    if cached is not None:
        return cached["ratio"]

    ratio: float | None = None

    try:
        t = yf.Ticker("^PCALL")
        df = await _run_sync(t.history, period="5d", interval="1d", auto_adjust=True)
        if df is not None and not df.empty:
            val = _safe_float(df["Close"].iloc[-1])
            if val is not None:
                ratio = val
    except Exception:
        pass

    if ratio is None:
        try:
            t = yf.Ticker("SPY")
            expiries = await _run_sync(lambda: t.options or ())
            if expiries:
                chain = await _run_sync(t.option_chain, expiries[0])
                if chain is not None:
                    calls_df, puts_df = chain
                    total_call_vol = int(calls_df["volume"].sum()) if not calls_df.empty else 0
                    total_put_vol = int(puts_df["volume"].sum()) if not puts_df.empty else 0
                    if total_call_vol > 0:
                        ratio = round(total_put_vol / total_call_vol, 4)
        except Exception:
            pass

    final_ratio = ratio if ratio is not None else 0.0
    cache_set("macro", "put_call_ratio", {"ratio": final_ratio})
    return final_ratio


async def fetch_copper_gold_ratio() -> float:
    cached = cache_get("macro", "copper_gold_ratio", _CACHE_TTL_300)
    if cached is not None:
        return cached["ratio"]

    copper_price: float | None = None
    gold_price: float | None = None

    async def _fetch_copper():
        nonlocal copper_price
        try:
            t = yf.Ticker(EXTRA_TICKERS["COPPER"])
            df = await _run_sync(t.history, period="5d", interval="1d", auto_adjust=True)
            if df is not None and not df.empty:
                copper_price = _safe_float(df["Close"].iloc[-1])
        except Exception:
            pass

    async def _fetch_gold():
        nonlocal gold_price
        try:
            t = yf.Ticker(EXTRA_TICKERS["GOLD_FUTURES"])
            df = await _run_sync(t.history, period="5d", interval="1d", auto_adjust=True)
            if df is not None and not df.empty:
                gold_price = _safe_float(df["Close"].iloc[-1])
        except Exception:
            pass

    await asyncio.gather(_fetch_copper(), _fetch_gold(), return_exceptions=True)

    ratio = 0.0
    if copper_price is not None and gold_price is not None and gold_price != 0:
        ratio = round(copper_price / gold_price, 6)

    cache_set("macro", "copper_gold_ratio", {"ratio": ratio})
    return ratio


async def fetch_atm_straddle_price(asset: str, dte_target: int = 14) -> StraddlePricing | None:
    if asset in _TICKERS_NO_OPTIONS:
        return None

    cache_key = f"straddle_{asset}_{dte_target}"
    cached = cache_get("macro", cache_key, _CACHE_TTL_300)
    if cached is not None:
        return StraddlePricing(**cached)

    yf_ticker = YFINANCE_TICKERS.get(asset)
    if yf_ticker is None:
        return None

    try:
        t = yf.Ticker(yf_ticker)

        expiries = await _run_sync(lambda: t.options or ())
        if not expiries:
            return None

        today = date.today()
        best_expiry = min(
            expiries,
            key=lambda e: abs((datetime.strptime(e, "%Y-%m-%d").date() - today).days - dte_target),
        )
        target_date = datetime.strptime(best_expiry, "%Y-%m-%d").date()
        dte = (target_date - today).days

        chain = await _run_sync(t.option_chain, best_expiry)
        if chain is None:
            return None
        calls_df, puts_df = chain

        if calls_df.empty or puts_df.empty:
            return None

        spot: float | None = None

        hist_df = await _run_sync(t.history, period="5d", interval="1d", auto_adjust=True)
        if hist_df is not None and not hist_df.empty:
            spot = _safe_float(hist_df["Close"].iloc[-1])

        if spot is None:
            info = await _run_sync(lambda: t.info or {})
            spot = _safe_float(
                info.get("currentPrice")
                or info.get("regularMarketPrice")
                or info.get("previousClose")
            )

        if spot is None or spot <= 0:
            return None

        calls_sorted = calls_df.copy()
        calls_sorted["strike_diff"] = (calls_sorted["strike"] - spot).abs()
        atm_row = calls_sorted.nsmallest(1, "strike_diff").iloc[0]
        atm_strike = _safe_float(atm_row["strike"])
        if atm_strike is None:
            return None

        call_bid = _safe_float(atm_row.get("bid", 0)) or 0.0
        call_ask = _safe_float(atm_row.get("ask", 0)) or 0.0
        call_mid = (call_bid + call_ask) / 2 if (call_bid + call_ask) > 0 else _safe_float(atm_row.get("lastPrice", 0)) or 0.0

        put_rows = puts_df[puts_df["strike"] == atm_strike]
        if put_rows.empty:
            put_rows = puts_df.copy()
            put_rows["strike_diff"] = (put_rows["strike"] - spot).abs()
            put_row = put_rows.nsmallest(1, "strike_diff").iloc[0]
        else:
            put_row = put_rows.iloc[0]

        put_bid = _safe_float(put_row.get("bid", 0)) or 0.0
        put_ask = _safe_float(put_row.get("ask", 0)) or 0.0
        put_mid = (put_bid + put_ask) / 2 if (put_bid + put_ask) > 0 else _safe_float(put_row.get("lastPrice", 0)) or 0.0

        straddle_price = call_mid + put_mid
        implied_move_pct = round(straddle_price / spot * 100, 4) if spot else 0.0

        result = StraddlePricing(
            asset=asset,
            expiry=best_expiry,
            dte=dte,
            atm_strike=atm_strike,
            call_price=call_mid,
            put_price=put_mid,
            straddle_price=straddle_price,
            implied_move_pct=implied_move_pct,
        )

        cache_set("macro", cache_key, result.model_dump())
        return result

    except Exception:
        return None