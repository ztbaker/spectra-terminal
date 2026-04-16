"""ECB SDMX API provider for reference rates, yield curves, and HICP.

API docs: https://data-api.ecb.europa.eu/
All ECB data is publicly accessible — no API key required.
"""

import logging
from typing import Any

import httpx

from providers.base import BaseProvider
from models.shared import EconSeries, EconIndicator

logger = logging.getLogger(__name__)

_ECB_API_BASE = "https://data-api.ecb.europa.eu/service/data"
_TIMEOUT = 15.0

ECB_SERIES: dict[str, tuple[str, str]] = {
    "ECB_REF_RATE":  ("EXR.D.USD.EUR.SP00.A", "ECB Reference Rate EUR/USD"),
    "ECB_YIELD_10Y": ("YC/M/AT1X/EA+US+UK+JP/EUR/GB_XDC_RTY10_V.LRINUT25.A", "ECB 10Y Government Bond Yield"),
    "ECB_HICP":     ("ICP/M.000.N.000000.4.ANR", "ECB HICP All-Items YoY"),
}


class ECBProvider(BaseProvider):
    name = "ecb"

    @staticmethod
    def _make_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=httpx.Timeout(_TIMEOUT),
            headers={"Accept": "application/json"},
            follow_redirects=True,
        )

    async def get_econ_series(
        self, series_id: str, start: str = "2010-01-01"
    ) -> EconSeries | None:
        entry = ECB_SERIES.get(series_id)
        if not entry:
            return None
        flow_ref, label = entry

        url = f"{_ECB_API_BASE}/{flow_ref}"
        params = {
            "startPeriod": start,
            "detail": "dataonly",
            "format": "json",
        }

        try:
            async with self._make_client() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("ECB fetch failed for %s: %s", series_id, exc)
            return None

        observations = []
        try:
            series_list = data.get("data", {}).get("structure", {}).get("dimensions", {}).get("observation", [])
            time_periods = []
            for dim in data.get("data", {}).get("structure", {}).get("dimensions", {}).get("series", []):
                if dim.get("id") == "TIME_PERIOD":
                    time_periods = [v["id"] for v in dim.get("values", [])]

            obs_data = data.get("data", {}).get("dataSets", [{}])[0].get("observations", {})
            for key, val in obs_data.items():
                idx = int(key.split(":")[0]) if ":" in key else int(key)
                if idx < len(time_periods):
                    date_str = time_periods[idx]
                    try:
                        observations.append({
                            "date": date_str,
                            "value": round(float(val[0]), 6),
                        })
                    except (TypeError, ValueError, IndexError):
                        continue
        except Exception as exc:
            logger.error("ECB parse failed for %s: %s", series_id, exc)
            return None

        return EconSeries(
            series_id=series_id,
            title=label,
            units="",
            frequency="",
            observations=observations,
            source="ecb",
        )