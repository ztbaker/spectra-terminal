import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from cache import cache_get, cache_set
from config import settings
from providers.registry import get_provider

router = APIRouter()

# ─── Series catalog ───────────────────────────────────────────────────────────
# (category, series_id, label)
ECST_SERIES: list[tuple[str, str, str]] = [
    ("Growth",          "GDP",          "GDP (Quarterly)"),
    ("Growth",          "GDPC1",        "Real GDP"),
    ("Growth",          "INDPRO",       "Industrial Production"),
    ("Growth",          "RSXFS",        "Retail Sales (Adv. Est.)"),
    ("Inflation",       "CPIAUCSL",     "CPI"),
    ("Inflation",       "CPILFESL",     "Core CPI"),
    ("Inflation",       "PCEPI",        "PCE Inflation"),
    ("Inflation",       "PCEPILFE",     "Core PCE"),
    ("Labor",           "UNRATE",       "Unemployment Rate"),
    ("Labor",           "PAYEMS",       "Nonfarm Payrolls"),
    ("Labor",           "ICSA",         "Initial Jobless Claims"),
    ("Labor",           "U6RATE",       "U-6 Unemployment"),
    ("Labor",           "MANEMP",       "Mfg Employment"),
    ("Housing",         "HOUST",        "Housing Starts"),
    ("Housing",         "CSUSHPISA",    "Case-Shiller HPI"),
    ("Housing",         "MORTGAGE30US", "30Y Mortgage Rate"),
    ("Trade & Finance", "FEDFUNDS",     "Fed Funds Rate"),
    ("Trade & Finance", "DGS10",        "10Y Treasury"),
    ("Trade & Finance", "DGS2",         "2Y Treasury"),
    ("Trade & Finance", "T10Y2Y",       "10Y-2Y Spread"),
    ("Sentiment",       "UMCSENT",      "Consumer Sentiment"),
]

_CACHE_KEY = "ecst_all"
_CACHE_TTL = 900  # 15 minutes


# ─── Pydantic models ──────────────────────────────────────────────────────────

class ECSTEntry(BaseModel):
    series_id: str
    category: str
    label: str
    value: Optional[float]
    prior: Optional[float]
    change: Optional[float]
    units: str
    frequency: str
    next_release_date: Optional[str]
    sparkline: list[float]


class ECSTResponse(BaseModel):
    entries: list[ECSTEntry]
    cached: bool = False


# ─── Release date helper ──────────────────────────────────────────────────────

async def _get_release_date(series_id: str, http_client: httpx.AsyncClient) -> Optional[str]:
    """Return the next scheduled FRED release date for a series, or None."""
    api_key = settings.FRED_API_KEY
    if not api_key:
        return None
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        # Step 1: Get the release_id for this series
        r1 = await http_client.get(
            "https://api.stlouisfed.org/fred/series",
            params={"series_id": series_id, "api_key": api_key, "file_type": "json"},
        )
        r1.raise_for_status()
        seriess = r1.json().get("seriess", [])
        if not seriess:
            return None
        release_id = seriess[0].get("release_id")
        if not release_id:
            return None

        # Step 2: Get the next upcoming release date
        r2 = await http_client.get(
            "https://api.stlouisfed.org/fred/release/dates",
            params={
                "release_id": release_id,
                "realtime_start": today,
                "sort_order": "asc",
                "limit": 1,
                "api_key": api_key,
                "file_type": "json",
            },
        )
        r2.raise_for_status()
        dates = r2.json().get("release_dates", [])
        return dates[0]["date"] if dates else None
    except Exception:
        return None


# ─── Per-entry fetch ──────────────────────────────────────────────────────────

async def _fetch_entry(category: str, series_id: str, label: str, http_client: httpx.AsyncClient) -> dict:
    """Fetch series data and release date concurrently; never raises."""
    fred_provider = get_provider("fred")
    if not fred_provider:
        return {
            "series_id": series_id,
            "category": category,
            "label": label,
            "value": None,
            "prior": None,
            "change": None,
            "units": "",
            "frequency": "",
            "next_release_date": None,
            "sparkline": [],
        }

    series_task = fred_provider.get_econ_series(series_id, start="2020-01-01")
    release_task = _get_release_date(series_id, http_client)

    series_result, release_date = await asyncio.gather(
        series_task, release_task, return_exceptions=True
    )

    if isinstance(series_result, Exception) or series_result is None:
        return {
            "series_id": series_id,
            "category": category,
            "label": label,
            "value": None,
            "prior": None,
            "change": None,
            "units": "",
            "frequency": "",
            "next_release_date": None,
            "sparkline": [],
        }

    # series_result may be an EconSeries Pydantic object OR a dict (tests mock as dict).
    def _get(o, key):
        if hasattr(o, key):
            return getattr(o, key)
        if isinstance(o, dict):
            return o.get(key)
        return None

    obs = _get(series_result, "observations") or []

    def _obs_val(o):
        if hasattr(o, "value"):
            return o.value
        if isinstance(o, dict):
            return o.get("value")
        return None

    value = _obs_val(obs[-1]) if obs else None
    prior = _obs_val(obs[-2]) if len(obs) >= 2 else None
    change = round(value - prior, 4) if value is not None and prior is not None else None
    sparkline = [_obs_val(o) for o in obs[-12:] if isinstance(_obs_val(o), (int, float))]

    return {
        "series_id": series_id,
        "category": category,
        "label": label,
        "value": value,
        "prior": prior,
        "change": change,
        "units": _get(series_result, "units") or "",
        "frequency": _get(series_result, "frequency") or "",
        "next_release_date": release_date if not isinstance(release_date, Exception) else None,
        "sparkline": sparkline,
    }


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/ecst", response_model=ECSTResponse)
async def get_ecst():
    cached = cache_get("econ", _CACHE_KEY, _CACHE_TTL)
    if cached:
        return ECSTResponse(entries=cached, cached=True)

    async with httpx.AsyncClient(timeout=8.0) as http_client:
        tasks = [_fetch_entry(cat, sid, label, http_client) for cat, sid, label in ECST_SERIES]
        entries = await asyncio.gather(*tasks)

    payload = list(entries)
    cache_set("econ", _CACHE_KEY, payload)
    return ECSTResponse(entries=payload, cached=False)
