"""FINRA public data provider for short sale volume and ATS data.

Uses the FINRA API — no API key required for public endpoints.
https://otctransparency.finra.org/otctransparency/ats-data
"""

import logging
from typing import Any

import httpx

from providers.base import BaseProvider
from models.shared import EconSeries

logger = logging.getLogger(__name__)

_FINRA_API_BASE = "https://api.finra.org"
_TIMEOUT = 15.0


class FINRAProvider(BaseProvider):
    name = "finra"

    @staticmethod
    def _make_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=httpx.Timeout(_TIMEOUT),
            follow_redirects=True,
        )

    async def get_short_sale_volume(self, ticker: str | None = None, limit: int = 30) -> list[dict]:
        """Fetch weekly short sale volume data from FINRA."""
        url = f"{_FINRA_API_BASE}/data/group/OTCMarket/name/shortSaleVolume"
        params = {
            "limit": limit,
            "sort": "weekStartDate:desc",
        }
        if ticker:
            params["symbol"] = ticker

        try:
            async with self._make_client() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("FINRA short sale volume fetch failed: %s", exc)
            return []

        return data if isinstance(data, list) else []

    async def get_ats_data(self, ticker: str | None = None, limit: int = 30) -> list[dict]:
        """Fetch ATS (Alternative Trading System) transparency data from FINRA."""
        url = f"{_FINRA_API_BASE}/data/group/OTCMarket/name/WeeklySummaryBySymbol"
        params = {
            "limit": limit,
            "sort": "weekStartDate:desc",
        }
        if ticker:
            params["symbol"] = ticker

        try:
            async with self._make_client() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("FINRA ATS data fetch failed: %s", exc)
            return []

        return data if isinstance(data, list) else []

    async def get_econ_series(
        self, series_id: str, start: str = "2010-01-01"
    ) -> EconSeries | None:
        return None