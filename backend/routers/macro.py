import asyncio

from fastapi import APIRouter
from pydantic import BaseModel

from providers.registry import get_provider
from providers.fred_provider import MACRO_SERIES
from cache import cache_get, cache_set, TTL

router = APIRouter()


class MacroCard(BaseModel):
    series_id: str
    label: str
    value: float | None
    prev: float | None
    change: float | None
    units: str
    sparkline: list[float]
    error: str | None = None


class MacroDashboardResponse(BaseModel):
    cards: list[MacroCard]
    cached: bool = False


@router.get("/macro/dashboard", response_model=MacroDashboardResponse)
async def get_macro():
    cache_key = "macro_dashboard"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return MacroDashboardResponse(cards=cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        return MacroDashboardResponse(cards=[])

    tasks = {sid: fred_provider.get_econ_series(sid, start="2020-01-01") for sid in MACRO_SERIES}
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    cards = []
    for (series_id, label), result in zip(MACRO_SERIES.items(), results):
        if isinstance(result, Exception):
            cards.append(MacroCard(
                series_id=series_id, label=label, value=None, prev=None,
                change=None, units="", sparkline=[], error=str(result),
            ))
            continue

        if result is None:
            cards.append(MacroCard(
                series_id=series_id, label=label, value=None, prev=None,
                change=None, units="", sparkline=[],
            ))
            continue

        obs = result.observations
        value = obs[-1]["value"] if obs else None
        prev = obs[-2]["value"] if len(obs) >= 2 else None
        change = round(value - prev, 4) if value is not None and prev is not None else None
        sparkline = [o["value"] for o in obs[-24:]]

        cards.append(MacroCard(
            series_id=series_id,
            label=label,
            value=value,
            prev=prev,
            change=change,
            units=result.units,
            sparkline=sparkline,
        ))

    cards_data = [c.model_dump() for c in cards]
    cache_set("econ", cache_key, cards_data)
    return MacroDashboardResponse(cards=cards)