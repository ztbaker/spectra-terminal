"""EIA (Energy Information Administration) API provider.

Petroleum status, short-term energy outlook, natural gas. Free with EIA_API_KEY.
API docs: https://www.eia.gov/opendata/
"""

import logging
from typing import Any

import httpx

from providers.base import BaseProvider
from models.shared import EconSeries
from config import settings

logger = logging.getLogger(__name__)

_EIA_API_BASE = "https://api.eia.gov/v2"
_TIMEOUT = 15.0

EIA_SERIES: dict[str, tuple[str, str]] = {
    "EIA_PET_WK":  ("petroleum/stoc/wstk/1", "Weekly Petroleum Stocks (Excluding SPR)"),
    "EIA_STEO_CRD": ("steo/data", "Short-Term Energy Outlook - Crude Production"),
    "EIA_NG_PRICE": ("natural-gas/pri/wng", "Natural Gas Wellhead Price"),
    "EIA_PET_RPTC": ("petroleum/stoc/wstk/2", "Crude Oil Stocks"),
    "EIA_PET_SPR":  ("petroleum/stoc/wstk/3", "Strategic Petroleum Reserve"),
}


class EIAProvider(BaseProvider):
    name = "eia"

    @staticmethod
    def _make_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=httpx.Timeout(_TIMEOUT),
            follow_redirects=True,
        )

    async def get_econ_series(
        self, series_id: str, start: str = "2010-01-01"
    ) -> EconSeries | None:
        entry = EIA_SERIES.get(series_id)
        if not entry:
            return None
        path, label = entry

        if not settings.EIA_API_KEY:
            logger.warning("EIA_API_KEY not set — cannot fetch EIA data")
            return None

        url = f"{_EIA_API_BASE}/{path}"
        params = {
            "api_key": settings.EIA_API_KEY,
            "frequency": "monthly",
            "data[]": "value",
            "start": start,
            "sort[]": "period",
        }

        try:
            async with self._make_client() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("EIA fetch failed for %s: %s", series_id, exc)
            return None

        observations = []
        response_data = data.get("response", {}).get("data", [])
        for item in response_data:
            period = item.get("period", "")
            value = item.get("value")
            if period and value is not None:
                try:
                    observations.append({
                        "date": f"{period}-01" if len(period) == 7 else period,
                        "value": round(float(value), 6),
                    })
                except (TypeError, ValueError):
                    continue

        return EconSeries(
            series_id=series_id,
            title=label,
            units="Thousand Barrels" if "PET" in series_id else "",
            frequency="Monthly",
            observations=observations,
            source="eia",
        )

    async def get_petroleum_stocks(self) -> list[dict]:
        if not settings.EIA_API_KEY:
            return []

        url = f"{_EIA_API_BASE}/petroleum/stoc/wstk/1"
        params = {
            "api_key": settings.EIA_API_KEY,
            "frequency": "weekly",
            "data[]": "value",
            "sort[]": "period",
            "length": 52,
        }

        try:
            async with self._make_client() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("EIA petroleum stocks fetch failed: %s", exc)
            return []

        return data.get("response", {}).get("data", [])