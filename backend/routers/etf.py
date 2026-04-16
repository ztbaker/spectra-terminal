"""ETF module — search, info, holdings, sectors, countries, performance, historical."""

import asyncio
import math
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL

router = APIRouter()


class ETFInfo(BaseModel):
    ticker: str
    name: str | None = None
    exchange: str | None = None
    price: float | None = None
    change: float | None = None
    change_pct: float | None = None
    expense_ratio: float | None = None
    aum: float | None = None
    inception_date: str | None = None
    category: str | None = None
    benchmark: str | None = None
    description: str | None = None
    cached: bool = False


class ETFHolding(BaseModel):
    symbol: str
    name: str | None = None
    weight: float | None = None
    sector: str | None = None


class ETFSector(BaseModel):
    sector: str
    weight: float


class ETFCountry(BaseModel):
    country: str
    weight: float


class ETFPerformance(BaseModel):
    ticker: str
    perf_1d: float | None = None
    perf_1w: float | None = None
    perf_1m: float | None = None
    perf_ytd: float | None = None
    perf_1y: float | None = None
    perf_3y: float | None = None
    perf_5y: float | None = None
    cached: bool = False


class ETFSearchResult(BaseModel):
    ticker: str
    name: str | None = None
    category: str | None = None
    price: float | None = None


class ETFSearchResponse(BaseModel):
    results: list[ETFSearchResult]
    cached: bool = False


class ETFDetail(BaseModel):
    info: ETFInfo
    holdings: list[ETFHolding]
    sectors: list[ETFSector]
    countries: list[ETFCountry]
    performance: ETFPerformance
    cached: bool = False


ETF_SEARCH_UNIVERSE: list[str] = [
    "SPY", "QQQ", "IWM", "DIA", "XLF", "XLE", "XLK", "XLV", "XLU",
    "XLP", "XLY", "XLI", "XLB", "XLRE", "XLC", "VGT", "VHT", "VDE",
    "VAW", "VNQ", "VOX", "VCR", "VFH", "VGT", "VIS", "VPU",
    "EFA", "EEM", "VGK", "VWO", "IJH", "IJR", "SCHA", "SCHB",
    "SCHD", "SCHG", "SCHV", "GLD", "SLV", "TLT", "HYG", "LQD",
    "BND", "AGG", "TIP", "SHV", "SHY", "IEF", "GOVT", "MBB",
    "ARKK", "ARKW", "ARKG", "ARKF", "ARKQ",
    "IBIT", "BITO", "BITQ",
]


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return None if math.isnan(v) or math.isinf(v) else v
    except (TypeError, ValueError):
        return None


def _extract_sectors(info: dict) -> list[ETFSector]:
    sector_weights = info.get("sectorWeightings", [])
    result = []
    if isinstance(sector_weights, list) and sector_weights:
        for sw in sector_weights:
            if isinstance(sw, dict):
                for sector, weight in sw.items():
                    result.append(ETFSector(sector=sector, weight=round(weight * 100, 2)))
    return result


def _extract_countries(info: dict) -> list[ETFCountry]:
    country_weights = info.get("countryWeightings", [])
    result = []
    if isinstance(country_weights, list) and country_weights:
        for cw in country_weights:
            if isinstance(cw, dict):
                for country, weight in cw.items():
                    result.append(ETFCountry(country=country, weight=round(weight * 100, 2)))
    return result


def _extract_holdings(info: dict) -> list[ETFHolding]:
    holdings = info.get("holdings", [])
    result = []
    if isinstance(holdings, list):
        for h in holdings[:20]:
            if isinstance(h, dict):
                result.append(ETFHolding(
                    symbol=h.get("symbol", h.get("holdingName", "")),
                    name=h.get("holdingName", h.get("name", "")),
                    weight=_safe_float(h.get("holdingPercent", h.get("weight", 0))),
                    sector=h.get("sector", None),
                ))
    return result


def _extract_performance(info: dict) -> ETFPerformance:
    ticker = info.get("symbol", "")
    return ETFPerformance(
        ticker=ticker,
        perf_1d=_safe_float(info.get("ytdReturn", None)),
        perf_1w=_safe_float(info.get("fiveDayAverageReturn", None)),
        perf_1m=_safe_float(info.get("oneMonthReturn", None)),
        perf_ytd=_safe_float(info.get("ytdReturn", None)),
        perf_1y=_safe_float(info.get("oneYearReturn", None)),
        perf_3y=_safe_float(info.get("threeYearReturn", None)),
        perf_5y=_safe_float(info.get("fiveYearReturn", None)),
    )


@router.get("/etf/search", response_model=ETFSearchResponse)
async def search_etfs(q: str = Query(default="", min_length=0)):
    cache_key = f"etf_search_{q.upper()}"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        return ETFSearchResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    query = q.upper()
    tickers = [t for t in ETF_SEARCH_UNIVERSE if query in t][:10]
    if not tickers:
        tickers = ETF_SEARCH_UNIVERSE[:20]

    results = []
    for ticker in tickers:
        try:
            info = await provider.get_ticker_info_raw(ticker)
            if info:
                price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
                results.append(ETFSearchResult(
                    ticker=ticker,
                    name=info.get("shortName") or info.get("longName"),
                    category=info.get("category", None),
                    price=price,
                ))
        except Exception:
            continue

    payload = {"results": [r.model_dump() for r in results]}
    cache_set("price", cache_key, payload)
    return ETFSearchResponse(results=results, cached=False)


@router.get("/etf/{symbol}/info", response_model=ETFInfo)
async def get_etf_info(symbol: str):
    symbol = symbol.upper()
    cache_key = f"etf_info_{symbol}"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        return ETFInfo(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    info = await provider.get_ticker_info_raw(symbol)
    if not info:
        raise HTTPException(status_code=404, detail=f"No data for ETF {symbol}")

    price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
    prev_close = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
    change = None
    change_pct = None
    if price and prev_close:
        change = round(price - prev_close, 4)
        change_pct = round((change / prev_close) * 100, 4)

    data = {
        "ticker": symbol,
        "name": info.get("shortName") or info.get("longName"),
        "exchange": info.get("exchange"),
        "price": price,
        "change": change,
        "change_pct": change_pct,
        "expense_ratio": _safe_float(info.get("annualReportExpenseRatio")),
        "aum": _safe_float(info.get("totalAssets")),
        "inception_date": info.get("inceptionDate", None),
        "category": info.get("category", None),
        "benchmark": info.get("benchmark", None),
        "description": info.get("longBusinessSummary", None),
    }
    cache_set("price", cache_key, data)
    return ETFInfo(**data)


@router.get("/etf/{symbol}/holdings", response_model=list[ETFHolding])
async def get_etf_holdings(symbol: str, limit: int = Query(default=20, le=50)):
    symbol = symbol.upper()
    cache_key = f"etf_holdings_{symbol}"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        return [ETFHolding(**h) for h in cached]

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    info = await provider.get_ticker_info_raw(symbol)
    if not info:
        raise HTTPException(status_code=404, detail=f"No data for ETF {symbol}")

    holdings = _extract_holdings(info)[:limit]
    data = [h.model_dump() for h in holdings]
    cache_set("price", cache_key, data)
    return holdings


@router.get("/etf/{symbol}/sectors", response_model=list[ETFSector])
async def get_etf_sectors(symbol: str):
    symbol = symbol.upper()
    cache_key = f"etf_sectors_{symbol}"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        return [ETFSector(**s) for s in cached]

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    info = await provider.get_ticker_info_raw(symbol)
    if not info:
        raise HTTPException(status_code=404, detail=f"No data for ETF {symbol}")

    sectors = _extract_sectors(info)
    data = [s.model_dump() for s in sectors]
    cache_set("price", cache_key, data)
    return sectors


@router.get("/etf/{symbol}/countries", response_model=list[ETFCountry])
async def get_etf_countries(symbol: str):
    symbol = symbol.upper()
    cache_key = f"etf_countries_{symbol}"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        return [ETFCountry(**c) for c in cached]

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    info = await provider.get_ticker_info_raw(symbol)
    if not info:
        raise HTTPException(status_code=404, detail=f"No data for ETF {symbol}")

    countries = _extract_countries(info)
    data = [c.model_dump() for c in countries]
    cache_set("price", cache_key, data)
    return countries


@router.get("/etf/{symbol}/performance", response_model=ETFPerformance)
async def get_etf_performance(symbol: str):
    symbol = symbol.upper()
    cache_key = f"etf_perf_{symbol}"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        return ETFPerformance(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    info = await provider.get_ticker_info_raw(symbol)
    if not info:
        raise HTTPException(status_code=404, detail=f"No data for ETF {symbol}")

    perf = _extract_performance(info)
    cache_set("price", cache_key, perf.model_dump())
    return perf


class ETFHistoricalBar(BaseModel):
    time: str
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: int | None = None


class ETFHistoricalResponse(BaseModel):
    ticker: str
    period: str
    interval: str
    ohlcv: list[ETFHistoricalBar]
    source: str = "yfinance"
    cached: bool = False


@router.get("/etf/{symbol}/historical", response_model=ETFHistoricalResponse)
async def get_etf_historical(
    symbol: str,
    period: str = Query(default="1y"),
    interval: str = Query(default="1d"),
):
    symbol = symbol.upper()
    cache_key = f"etf_hist_{symbol}_{period}_{interval}"
    cached = cache_get("chart", cache_key, TTL["daily"])
    if cached:
        return ETFHistoricalResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    try:
        df = await provider.get_historical(symbol, period=period, interval=interval)
    except Exception as exc:
        fallback = cache_get("chart", cache_key, TTL["daily"] * 10)
        if fallback:
            return ETFHistoricalResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}")

    if df is None or df.empty:
        fallback = cache_get("chart", cache_key, TTL["daily"] * 10)
        if fallback:
            return ETFHistoricalResponse(**fallback, cached=True)
        raise HTTPException(status_code=404, detail=f"No data for ETF {symbol}")

    bars = []
    for idx, row in df.iterrows():
        time_val = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
        bars.append(ETFHistoricalBar(
            time=time_val,
            open=_safe_float(row.get("Open")),
            high=_safe_float(row.get("High")),
            low=_safe_float(row.get("Low")),
            close=_safe_float(row.get("Close")),
            volume=int(row.get("Volume", 0)) if pd.notna(row.get("Volume")) else None,
        ))

    data = {
        "ticker": symbol,
        "period": period,
        "interval": interval,
        "ohlcv": [b.model_dump() for b in bars],
        "source": "yfinance",
    }
    cache_set("chart", cache_key, data)
    return ETFHistoricalResponse(**data)


@router.get("/etf/{symbol}/equity-exposure")
async def get_equity_exposure(ticker: str = Query(...)):
    """Which ETFs hold a given equity ticker."""
    ticker = ticker.upper()
    cache_key = f"etf_exposure_{ticker}"
    cached = cache_get("price", cache_key, TTL["daily"])
    if cached:
        return cached

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    results = []
    for etf_symbol in ETF_SEARCH_UNIVERSE:
        try:
            info = await provider.get_ticker_info_raw(etf_symbol)
            if not info:
                continue
            holdings = info.get("holdings", [])
            if isinstance(holdings, list):
                for h in holdings:
                    if isinstance(h, dict) and h.get("symbol", "").upper() == ticker:
                        results.append({
                            "etf": etf_symbol,
                            "etf_name": info.get("shortName", ""),
                            "weight": _safe_float(h.get("holdingPercent", h.get("weight", 0))),
                        })
        except Exception:
            continue

    cache_set("price", cache_key, results)
    return results