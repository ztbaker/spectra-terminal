from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any
import asyncio

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL

router = APIRouter()


class Observation(BaseModel):
    date: str
    value: float


class EconResponse(BaseModel):
    series_id: str
    title: str
    units: str
    frequency: str
    observations: list[Observation]
    cached: bool = False


class EconSearchResult(BaseModel):
    series_id: str
    title: str
    frequency: str
    units: str


class EconSearchResponse(BaseModel):
    results: list[EconSearchResult]
    cached: bool = False


class IndicatorEntry(BaseModel):
    series_id: str
    label: str
    value: float | None = None
    prev: float | None = None
    change: float | None = None
    units: str = ""
    frequency: str = ""


class IndicatorsResponse(BaseModel):
    indicators: list[IndicatorEntry]
    source: str = "fred"
    cached: bool = False


class CentralBankEntry(BaseModel):
    series_id: str
    label: str
    value: float | None = None
    date: str | None = None
    units: str = ""


class CentralBankResponse(BaseModel):
    holdings: list[CentralBankEntry]
    source: str = "fred"
    cached: bool = False


class DotsEntry(BaseModel):
    country: str
    exports: float | None = None
    imports: float | None = None
    balance: float | None = None
    period: str | None = None


class DotsResponse(BaseModel):
    entries: list[DotsEntry]
    source: str = "fred"
    cached: bool = False


class HousePriceResponse(BaseModel):
    series_id: str
    title: str
    observations: list[Observation]
    source: str = "fred"
    cached: bool = False


class RetailPriceEntry(BaseModel):
    series_id: str
    label: str
    value: float | None = None
    date: str | None = None
    change_yoy: float | None = None
    units: str = ""


class RetailPricesResponse(BaseModel):
    indicators: list[RetailPriceEntry]
    source: str = "fred"
    cached: bool = False


@router.get("/econ/search", response_model=EconSearchResponse)
async def search_econ(q: str = Query(..., min_length=1), limit: int = Query(default=20, le=50)):
    cache_key = f"econ_search_{q.upper()}_{limit}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return EconSearchResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="No FRED provider available")

    try:
        from fredapi import Fred
        fred = Fred(api_key=fred_provider.fred.api_key if hasattr(fred_provider, 'fred') and hasattr(fred_provider.fred, 'api_key') else "")
        if not fred:
            raise HTTPException(status_code=502, detail="FRED API key not configured")
        results_raw = fred.search(q, limit=limit)
    except Exception:
        results_raw = []

    results = []
    for r in (results_raw or [])[:limit]:
        try:
            results.append(EconSearchResult(
                series_id=str(r.get("series_id", r.get("id", ""))),
                title=str(r.get("title", "")),
                frequency=str(r.get("frequency_short", r.get("frequency", ""))),
                units=str(r.get("units_short", r.get("units", ""))),
            ))
        except Exception:
            continue

    data = {"results": [r.model_dump() for r in results]}
    cache_set("econ", cache_key, data)
    return EconSearchResponse(results=results)


@router.get("/econ/{series_id}", response_model=EconResponse)
async def get_econ(
    series_id: str,
    start: str = Query(default="2010-01-01"),
):
    series_id = series_id.upper()
    cache_key = f"{series_id}_{start}"

    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return EconResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="No FRED provider available")

    try:
        result = await fred_provider.get_econ_series(series_id, start=start)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if result is None:
        raise HTTPException(status_code=404, detail=f"No data for {series_id}")

    data = result.model_dump()
    cache_set("econ", cache_key, data)
    return EconResponse(**data)


# ─── Key Economic Indicators Dashboard ────────────────────────────────────────

KEY_INDICATORS = {
    "GDP":                ("GDP",       "GDP",               "Billions of Dollars", "Quarterly"),
    "UNRATE":             ("UNRATE",    "Unemployment Rate", "Percent",             "Monthly"),
    "CPIAUCSL":           ("CPIAUCSL",  "CPI (All Items)",   "Index 1982-84=100",   "Monthly"),
    "FEDFUNDS":           ("FEDFUNDS",  "Fed Funds Rate",    "Percent",             "Monthly"),
    "DGS10":              ("DGS10",     "10Y Treasury",      "Percent",             "Daily"),
    "T10Y2Y":             ("T10Y2Y",   "10Y-2Y Spread",     "Percent",             "Daily"),
    "UMCSENT":             ("UMCSENT",  "Consumer Sentiment","Index",               "Monthly"),
    "PCE":                ("PCE",       "PCE Price Index",   "Billions of Dollars", "Monthly"),
    "HOUST":              ("HOUST",     "Housing Starts",    "Thousands",           "Monthly"),
    "INDPRO":             ("INDPRO",   "Industrial Production", "Index 2017=100",   "Monthly"),
}


@router.get("/econ/indicators", response_model=IndicatorsResponse)
async def get_indicators():
    cache_key = "econ_indicators"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return IndicatorsResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="No FRED provider available")

    try:
        tasks = {
            sid: fred_provider.get_econ_series(sid, start="2023-01-01")
            for sid in KEY_INDICATORS
        }
        series_results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        indicators = []
        for (sid, (label, _, units, freq)), result in zip(KEY_INDICATORS.items(), series_results):
            if isinstance(result, Exception) or result is None:
                indicators.append(IndicatorEntry(series_id=sid, label=label, units=units, frequency=freq))
                continue
            obs = result.observations
            value = obs[-1]["value"] if obs else None
            prev = obs[-2]["value"] if len(obs) >= 2 else None
            change = round(value - prev, 4) if value is not None and prev is not None else None
            indicators.append(IndicatorEntry(
                series_id=sid, label=label, value=value, prev=prev,
                change=change, units=units, frequency=freq,
            ))

        data = {"indicators": [i.model_dump() for i in indicators], "source": "fred"}
        cache_set("econ", cache_key, data)
        return IndicatorsResponse(indicators=indicators, source="fred")
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return IndicatorsResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Indicators fetch failed: {exc}")


# ─── Central Bank Holdings ────────────────────────────────────────────────────

CENTRAL_BANK_SERIES = {
    "WALCL":  ("WALCL",  "Fed Total Assets",         "Millions of Dollars"),
    "WRESCRT":("WRESCRT","Fed Securities Held Outright","Millions of Dollars"),
    "WLCFLL": ("WLCFLL", "Fed Loans & Leases",        "Millions of Dollars"),
}


@router.get("/econ/central-bank-holdings", response_model=CentralBankResponse)
async def get_central_bank_holdings():
    cache_key = "econ_cb_holdings"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return CentralBankResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="No FRED provider available")

    try:
        tasks = {
            sid: fred_provider.get_econ_series(sid, start="2023-01-01")
            for sid in CENTRAL_BANK_SERIES
        }
        series_results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        holdings = []
        for (sid, (label, _, units)), result in zip(CENTRAL_BANK_SERIES.items(), series_results):
            if isinstance(result, Exception) or result is None:
                holdings.append(CentralBankEntry(series_id=sid, label=label, units=units))
                continue
            obs = result.observations
            value = obs[-1]["value"] if obs else None
            date = obs[-1]["date"] if obs else None
            holdings.append(CentralBankEntry(series_id=sid, label=label, value=value, date=date, units=units))

        data = {"holdings": [h.model_dump() for h in holdings], "source": "fred"}
        cache_set("econ", cache_key, data)
        return CentralBankResponse(holdings=holdings, source="fred")
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return CentralBankResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Central bank holdings fetch failed: {exc}")


# ─── Direction of Trade Statistics ────────────────────────────────────────────

DOTS_SERIES = {
    "US":     ("BOPGSTB",     "US Trade Balance",    "Millions of Dollars"),
    "CN":     ("BOPGSTBCN",   "China Trade Balance", "Millions of Dollars"),
    "DE":     ("BOPGSTBDE",   "Germany Trade Balance","Millions of Dollars"),
    "JP":     ("BOPGSTBJP",   "Japan Trade Balance",  "Millions of Dollars"),
    "GB":     ("BOPGSTBGB",   "UK Trade Balance",     "Millions of Dollars"),
}


@router.get("/econ/dots", response_model=DotsResponse)
async def get_dots():
    cache_key = "econ_dots"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return DotsResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="No FRED provider available")

    try:
        tasks = {
            country: fred_provider.get_econ_series(sid, start="2022-01-01")
            for country, (sid, _, _) in DOTS_SERIES.items()
        }
        series_results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        entries = []
        for (country, (sid, label, units)), result in zip(DOTS_SERIES.items(), series_results):
            if isinstance(result, Exception) or result is None:
                entries.append(DotsEntry(country=country))
                continue
            obs = result.observations
            balance = obs[-1]["value"] if obs else None
            period = obs[-1]["date"] if obs else None
            entries.append(DotsEntry(country=country, exports=None, imports=None, balance=balance, period=period))

        data = {"entries": [e.model_dump() for e in entries], "source": "fred"}
        cache_set("econ", cache_key, data)
        return DotsResponse(entries=entries, source="fred")
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return DotsResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"DOTS fetch failed: {exc}")


# ─── House Price (Case-Shiller) ──────────────────────────────────────────────

HOUSE_PRICE_SERIES = {
    "CSUSHPISA": ("CSUSHPISA", "Case-Shiller US National Home Price Index", "Index Jan 2000=100"),
    "SPCS20RSA": ("SPCS20RSA", "Case-Shiller 20-City Composite",           "Index Jan 2000=100"),
}


@router.get("/econ/house-price", response_model=HousePriceResponse)
async def get_house_price():
    cache_key = "econ_house_price"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return HousePriceResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="No FRED provider available")

    try:
        result = await fred_provider.get_econ_series("CSUSHPISA", start="2010-01-01")
        if result is None:
            fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
            if fallback:
                return HousePriceResponse(**fallback, cached=True)
            raise HTTPException(status_code=404, detail="No Case-Shiller data available")

        observations = [
            Observation(date=obs["date"], value=obs["value"])
            for obs in result.observations
        ]
        data = {
            "series_id": "CSUSHPISA",
            "title": result.title or "Case-Shiller US National Home Price Index",
            "observations": [o.model_dump() for o in observations],
            "source": "fred",
        }
        cache_set("econ", cache_key, data)
        return HousePriceResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return HousePriceResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"House price fetch failed: {exc}")


# ─── Retail Prices (CPI/PPI) ─────────────────────────────────────────────────

RETAIL_PRICE_SERIES = {
    "CPIAUCSL":  ("CPIAUCSL",  "CPI All Items",         "Index 1982-84=100"),
    "CPILFESL":  ("CPILFESL",  "Core CPI (Ex Food/Energy)", "Index 1982-84=100"),
    "PPIACO":    ("PPIACO",    "PPI All Commodities",    "Index 1982=100"),
    "WPSFD49207":("WPSFD49207","PPI Final Demand",       "Index 1982=100"),
}


@router.get("/econ/retail-prices", response_model=RetailPricesResponse)
async def get_retail_prices():
    cache_key = "econ_retail_prices"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return RetailPricesResponse(**cached, cached=True)

    fred_provider = get_provider("fred")
    if not fred_provider:
        raise HTTPException(status_code=502, detail="No FRED provider available")

    try:
        tasks = {
            sid: fred_provider.get_econ_series(sid, start="2023-01-01")
            for sid in RETAIL_PRICE_SERIES
        }
        series_results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        indicators = []
        for (sid, (label, _, units)), result in zip(RETAIL_PRICE_SERIES.items(), series_results):
            if isinstance(result, Exception) or result is None:
                indicators.append(RetailPriceEntry(series_id=sid, label=label, units=units))
                continue
            obs = result.observations
            value = obs[-1]["value"] if obs else None
            date = obs[-1]["date"] if obs else None
            prev_year = obs[-13]["value"] if len(obs) >= 13 else None
            change_yoy = round(((value / prev_year) - 1) * 100, 2) if value is not None and prev_year and prev_year != 0 else None
            indicators.append(RetailPriceEntry(
                series_id=sid, label=label, value=value, date=date,
                change_yoy=change_yoy, units=units,
            ))

        data = {"indicators": [i.model_dump() for i in indicators], "source": "fred"}
        cache_set("econ", cache_key, data)
        return RetailPricesResponse(indicators=indicators, source="fred")
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return RetailPricesResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Retail prices fetch failed: {exc}")