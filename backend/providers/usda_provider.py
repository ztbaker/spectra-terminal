"""USDA PSD (Production, Supply and Distribution) provider.

Crop production and supply data via the USDA PSD API.
API docs: https://apps.fas.usda.gov/psdonline/
"""

import logging
from typing import Any

import httpx

from providers.base import BaseProvider
from models.shared import EconSeries

logger = logging.getLogger(__name__)

_USDA_API_BASE = "https://apps.fas.usda.gov/psdonline/api"
_TIMEOUT = 15.0


class USDAProvider(BaseProvider):
    name = "usda"

    @staticmethod
    def _make_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=httpx.Timeout(_TIMEOUT),
            follow_redirects=True,
        )

    async def get_psd_data(
        self, commodity_code: str = "0440000", country_code: str = "ALL"
    ) -> list[dict]:
        """Fetch PSD data for a commodity/country. commodity_code 0440000 = Wheat."""
        url = f"{_USDA_API_BASE}/download/PSDCommodityData"
        params = {
            "commodityCode": commodity_code,
            "countryCode": country_code,
            "format": "json",
        }

        try:
            async with self._make_client() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("USDA PSD fetch failed: %s", exc)
            return []

        return data if isinstance(data, list) else []

    async def get_econ_series(
        self, series_id: str, start: str = "2010-01-01"
    ) -> EconSeries | None:
        return None