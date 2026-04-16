import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import yfinance as yf
from fastapi import APIRouter, Query
from pydantic import BaseModel

from cache import cache_get, cache_set, TTL
from database import get_conn

router = APIRouter()

# Representative universe of major S&P 500 tickers
SP500_UNIVERSE: list[str] = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "V", "MA",
    "UNH", "JNJ", "PG", "HD", "BAC", "XOM", "CVX", "ABBV", "MRK", "LLY",
    "PEP", "KO", "COST", "WMT", "DIS", "NFLX", "INTC", "AMD", "CRM", "ADBE",
    "PYPL", "T", "VZ", "PFE", "BMY", "AMGN", "MDT", "HON", "MMM", "BA",
    "CAT", "DE", "GS", "MS", "BLK", "SPGI", "CME", "ICE",
]


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class EarningsEntry(BaseModel):
    ticker: str
    company_name: Optional[str]
    earnings_date: str  # ISO date string YYYY-MM-DD
    eps_estimate: Optional[float]
    eps_actual: Optional[float]
    revenue_estimate: Optional[float]
    revenue_actual: Optional[float]
    when_market: str  # BMO / AMC / unknown


class EarningsDay(BaseModel):
    date: str  # ISO date string YYYY-MM-DD
    entries: list[EarningsEntry]


class EarningsResponse(BaseModel):
    days: list[EarningsDay]
    cached: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(val) -> Optional[float]:
    """Convert a value to float, returning None on failure."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if (f != f) else f  # reject NaN
    except (TypeError, ValueError):
        return None


def _fetch_calendar_sync(ticker: str) -> Optional[dict]:
    """Synchronous yfinance calendar fetch; returns a normalized dict or None."""
    try:
        t = yf.Ticker(ticker)

        # .info for company name
        info = t.info or {}
        company_name = info.get("longName") or info.get("shortName")

        cal = t.calendar  # dict or None
        if not cal:
            return None

        # yfinance returns either a dict with "Earnings Date" list or a
        # DataFrame; handle both gracefully.
        if hasattr(cal, "to_dict"):
            cal = cal.to_dict()

        # Earnings Date can be a list of Timestamps or a single Timestamp
        earnings_dates = cal.get("Earnings Date") or cal.get("earningsDate") or []
        if not isinstance(earnings_dates, list):
            earnings_dates = [earnings_dates]

        if not earnings_dates:
            return None

        # Take the first (nearest upcoming) date
        raw_date = earnings_dates[0]
        try:
            if hasattr(raw_date, "date"):
                earnings_dt: date = raw_date.date()
            else:
                earnings_dt = datetime.fromisoformat(str(raw_date)).date()
        except Exception:
            return None

        eps_estimate   = _safe_float(cal.get("Earnings Average") or cal.get("epsEstimate"))
        eps_actual     = _safe_float(cal.get("Earnings Low"))      # yf doesn't expose actuals reliably
        rev_estimate   = _safe_float(cal.get("Revenue Average") or cal.get("revenueEstimate"))
        rev_actual     = _safe_float(cal.get("Revenue Low"))

        # Determine BMO / AMC from the time component if available
        when_market = "unknown"
        try:
            raw_ts = earnings_dates[0]
            if hasattr(raw_ts, "hour"):
                hour = raw_ts.hour
            else:
                hour = datetime.fromisoformat(str(raw_ts)).hour
            if hour < 10:
                when_market = "BMO"
            elif hour >= 16:
                when_market = "AMC"
        except Exception:
            pass

        return {
            "ticker":           ticker.upper(),
            "company_name":     company_name,
            "earnings_date":    earnings_dt.isoformat(),
            "eps_estimate":     eps_estimate,
            "eps_actual":       eps_actual,
            "revenue_estimate": rev_estimate,
            "revenue_actual":   rev_actual,
            "when_market":      when_market,
        }
    except Exception:
        return None


async def _fetch_calendar(ticker: str, loop, executor) -> Optional[dict]:
    """Run the synchronous calendar fetch in a thread executor."""
    try:
        return await loop.run_in_executor(executor, _fetch_calendar_sync, ticker)
    except Exception:
        return None


def _get_watchlist_tickers() -> list[str]:
    """Pull tickers from the SQLite watchlist table."""
    try:
        with get_conn() as conn:
            rows = conn.execute("SELECT ticker FROM watchlist").fetchall()
        return [r["ticker"] for r in rows]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/earnings/calendar", response_model=EarningsResponse)
async def get_earnings_calendar(
    lookahead_days: int = Query(default=14, ge=1, le=90),
):
    cache_key = f"earnings_calendar_{lookahead_days}"
    cached = cache_get("chart", cache_key, TTL["daily"])
    if cached:
        return EarningsResponse(**cached, cached=True)

    # Build ticker universe
    watchlist_tickers = _get_watchlist_tickers()
    universe = list(dict.fromkeys(SP500_UNIVERSE + watchlist_tickers))  # deduplicate, preserve order

    today = date.today()
    cutoff = today + timedelta(days=lookahead_days)

    loop = asyncio.get_event_loop()

    # Fetch all calendars concurrently
    tasks = [_fetch_calendar(ticker, loop, None) for ticker in universe]
    results = await asyncio.gather(*tasks)

    # Bucket by date
    by_date: dict[str, list[dict]] = {}
    for entry in results:
        if entry is None:
            continue
        try:
            earnings_dt = date.fromisoformat(entry["earnings_date"])
        except (ValueError, KeyError):
            continue

        if earnings_dt < today or earnings_dt > cutoff:
            continue

        date_str = entry["earnings_date"]
        by_date.setdefault(date_str, []).append(entry)

    # Sort and build response
    days: list[EarningsDay] = []
    for date_str in sorted(by_date.keys()):
        entries = [EarningsEntry(**e) for e in by_date[date_str]]
        entries.sort(key=lambda e: e.ticker)
        days.append(EarningsDay(date=date_str, entries=entries))

    payload = {"days": [d.model_dump() for d in days]}
    cache_set("chart", cache_key, payload)

    return EarningsResponse(days=days, cached=False)
