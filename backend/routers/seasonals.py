from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from providers.registry import get_provider
from analytics.seasonals import compute_seasonals, best_worst_months, compute_yearly_paths, compute_seasonal_envelope
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


class YearPathPointModel(BaseModel):
    day_of_year: int
    cum_return: float


class YearPathModel(BaseModel):
    year: int
    points: list[YearPathPointModel]


class SeasonalEnvelopePointModel(BaseModel):
    day_of_year: int
    mean_cum_return: float
    median_cum_return: float
    p25: float
    p75: float


class SeasonalsResponse(BaseModel):
    ticker: str
    years: int
    points: list[SeasonalPointModel]
    best_months: list[dict]
    worst_months: list[dict]
    monthly: list[dict]
    yearly_paths: list[YearPathModel] = []
    seasonal_path: list[SeasonalEnvelopePointModel] = []
    cached: bool = False


@router.get("/seasonals/{ticker}", response_model=SeasonalsResponse)
async def get_seasonals(ticker: str, years: int = Query(20, ge=1, le=30)):
    ticker = ticker.upper()
    cache_key = f"seas_v2_{ticker}_{years}"
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

    yearly = compute_yearly_paths(df, years=years)
    current_year = max((yp.year for yp in yearly), default=None)
    envelope = compute_seasonal_envelope(yearly, exclude_year=current_year)

    payload = {
        "ticker": ticker,
        "years": years,
        "points": [p.__dict__ for p in points],
        "best_months": aggregates["best"],
        "worst_months": aggregates["worst"],
        "monthly": aggregates["monthly"],
        "yearly_paths": [{"year": yp.year, "points": [p.__dict__ for p in yp.points]} for yp in yearly],
        "seasonal_path": [e.__dict__ for e in envelope],
    }
    cache_set("chart", cache_key, payload)
    return SeasonalsResponse(**payload, cached=False)
