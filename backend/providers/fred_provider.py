import asyncio
import math
from functools import partial
from typing import Any

from fredapi import Fred

from providers.base import BaseProvider
from models.shared import EconSeries
from config import settings


class FredProvider(BaseProvider):
    name = "fred"

    def __init__(self):
        self._fred: Fred | None = None

    @property
    def fred(self) -> Fred:
        if self._fred is None:
            self._fred = Fred(api_key=settings.FRED_API_KEY)
        return self._fred

    @staticmethod
    async def _run(func, *args, **kwargs) -> Any:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(func, *args, **kwargs))

    async def get_econ_series(
        self, series_id: str, start: str = "2010-01-01"
    ) -> EconSeries | None:
        fred = self.fred
        try:
            info = await self._run(fred.get_series_info, series_id)
            series = await self._run(
                fred.get_series, series_id, observation_start=start
            )
        except Exception:
            return None

        observations = []
        for date, value in series.items():
            try:
                if math.isnan(float(value)):
                    continue
                observations.append(
                    {"date": date.strftime("%Y-%m-%d"), "value": round(float(value), 6)}
                )
            except (TypeError, ValueError):
                continue

        return EconSeries(
            series_id=series_id,
            title=str(info.get("title", series_id)),
            units=str(info.get("units_short", "")),
            frequency=str(info.get("frequency_short", "")),
            observations=observations,
            source="fred",
        )

    async def get_latest_value(self, series_id: str) -> float | None:
        fred = self.fred
        try:
            series = await self._run(fred.get_series, series_id)
            clean = series.dropna()
            if clean.empty:
                return None
            return float(clean.iloc[-1])
        except Exception:
            return None


MACRO_SERIES = {
    "FEDFUNDS":      "Fed Funds Rate",
    "DGS10":         "10Y Treasury",
    "DGS2":          "2Y Treasury",
    "T10Y2Y":        "10Y-2Y Spread",
    "CPIAUCSL":      "CPI YoY",
    "CPILFESL":      "Core CPI YoY",
    "PCE":           "PCE",
    "UNRATE":        "Unemployment Rate",
    "GDP":           "GDP Growth",
    "MANEMP":        "ISM Mfg Employment",
    "UMCSENT":       "Consumer Sentiment",
}