"""BLS (Bureau of Labor Statistics) API provider.

CPI, PPI, employment, JOLTS data. Free with optional BLS_API_KEY for higher rate limits.
API docs: https://www.bls.gov/developers/home.htm
"""

import logging
from typing import Any

import httpx
import pandas as pd

from providers.base import BaseProvider
from models.shared import EconSeries
from config import settings

logger = logging.getLogger(__name__)

_BLS_API_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data"
_TIMEOUT = 15.0

BLS_SERIES: dict[str, str] = {
    "CPIAUCSL": "CPI for All Urban Consumers",
    "CPILFESL": "Core CPI (All Items Less Food & Energy)",
    "PPIACO":  "Producer Price Index (All Commodities)",
    "LNS14000000": "Unemployment Rate",
    "JTS000000000000000JOL": "Job Openings (JOLTS)",
    "CES0000000001": "Total Nonfarm Employment",
    "LNS12000000": "Employment-Population Ratio",
}


class BLSProvider(BaseProvider):
    name = "bls"

    @staticmethod
    def _make_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=httpx.Timeout(_TIMEOUT),
            follow_redirects=True,
        )

    async def get_econ_series(
        self, series_id: str, start: str = "2010-01-01"
    ) -> EconSeries | None:
        payload: dict[str, Any] = {
            "seriesid": [series_id],
            "startyear": start[:4],
            "endyear": "2030",
        }
        if settings.BLS_API_KEY:
            payload["registrationKey"] = settings.BLS_API_KEY

        try:
            async with self._make_client() as client:
                resp = await client.post(_BLS_API_BASE, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("BLS fetch failed for %s: %s", series_id, exc)
            return None

        if data.get("status") != "REQUEST_SUCCEEDED":
            logger.error("BLS API error for %s: %s", series_id, data.get("message", []))
            return None

        results = data.get("Results", {}).get("series", [])
        if not results:
            return None

        series_data = results[0]
        observations = []
        for obs in series_data.get("data", []):
            try:
                year = obs.get("year", "")
                period = obs.get("period", "")
                value_str = obs.get("value", "")
                if period == "M13":
                    continue
                month = int(period.lstrip("M")) if period.startswith("M") else 1
                date_str = f"{year}-{month:02d}-01"
                value = float(value_str)
                observations.append({"date": date_str, "value": round(value, 6)})
            except (TypeError, ValueError):
                continue

        observations.sort(key=lambda o: o["date"])

        label = BLS_SERIES.get(series_id, series_id)
        return EconSeries(
            series_id=series_id,
            title=label,
            units="Index" if "CPI" in series_id or "PPI" in series_id else "",
            frequency="Monthly",
            observations=observations,
            source="bls",
        )