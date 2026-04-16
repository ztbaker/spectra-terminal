"""Fixed income module — treasury rates, yield curve, TIPS, EFFR, mortgage rates."""

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL

router = APIRouter()

logger = logging.getLogger(__name__)


class YieldCurvePoint(BaseModel):
    tenor: str
    yield_value: float | None = None


class YieldCurveResponse(BaseModel):
    date: str | None = None
    curve: list[YieldCurvePoint]
    cached: bool = False


class HistoricalRateResponse(BaseModel):
    series_id: str
    title: str
    units: str
    frequency: str
    observations: list[dict]
    cached: bool = False


class EFFRResponse(BaseModel):
    rate: float | None = None
    date: str | None = None
    cached: bool = False


class MortgageRateResponse(BaseModel):
    rate_30y: float | None = None
    rate_15y: float | None = None
    date: str | None = None
    cached: bool = False


class BondIndexResponse(BaseModel):
    series_id: str
    title: str
    value: float | None = None
    prev: float | None = None
    change: float | None = None
    cached: bool = False


class TCMRate(BaseModel):
    tenor: str
    series_id: str
    value: float | None = None
    date: str | None = None


class TCMResponse(BaseModel):
    rates: list[TCMRate]
    date: str | None = None
    source: str = "fred"
    cached: bool = False


SECTOR_SPREADS = {
    "2s10s": ("DGS2", "DGS10"),
    "3m10y": ("DTB3", "DGS10"),
}


@router.get("/fi/treasury/rates", response_model=YieldCurveResponse)
async def get_treasury_rates():
    cache_key = "fi_treasury_rates"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return YieldCurveResponse(**cached, cached=True)

    treasury_provider = get_provider("treasury")
    if not treasury_provider:
        raise HTTPException(status_code=502, detail="Treasury provider not available")

    curve = await treasury_provider.get_yield_curve()
    data = {"date": None, "curve": [p.model_dump() for p in curve]}
    cache_set("econ", cache_key, data)
    return YieldCurveResponse(date=None, curve=curve)


@router.get("/fi/treasury/historical", response_model=HistoricalRateResponse)
async def get_treasury_historical(
    tenor: str = Query(default="10Y"),
    start: str = Query(default="2010-01-01"),
):
    cache_key = f"fi_treasury_hist_{tenor}_{start}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return HistoricalRateResponse(**cached, cached=True)

    treasury_provider = get_provider("treasury")
    if not treasury_provider:
        raise HTTPException(status_code=502, detail="Treasury provider not available")

    result = await treasury_provider.get_historical_rates(tenor=tenor, start=start)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No historical data for tenor {tenor}")

    data = result.model_dump()
    cache_set("econ", cache_key, data)
    return HistoricalRateResponse(**data)


@router.get("/fi/tips/yields", response_model=list[YieldCurvePoint])
async def get_tips_yields():
    cache_key = "fi_tips_yields"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return [YieldCurvePoint(**p) for p in cached]

    treasury_provider = get_provider("treasury")
    if not treasury_provider:
        raise HTTPException(status_code=502, detail="Treasury provider not available")

    points = await treasury_provider.get_tips_yields()
    data = [p.model_dump() for p in points]
    cache_set("econ", cache_key, data)
    return points


@router.get("/fi/effr", response_model=EFFRResponse)
async def get_effr():
    cache_key = "fi_effr"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return EFFRResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="FRED provider not available")

    series = await fred_provider.get_econ_series("FEDFUNDS", start="2024-01-01")
    if series and series.observations:
        latest = series.observations[-1]
        data = {"rate": latest["value"], "date": latest["date"]}
        cache_set("econ", cache_key, data)
        return EFFRResponse(rate=latest["value"], date=latest["date"])

    data = {"rate": None, "date": None}
    cache_set("econ", cache_key, data)
    return EFFRResponse()


@router.get("/fi/curve-spread", response_model=dict)
async def get_curve_spread(
    spread: str = Query(default="2s10y"),
):
    cache_key = f"fi_curve_spread_{spread}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return cached

    pair = SECTOR_SPREADS.get(spread)
    if not pair:
        raise HTTPException(status_code=400, detail=f"Unknown spread: {spread}. Use: {list(SECTOR_SPREADS.keys())}")

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="FRED provider not available")

    short_series, long_series = await asyncio.gather(
        fred_provider.get_econ_series(pair[0], start="2024-01-01"),
        fred_provider.get_econ_series(pair[1], start="2024-01-01"),
    )

    short_obs = short_series.observations if short_series else []
    long_obs = long_series.observations if long_series else []

    spread_points = []
    for s, l in zip(short_obs, long_obs):
        try:
            val = round(float(l["value"]) - float(s["value"]), 4)
            spread_points.append({"date": l["date"], "value": val})
        except (TypeError, ValueError):
            continue

    current = spread_points[-1]["value"] if spread_points else None
    data = {
        "spread": spread,
        "short_series": pair[0],
        "long_series": pair[1],
        "current_bps": round(current * 100, 1) if current is not None else None,
        "history": spread_points[-60:],
    }
    cache_set("econ", cache_key, data)
    return data


@router.get("/fi/mortgage", response_model=MortgageRateResponse)
async def get_mortgage_rates():
    cache_key = "fi_mortgage"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return MortgageRateResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="FRED provider not available")

    m30, m15 = await asyncio.gather(
        fred_provider.get_econ_series("MORTGAGE30US", start="2024-01-01"),
        fred_provider.get_econ_series("MORTGAGE15US", start="2024-01-01"),
    )

    rate_30y = None
    date = None
    if m30 and m30.observations:
        latest = m30.observations[-1]
        rate_30y = latest["value"]
        date = latest["date"]

    rate_15y = None
    if m15 and m15.observations:
        rate_15y = m15.observations[-1]["value"]

    data = {"rate_30y": rate_30y, "rate_15y": rate_15y, "date": date}
    cache_set("econ", cache_key, data)
    return MortgageRateResponse(**data)


@router.get("/fi/bond-indices", response_model=list[BondIndexResponse])
async def get_bond_indices():
    cache_key = "fi_bond_indices"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return [BondIndexResponse(**b) for b in cached]

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="FRED provider not available")

    bond_series = {
        "BAMLH0A0HYM2TRIV": "ICE BofA US High Yield Total Return",
        "BAMLCC0A1CMTRIV": "ICE BofA US Corp AAA Total Return",
        "BAMLCC4A0115TRIV": "ICE BofA US IG 5-10yr Total Return",
    }

    results = []
    import asyncio as _asyncio
    tasks = {sid: fred_provider.get_econ_series(sid, start="2024-01-01") for sid in bond_series}
    series_results = await _asyncio.gather(*tasks.values(), return_exceptions=True)

    for (sid, label), result in zip(bond_series.items(), series_results):
        if isinstance(result, Exception) or result is None:
            results.append(BondIndexResponse(series_id=sid, title=label))
            continue

        obs = result.observations
        value = obs[-1]["value"] if obs else None
        prev = obs[-2]["value"] if len(obs) >= 2 else None
        change = round(value - prev, 4) if value is not None and prev is not None else None

        results.append(BondIndexResponse(
            series_id=sid,
            title=label,
            value=value,
            prev=prev,
            change=change,
        ))

    data = [b.model_dump() for b in results]
    cache_set("econ", cache_key, data)
    return results


# ─── Treasury Constant Maturity ──────────────────────────────────────────────

TCM_SERIES = {
    "1M":  "DGS1MO",
    "3M":  "DGS3MO",
    "6M":  "DGS6MO",
    "1Y":  "DGS1",
    "2Y":  "DGS2",
    "3Y":  "DGS3",
    "5Y":  "DGS5",
    "7Y":  "DGS7",
    "10Y": "DGS10",
    "20Y": "DGS20",
    "30Y": "DGS30",
}


@router.get("/fi/tcm", response_model=TCMResponse)
async def get_tcm():
    cache_key = "fi_tcm"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return TCMResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="FRED provider not available")

    try:
        tasks = {
            tenor: fred_provider.get_econ_series(sid, start="2024-01-01")
            for tenor, sid in TCM_SERIES.items()
        }
        series_results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        rates = []
        latest_date = None
        for (tenor, sid), result in zip(TCM_SERIES.items(), series_results):
            if isinstance(result, Exception) or result is None:
                rates.append(TCMRate(tenor=tenor, series_id=sid))
                continue
            obs = result.observations
            value = obs[-1]["value"] if obs else None
            date = obs[-1]["date"] if obs else None
            if date and (latest_date is None or date > latest_date):
                latest_date = date
            rates.append(TCMRate(tenor=tenor, series_id=sid, value=value, date=date))

        data = {
            "rates": [r.model_dump() for r in rates],
            "date": latest_date,
            "source": "fred",
        }
        cache_set("econ", cache_key, data)
        return TCMResponse(rates=rates, date=latest_date, source="fred")
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return TCMResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"TCM fetch failed: {exc}")