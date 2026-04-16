"""Treasury yield curve provider using FRED as primary source.

FRED series (DGS1MO, DGS3MO, DGS1, DGS2, DGS5, DGS10, DGS30, etc.)
are free, reliable, and don't suffer from the Treasury.gov CSV 404 issue.
No API key required for basic access (FRED API key used via fred_provider).
"""

import logging
from typing import Any

from providers.base import BaseProvider
from models.shared import EconSeries, TreasuryCurvePoint

logger = logging.getLogger(__name__)

# Mapping of tenor labels → FRED series IDs
TENOR_FRED = {
    "1mo":  "DGS1MO",
    "3mo":  "DGS3MO",
    "6mo":  "DGS6MO",
    "1yr":  "DGS1",
    "2yr":  "DGS2",
    "3yr":  "DGS3",
    "5yr":  "DGS5",
    "7yr":  "DGS7",
    "10yr": "DGS10",
    "20yr": "DGS20",
    "30yr": "DGS30",
}

# TIPS tenors → FRED series IDs
TIPS_FRED = {
    "5yr":  "DFII5",
    "7yr":  "DFII7",
    "10yr": "DFII10",
    "20yr": "DFII20",
    "30yr": "DFII30",
}


class TreasuryProvider(BaseProvider):
    name = "treasury"

    async def get_yield_curve(self) -> list[TreasuryCurvePoint]:
        """Fetch the latest daily treasury yield curve from FRED."""
        fred = self._get_fred()
        if not fred:
            logger.error("FRED provider not available for yield curve")
            return []

        points: list[TreasuryCurvePoint] = []
        import asyncio

        tasks = {tenor: fred.get_econ_series(sid, start="2024-01-01") for tenor, sid in TENOR_FRED.items()}
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        for (tenor, sid), result in zip(TENOR_FRED.items(), results):
            if isinstance(result, Exception) or result is None:
                points.append(TreasuryCurvePoint(tenor=tenor))
                continue
            obs = result.observations
            if obs:
                try:
                    val = float(obs[-1]["value"])
                    points.append(TreasuryCurvePoint(tenor=tenor, yield_value=val))
                except (TypeError, ValueError, IndexError):
                    points.append(TreasuryCurvePoint(tenor=tenor))
            else:
                points.append(TreasuryCurvePoint(tenor=tenor))

        return points

    async def get_tips_yields(self) -> list[TreasuryCurvePoint]:
        """Fetch the latest TIPS real yield curve from FRED."""
        fred = self._get_fred()
        if not fred:
            logger.error("FRED provider not available for TIPS yields")
            return []

        points: list[TreasuryCurvePoint] = []
        import asyncio

        tasks = {tenor: fred.get_econ_series(sid, start="2024-01-01") for tenor, sid in TIPS_FRED.items()}
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        for (tenor, sid), result in zip(TIPS_FRED.items(), results):
            if isinstance(result, Exception) or result is None:
                points.append(TreasuryCurvePoint(tenor=tenor))
                continue
            obs = result.observations
            if obs:
                try:
                    val = float(obs[-1]["value"])
                    points.append(TreasuryCurvePoint(tenor=tenor, yield_value=val))
                except (TypeError, ValueError, IndexError):
                    points.append(TreasuryCurvePoint(tenor=tenor))
            else:
                points.append(TreasuryCurvePoint(tenor=tenor))

        return points

    async def get_historical_rates(
        self, tenor: str = "10yr", start: str = "2010-01-01"
    ) -> EconSeries | None:
        """Fetch historical rates for a specific tenor from FRED."""
        fred = self._get_fred()
        if not fred:
            logger.error("FRED provider not available for historical rates")
            return None

        # Normalize tenor to FRED series ID
        sid = TENOR_FRED.get(tenor.lower().replace(" ", ""))
        if not sid:
            # Try direct series ID
            sid = tenor.upper()

        result = await fred.get_econ_series(sid, start=start)
        if result is None:
            return None

        return EconSeries(
            series_id=f"TREASURY_{tenor.upper()}",
            title=f"Treasury {tenor.upper()} Yield",
            units="Percent",
            frequency=result.frequency,
            observations=result.observations,
            source="fred",
        )

    def _get_fred(self):
        """Get the FRED provider instance."""
        from providers.registry import get_provider
        return get_provider("fred")