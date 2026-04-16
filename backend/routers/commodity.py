"""Commodity module — energy stocks, spot prices, PSD data."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL

router = APIRouter()

logger = logging.getLogger(__name__)


class CommoditySpot(BaseModel):
    symbol: str
    name: str
    price: float | None = None
    change: float | None = None
    change_pct: float | None = None
    cached: bool = False


class EnergyStocks(BaseModel):
    data: list[dict]
    cached: bool = False


SPOT_TICKERS: dict[str, tuple[str, str]] = {
    "WTI":    ("CL=F",  "WTI Crude Oil"),
    "BRENT":  ("BZ=F",  "Brent Crude"),
    "NG":     ("NG=F",  "Natural Gas"),
    "HH":     ("HH=F",  "Henry Hub Natural Gas"),
    "GOLD":   ("GC=F",  "Gold"),
    "SILVER": ("SI=F",  "Silver"),
}


class PSDResponse(BaseModel):
    commodity: str
    data: list[dict]
    cached: bool = False


@router.get("/commodity/spot", response_model=list[CommoditySpot])
async def get_spot_prices(symbol: str | None = Query(default=None)):
    cache_key = "commodity_spot"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        results = [CommoditySpot(**s) for s in cached]
        if symbol:
            results = [s for s in results if s.symbol == symbol.upper()]
        return results

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    import asyncio
    import math

    def _safe_float(val) -> float | None:
        try:
            v = float(val)
            return None if math.isnan(v) or math.isinf(v) else v
        except (TypeError, ValueError):
            return None

    tasks = {}
    for sym, (ticker, name) in SPOT_TICKERS.items():
        tasks[sym] = (provider.get_fast_quote_raw(ticker), ticker, name)

    results = []
    for sym, (task, ticker, name) in tasks.items():
        try:
            quote = await task
            price = _safe_float(quote.get("price"))
            prev_close = _safe_float(quote.get("prev_close"))
            change = None
            change_pct = None
            if price and prev_close:
                change = round(price - prev_close, 4)
                change_pct = round((change / prev_close) * 100, 4)
            results.append(CommoditySpot(symbol=sym, name=name, price=price, change=change, change_pct=change_pct))
        except Exception:
            results.append(CommoditySpot(symbol=sym, name=name))

    data = [r.model_dump() for r in results]
    cache_set("price", cache_key, data)

    if symbol:
        return [r for r in results if r.symbol == symbol.upper()]
    return results


@router.get("/commodity/energy/stocks", response_model=EnergyStocks)
async def get_energy_stocks():
    cache_key = "commodity_energy_stocks"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return EnergyStocks(**cached, cached=True)

    eia_provider = get_provider("eia")
    if not eia_provider:
        raise HTTPException(status_code=502, detail="EIA provider not available (EIA_API_KEY required)")

    data = await eia_provider.get_petroleum_stocks()
    payload = {"data": data}
    cache_set("econ", cache_key, payload)
    return EnergyStocks(data=data)


@router.get("/commodity/energy/outlook", response_model=dict)
async def get_energy_outlook():
    cache_key = "commodity_energy_outlook"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return cached

    eia_provider = get_provider("eia")
    if not eia_provider:
        raise HTTPException(status_code=502, detail="EIA provider not available (EIA_API_KEY required)")

    result = await eia_provider.get_econ_series("EIA_STEO_CRD")
    if result is None:
        raise HTTPException(status_code=404, detail="No STEO data available")

    data = result.model_dump()
    cache_set("econ", cache_key, data)
    return data


@router.get("/commodity/ag/psd", response_model=PSDResponse)
async def get_psd_data(
    commodity_code: str = Query(default="0440000", description="USDA commodity code (0440000=Wheat)"),
):
    cache_key = f"commodity_ag_psd_{commodity_code}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return PSDResponse(**cached, cached=True)

    usda_provider = get_provider("usda")
    if not usda_provider:
        raise HTTPException(status_code=502, detail="USDA provider not available")

    data = await usda_provider.get_psd_data(commodity_code=commodity_code)
    payload = {"commodity": commodity_code, "data": data}
    cache_set("econ", cache_key, payload)
    return PSDResponse(commodity=commodity_code, data=data)