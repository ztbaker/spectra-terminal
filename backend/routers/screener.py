import asyncio
import hashlib
import json

from fastapi import APIRouter, Query
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL
from database import get_conn
from analytics.screener_parser import parse_query, evaluate

router = APIRouter()

SP500_UNIVERSE: list[str] = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "V", "MA",
    "UNH", "JNJ", "PG", "HD", "BAC", "XOM", "CVX", "ABBV", "MRK", "LLY",
    "PEP", "KO", "COST", "WMT", "DIS", "NFLX", "INTC", "AMD", "CRM", "ADBE",
    "PYPL", "T", "VZ", "PFE", "BMY", "AMGN", "MDT", "HON", "MMM", "BA",
    "CAT", "DE", "GS", "MS", "BLK", "SPGI", "CME", "ICE",
]

_CONCURRENCY = 20


class ScreenerResult(BaseModel):
    ticker: str
    company_name: str | None = None
    sector: str | None = None
    price: float | None = None
    change_pct: float | None = None
    market_cap: float | None = None
    pe_ratio: float | None = None
    volume: int | None = None
    beta: float | None = None
    high_52w: float | None = None
    low_52w: float | None = None


class ScreenerResponse(BaseModel):
    results: list[ScreenerResult]
    total: int
    cached: bool = False


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return None if (f != f) else f
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _get_watchlist_tickers() -> list[str]:
    try:
        with get_conn() as conn:
            rows = conn.execute("SELECT ticker FROM watchlist").fetchall()
        return [r["ticker"] for r in rows]
    except Exception:
        return []


def _parse_result(ticker: str, info: dict) -> ScreenerResult | None:
    if not info:
        return None

    price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
    prev_close = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))

    change_pct: float | None = None
    if price is not None and prev_close and prev_close != 0:
        change_pct = round((price / prev_close - 1) * 100, 4)

    return ScreenerResult(
        ticker=ticker.upper(),
        company_name=info.get("longName") or info.get("shortName"),
        sector=info.get("sector"),
        price=price,
        change_pct=change_pct,
        market_cap=_safe_float(info.get("marketCap")),
        pe_ratio=_safe_float(info.get("trailingPE")),
        volume=_safe_int(info.get("volume") or info.get("regularMarketVolume")),
        beta=_safe_float(info.get("beta")),
        high_52w=_safe_float(info.get("fiftyTwoWeekHigh")),
        low_52w=_safe_float(info.get("fiftyTwoWeekLow")),
    )


def _passes_filters(
    result: ScreenerResult,
    min_market_cap: float | None,
    max_pe: float | None,
    min_volume: float | None,
    sector: str | None,
    min_52w_change: float | None,
    max_52w_change: float | None,
    min_beta: float | None,
    max_beta: float | None,
) -> bool:
    if min_market_cap is not None:
        if result.market_cap is None or result.market_cap < min_market_cap:
            return False
    if max_pe is not None:
        if result.pe_ratio is None or result.pe_ratio > max_pe:
            return False
    if min_volume is not None:
        if result.volume is None or result.volume < min_volume:
            return False
    if sector is not None:
        if result.sector is None or result.sector.lower() != sector.lower():
            return False
    if (min_52w_change is not None or max_52w_change is not None):
        if result.change_pct is None:
            return False
        if min_52w_change is not None and result.change_pct < min_52w_change:
            return False
        if max_52w_change is not None and result.change_pct > max_52w_change:
            return False
    if min_beta is not None:
        if result.beta is None or result.beta < min_beta:
            return False
    if max_beta is not None:
        if result.beta is None or result.beta > max_beta:
            return False
    return True


async def _fetch_with_semaphore(
    semaphore: asyncio.Semaphore,
    ticker: str,
) -> tuple[str, dict]:
    async with semaphore:
        try:
            provider = get_provider("yfinance")
            if not provider:
                return ticker, {}
            info = await provider.get_ticker_info_raw(ticker)
            return ticker, info or {}
        except Exception:
            return ticker, {}


@router.get("/screener", response_model=ScreenerResponse)
async def run_screener(
    min_market_cap: float | None = Query(default=None),
    max_pe: float | None = Query(default=None),
    min_volume: float | None = Query(default=None),
    sector: str | None = Query(default=None),
    min_52w_change: float | None = Query(default=None),
    max_52w_change: float | None = Query(default=None),
    min_beta: float | None = Query(default=None),
    max_beta: float | None = Query(default=None),
):
    params = {
        "min_market_cap": min_market_cap,
        "max_pe": max_pe,
        "min_volume": min_volume,
        "sector": sector,
        "min_52w_change": min_52w_change,
        "max_52w_change": max_52w_change,
        "min_beta": min_beta,
        "max_beta": max_beta,
    }
    params_hash = hashlib.md5(
        json.dumps(params, sort_keys=True, default=str).encode()
    ).hexdigest()[:12]
    cache_key = f"screener_{params_hash}"

    cached = cache_get("chart", cache_key, TTL["screener"])
    if cached:
        return ScreenerResponse(**cached, cached=True)

    watchlist_tickers = _get_watchlist_tickers()
    universe = list(dict.fromkeys(SP500_UNIVERSE + watchlist_tickers))

    semaphore = asyncio.Semaphore(_CONCURRENCY)
    fetch_tasks = [_fetch_with_semaphore(semaphore, t) for t in universe]
    raw_results = await asyncio.gather(*fetch_tasks)

    results: list[ScreenerResult] = []
    for ticker, info in raw_results:
        parsed = _parse_result(ticker, info)
        if parsed is None:
            continue
        if _passes_filters(
            parsed,
            min_market_cap,
            max_pe,
            min_volume,
            sector,
            min_52w_change,
            max_52w_change,
            min_beta,
            max_beta,
        ):
            results.append(parsed)

    results.sort(
        key=lambda r: r.market_cap if r.market_cap is not None else 0.0,
        reverse=True,
    )
    results = results[:100]

    payload = {
        "results": [r.model_dump() for r in results],
        "total": len(results),
    }
    cache_set("chart", cache_key, payload)

    return ScreenerResponse(results=results, total=len(results), cached=False)


@router.get("/screener/dsl", response_model=ScreenerResponse)
async def run_screener_dsl(
    q: str = Query(..., min_length=1, description="DSL query, e.g. pe<15 AND mktcap>10b AND sector=\"Energy\""),
):
    parsed = parse_query(q)
    if parsed is None:
        raise ValueError("Invalid DSL query")

    cache_key = f"screener_dsl_{hashlib.md5(q.encode()).hexdigest()[:12]}"
    cached = cache_get("chart", cache_key, TTL["screener"])
    if cached:
        return ScreenerResponse(**cached, cached=True)

    watchlist_tickers = _get_watchlist_tickers()
    universe = list(dict.fromkeys(SP500_UNIVERSE + watchlist_tickers))

    semaphore = asyncio.Semaphore(_CONCURRENCY)
    fetch_tasks = [_fetch_with_semaphore(semaphore, t) for t in universe]
    raw_results = await asyncio.gather(*fetch_tasks)

    results: list[ScreenerResult] = []
    for ticker, info in raw_results:
        parsed_result = _parse_result(ticker, info)
        if parsed_result is None:
            continue
        row = parsed_result.model_dump()
        if evaluate(parsed, row):
            results.append(parsed_result)

    results.sort(
        key=lambda r: r.market_cap if r.market_cap is not None else 0.0,
        reverse=True,
    )
    results = results[:100]

    payload = {
        "results": [r.model_dump() for r in results],
        "total": len(results),
    }
    cache_set("chart", cache_key, payload)

    return ScreenerResponse(results=results, total=len(results), cached=False)