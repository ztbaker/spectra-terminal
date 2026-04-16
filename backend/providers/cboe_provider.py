"""CBOE public provider for options chains and VIX term structure.

Uses public CBOE CSV endpoints — no API key required.
https://www.cboe.com/tradable_products/vix/
"""

import io
import logging
from typing import Any

import httpx
import pandas as pd

from providers.base import BaseProvider
from models.shared import EconSeries, OptionContract

logger = logging.getLogger(__name__)

_CBOE_BASE = "https://www.cboe.com"
_TIMEOUT = 15.0

CBOE_INDEXES: dict[str, str] = {
    "VIX": "^VIX",
    "VIX9D": "^VIX9D",
    "VIX3M": "^VIX3M",
    "VVIX": "^VVIX",
}


class CBOEProvider(BaseProvider):
    name = "cboe"

    @staticmethod
    def _make_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=httpx.Timeout(_TIMEOUT),
            headers={"User-Agent": "Mozilla/5.0"},
            follow_redirects=True,
        )

    async def get_vix_term_structure(self) -> list[dict]:
        """Fetch VIX term structure data from CBOE public CSV."""
        url = f"{_CBOE_BASE}/us/futures/market_statistics/volatility_indexes.csv"
        try:
            async with self._make_client() as client:
                resp = await client.get(url)
                resp.raise_for_status()
                df = pd.read_csv(io.BytesIO(resp.content))
        except Exception as exc:
            logger.error("CBOE VIX term structure fetch failed: %s", exc)
            return []

        results = []
        for _, row in df.iterrows():
            entry = {}
            for col in df.columns:
                try:
                    entry[col] = row[col]
                except Exception:
                    continue
            results.append(entry)
        return results

    async def get_econ_series(
        self, series_id: str, start: str = "2010-01-01"
    ) -> EconSeries | None:
        return None