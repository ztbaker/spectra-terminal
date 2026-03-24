import asyncio
import math
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from cache import cache_get, cache_set, TTL
from services.yfinance_service import get_fast_quote, get_history

router = APIRouter()

# yfinance ticker  ->  human-readable label
FX_PAIRS: dict[str, str] = {
    "EURUSD=X": "EUR/USD",
    "GBPUSD=X": "GBP/USD",
    "USDJPY=X": "USD/JPY",
    "USDCHF=X": "USD/CHF",
    "AUDUSD=X": "AUD/USD",
    "USDCAD=X": "USD/CAD",
    "NZDUSD=X": "NZD/USD",
    "EURGBP=X": "EUR/GBP",
    "EURJPY=X": "EUR/JPY",
}

_CACHE_KEY = "fx_all"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class FXPair(BaseModel):
    pair: str           # yfinance ticker, e.g. "EURUSD=X"
    label: str          # human label, e.g. "EUR/USD"
    rate: Optional[float]
    change: Optional[float]
    change_pct: Optional[float]
    day_high: Optional[float]
    day_low: Optional[float]
    chart_data: list[dict]  # [{time, open, high, low, close}]


class FXResponse(BaseModel):
    pairs: list[FXPair]
    cached: bool = False


class FXRates(BaseModel):
    rates: dict[str, Optional[float]]
    fetched_at: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _df_to_chart(df) -> list[dict]:
    """Convert a yfinance OHLCV DataFrame to a list of chart-point dicts."""
    if df is None or df.empty:
        return []
    rows = []
    for ts, row in df.iterrows():
        try:
            # ts can be a Timestamp; convert to ISO string
            time_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
            rows.append({
                "time":  time_str,
                "open":  _safe_float(row.get("Open")),
                "high":  _safe_float(row.get("High")),
                "low":   _safe_float(row.get("Low")),
                "close": _safe_float(row.get("Close")),
            })
        except Exception:
            continue
    return rows


async def _fetch_pair(pair: str, label: str) -> FXPair:
    """Fetch quote + intraday history for one FX pair; never raises."""
    quote: dict = {}
    chart_data: list[dict] = []

    try:
        quote = await get_fast_quote(pair)
    except Exception:
        quote = {}

    try:
        df = await get_history(pair, period="1d", interval="5m")
        chart_data = _df_to_chart(df)
    except Exception:
        chart_data = []

    price    = _safe_float(quote.get("price"))
    prev_close = _safe_float(quote.get("prev_close"))

    change: Optional[float] = None
    change_pct: Optional[float] = None
    if price is not None and prev_close and prev_close != 0:
        change     = round(price - prev_close, 6)
        change_pct = round((change / prev_close) * 100, 4)

    return FXPair(
        pair=pair,
        label=label,
        rate=price,
        change=change,
        change_pct=change_pct,
        day_high=_safe_float(quote.get("day_high")),
        day_low=_safe_float(quote.get("day_low")),
        chart_data=chart_data,
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/fx/rates", response_model=FXRates)
async def get_fx_rates():
    """Lightweight endpoint: current mid rates only, no chart history. 15s cache."""
    import time
    cached = cache_get("price", "fx_rates_live", 15)
    if cached:
        return FXRates(**cached)

    tasks = [get_fast_quote(pair) for pair in FX_PAIRS]
    quotes = await asyncio.gather(*tasks, return_exceptions=True)

    rates: dict[str, Optional[float]] = {}
    for pair, result in zip(FX_PAIRS, quotes):
        if isinstance(result, Exception):
            rates[pair] = None
        else:
            rates[pair] = _safe_float(result.get("price"))

    payload = {"rates": rates, "fetched_at": time.time()}
    cache_set("price", "fx_rates_live", payload)
    return FXRates(**payload)


@router.get("/fx", response_model=FXResponse)
async def get_fx():
    cached = cache_get("price", _CACHE_KEY, TTL["price"])
    if cached:
        return FXResponse(**cached, cached=True)

    tasks = [_fetch_pair(pair, label) for pair, label in FX_PAIRS.items()]
    results = await asyncio.gather(*tasks)

    pairs = list(results)
    payload = {"pairs": [p.model_dump() for p in pairs]}
    cache_set("price", _CACHE_KEY, payload)

    return FXResponse(pairs=pairs, cached=False)
