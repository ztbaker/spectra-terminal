"""Options module — chain with full Greeks, IV surface, term structure, unusual activity."""

import asyncio
import math
from datetime import date, datetime
from typing import Any

import pandas as pd

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL
from analytics.options_math import all_greeks, compute_iv_surface, compute_term_structure

router = APIRouter()


class OptionContractWithGreeks(BaseModel):
    strike: float | None = None
    last_price: float | None = None
    bid: float | None = None
    ask: float | None = None
    volume: int | None = None
    open_interest: int | None = None
    implied_volatility: float | None = None
    delta: float | None = None
    gamma: float | None = None
    theta: float | None = None
    vega: float | None = None
    rho: float | None = None
    charm: float | None = None
    vanna: float | None = None
    in_the_money: bool = False
    expiration: str = ""


class OptionsExpiry(BaseModel):
    expiry: str
    calls: list[dict]
    puts: list[dict]


class OptionsResponse(BaseModel):
    ticker: str
    spot: float | None
    expiries: list[OptionsExpiry]


class IVSurfaceResponse(BaseModel):
    ticker: str
    spot: float | None
    surface: dict
    cached: bool = False


class TermStructureResponse(BaseModel):
    ticker: str
    spot: float | None
    term_structure: list[dict]
    cached: bool = False


class UnusualActivityResponse(BaseModel):
    ticker: str
    unusual: list[dict]
    cached: bool = False


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


def _time_to_expiry(expiry: str) -> float:
    try:
        exp_date = datetime.strptime(expiry, "%Y-%m-%d").date()
        return (exp_date - date.today()).days / 365.0
    except Exception:
        return 0.0


def _process_chain_with_greeks(
    contracts, option_type: str, spot: float, risk_free: float, expiry: str
) -> list[dict]:
    T = _time_to_expiry(expiry)
    result = []
    for c in contracts:
        strike = c.strike
        iv = c.implied_volatility

        greeks = {}
        if strike and iv and spot and T > 0:
            greeks = all_greeks(spot, float(strike), T, risk_free, float(iv), option_type)

        result.append({
            "strike": strike,
            "last_price": c.last_price,
            "bid": c.bid,
            "ask": c.ask,
            "volume": c.volume,
            "open_interest": c.open_interest,
            "implied_volatility": iv,
            "delta": greeks.get("delta"),
            "gamma": greeks.get("gamma"),
            "theta": greeks.get("theta"),
            "vega": greeks.get("vega"),
            "rho": greeks.get("rho"),
            "charm": greeks.get("charm"),
            "vanna": greeks.get("vanna"),
            "in_the_money": c.in_the_money,
            "expiration": expiry,
        })
    return result


async def _fetch_full_chain(ticker: str, spot: float, risk_free: float):
    provider = get_provider("yfinance")
    if not provider:
        return []

    expiries = await provider.get_option_expiries(ticker)
    if not expiries:
        return []

    target_expiries = list(expiries[:6])

    chains_data = await asyncio.gather(
        *[provider.get_options_chain(ticker, exp) for exp in target_expiries],
        return_exceptions=True,
    )

    result = []
    all_contracts = []
    for exp, chain_result in zip(target_expiries, chains_data):
        if isinstance(chain_result, Exception):
            result.append(OptionsExpiry(expiry=exp, calls=[], puts=[]))
            continue
        calls_contracts, puts_contracts = chain_result
        calls = _process_chain_with_greeks(calls_contracts, "call", spot, risk_free, exp)
        puts = _process_chain_with_greeks(puts_contracts, "put", spot, risk_free, exp)
        result.append(OptionsExpiry(expiry=exp, calls=calls, puts=puts))
        all_contracts.extend(calls)
        all_contracts.extend(puts)

    return result, all_contracts


@router.get("/options/{ticker}", response_model=OptionsResponse)
async def get_options(ticker: str):
    ticker = ticker.upper()
    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No options provider available")

    info = await provider.get_ticker_info_raw(ticker)
    spot = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))

    try:
        fred_provider = get_provider("fred")
        risk_free = await fred_provider.get_latest_value("FEDFUNDS") or 5.25
        risk_free = risk_free / 100.0
    except Exception:
        risk_free = 0.0525

    chain_result = await _fetch_full_chain(ticker, spot or 0, risk_free)
    if isinstance(chain_result, tuple):
        expiries, _ = chain_result
    else:
        expiries = []

    return OptionsResponse(ticker=ticker, spot=spot, expiries=expiries)


@router.get("/options/{ticker}/surface", response_model=IVSurfaceResponse)
async def get_iv_surface(ticker: str):
    ticker = ticker.upper()
    cache_key = f"options_surface_{ticker}"
    cached = cache_get("econ", cache_key, TTL["options"])
    if cached:
        return IVSurfaceResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    info = await provider.get_ticker_info_raw(ticker)
    spot = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))

    try:
        fred_provider = get_provider("fred")
        risk_free = await fred_provider.get_latest_value("FEDFUNDS") or 5.25
        risk_free = risk_free / 100.0
    except Exception:
        risk_free = 0.0525

    chain_result = await _fetch_full_chain(ticker, spot or 0, risk_free)
    if isinstance(chain_result, tuple):
        _, all_contracts = chain_result
    else:
        all_contracts = []

    surface = compute_iv_surface(all_contracts, spot or 0, risk_free)
    data = {"ticker": ticker, "spot": spot, "surface": surface}
    cache_set("econ", cache_key, data)
    return IVSurfaceResponse(ticker=ticker, spot=spot, surface=surface)


@router.get("/options/{ticker}/term-structure", response_model=TermStructureResponse)
async def get_term_structure(ticker: str):
    ticker = ticker.upper()
    cache_key = f"options_term_{ticker}"
    cached = cache_get("econ", cache_key, TTL["options"])
    if cached:
        return TermStructureResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    info = await provider.get_ticker_info_raw(ticker)
    spot = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))

    try:
        fred_provider = get_provider("fred")
        risk_free = await fred_provider.get_latest_value("FEDFUNDS") or 5.25
        risk_free = risk_free / 100.0
    except Exception:
        risk_free = 0.0525

    chain_result = await _fetch_full_chain(ticker, spot or 0, risk_free)
    if isinstance(chain_result, tuple):
        _, all_contracts = chain_result
    else:
        all_contracts = []

    term = compute_term_structure(all_contracts, spot or 0)
    data = {"ticker": ticker, "spot": spot, "term_structure": term}
    cache_set("econ", cache_key, data)
    return TermStructureResponse(ticker=ticker, spot=spot, term_structure=term)


@router.get("/options/{ticker}/unusual", response_model=UnusualActivityResponse)
async def get_unusual_activity(ticker: str):
    ticker = ticker.upper()
    cache_key = f"options_unusual_{ticker}"
    cached = cache_get("econ", cache_key, TTL["options"])
    if cached:
        return UnusualActivityResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    info = await provider.get_ticker_info_raw(ticker)
    spot = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))

    try:
        fred_provider = get_provider("fred")
        risk_free = await fred_provider.get_latest_value("FEDFUNDS") or 5.25
        risk_free = risk_free / 100.0
    except Exception:
        risk_free = 0.0525

    chain_result = await _fetch_full_chain(ticker, spot or 0, risk_free)
    if isinstance(chain_result, tuple):
        _, all_contracts = chain_result
    else:
        all_contracts = []

    unusual = []
    for c in all_contracts:
        vol = c.get("volume")
        oi = c.get("open_interest")
        iv = c.get("implied_volatility")

        if vol and oi and vol > 0 and oi > 0:
            vol_oi_ratio = vol / oi
            if vol_oi_ratio > 3:
                unusual.append({
                    "strike": c.get("strike"),
                    "expiration": c.get("expiration"),
                    "type": "call" if c in all_contracts[:len(all_contracts)//2] else "put",
                    "volume": vol,
                    "open_interest": oi,
                    "vol_oi_ratio": round(vol_oi_ratio, 2),
                    "implied_volatility": iv,
                })

    unusual.sort(key=lambda x: x.get("vol_oi_ratio", 0), reverse=True)

    data = {"ticker": ticker, "unusual": unusual}
    cache_set("econ", cache_key, data)
    return UnusualActivityResponse(ticker=ticker, unusual=unusual)


# ─── Historical Implied Volatility ────────────────────────────────────────────

class HistoricalIVResponse(BaseModel):
    ticker: str
    atm_iv_30d: float | None = None
    date: str | None = None
    history: list[dict]  # [{"date": str, "iv": float | None}]
    source: str = "yfinance"
    cached: bool = False


@router.get("/options/{symbol}/historical-iv", response_model=HistoricalIVResponse)
async def get_historical_iv(symbol: str):
    symbol = symbol.upper()
    cache_key = f"options_hist_iv_{symbol}"
    cached = cache_get("econ", cache_key, TTL["options"])
    if cached:
        return HistoricalIVResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    try:
        info = await provider.get_ticker_info_raw(symbol)
        spot = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        if not spot:
            raise HTTPException(status_code=404, detail=f"No price data for {symbol}")

        expiries = await provider.get_option_expiries(symbol)
        if not expiries:
            fallback = cache_get("econ", cache_key, TTL["options"] * 10)
            if fallback:
                return HistoricalIVResponse(**fallback, cached=True)
            raise HTTPException(status_code=404, detail=f"No option expiries for {symbol}")

        # Find the expiry closest to 30 days from now
        from datetime import date as _date, timedelta
        target_date = _date.today() + timedelta(days=30)
        closest_expiry = min(expiries, key=lambda e: abs((_date.fromisoformat(e) - target_date).days))

        chain_result = await provider.get_options_chain(symbol, closest_expiry)
        if not chain_result or not chain_result[0]:
            fallback = cache_get("econ", cache_key, TTL["options"] * 10)
            if fallback:
                return HistoricalIVResponse(**fallback, cached=True)
            raise HTTPException(status_code=404, detail="No options chain data")

        calls, puts = chain_result

        # Find ATM contract: closest strike to spot
        all_contracts = list(calls) + list(puts)
        if not all_contracts:
            fallback = cache_get("econ", cache_key, TTL["options"] * 10)
            if fallback:
                return HistoricalIVResponse(**fallback, cached=True)
            raise HTTPException(status_code=404, detail="No contracts in chain")

        atm_contract = min(all_contracts, key=lambda c: abs((c.strike or 0) - spot))
        atm_iv = atm_contract.implied_volatility

        # Compute approximate historical IV from realized volatility of the underlying
        # as a proxy for historical implied vol
        df = await provider.get_historical(symbol, period="1y")
        history = []
        atm_iv_30d = atm_iv

        if df is not None and not df.empty:
            returns = df["Close"].pct_change().dropna()
            # 21-day rolling annualized vol as proxy for historical IV
            rolling_vol = returns.rolling(21).std() * math.sqrt(252)
            for idx, val in rolling_vol.items():
                if pd.isna(val):
                    continue
                time_val = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
                history.append({"date": time_val, "iv": round(float(val), 4)})

        data = {
            "ticker": symbol,
            "atm_iv_30d": atm_iv,
            "date": closest_expiry,
            "history": history,
            "source": "yfinance",
        }
        cache_set("econ", cache_key, data)
        return HistoricalIVResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["options"] * 10)
        if fallback:
            return HistoricalIVResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Historical IV fetch failed: {exc}")