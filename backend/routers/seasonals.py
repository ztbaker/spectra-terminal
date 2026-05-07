from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from providers.registry import get_provider
from analytics.seasonals import compute_seasonals, best_worst_months
from cache import cache_get, cache_set

router = APIRouter()


class SeasonalPointModel(BaseModel):
    day_of_year: int
    month: int
    day: int
    mean_return: float
    median_return: float
    p25_return: float
    p75_return: float
    cumulative_mean: float
    cumulative_median: float
    sample_size: int


class SeasonalsResponse(BaseModel):
    ticker: str
    years: int
    points: list[SeasonalPointModel]
    best_months: list[dict]
    worst_months: list[dict]
    monthly: list[dict]
    cached: bool = False


@router.get("/seasonals/{ticker}", response_model=SeasonalsResponse)
async def get_seasonals(ticker: str, years: int = Query(20, ge=1, le=30)):
    ticker = ticker.upper()
    cache_key = f"seas_{ticker}_{years}"
    cached = cache_get("chart", cache_key, 86400)
    if cached:
        return SeasonalsResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if provider is None:
        raise HTTPException(status_code=503, detail="yfinance provider unavailable")

    df = await provider.get_historical(ticker, period=f"{years}y", interval="1d")
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"no historical data for {ticker}")

    points = compute_seasonals(df, years=years)
    if not points:
        raise HTTPException(status_code=422, detail="insufficient history for seasonals")

    aggregates = best_worst_months(points)
    payload = {
        "ticker": ticker,
        "years": years,
        "points": [p.__dict__ for p in points],
        "best_months": aggregates["best"],
        "worst_months": aggregates["worst"],
        "monthly": aggregates["monthly"],
    }
    cache_set("chart", cache_key, payload)
    return SeasonalsResponse(**payload, cached=False)
