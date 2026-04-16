from abc import ABC, abstractmethod
from typing import Any

import pandas as pd

from models.shared import (
    Quote,
    OHLCBar,
    Fundamental,
    NewsItem,
    OptionContract,
    EconSeries,
    Filing,
    InstitutionalHolding,
    EconIndicator,
    TreasuryCurvePoint,
)


class BaseProvider(ABC):
    name: str = "base"

    # ─── Equity ────────────────────────────────────────────────────────────────

    async def get_quote(self, ticker: str) -> Quote | None:
        return None

    async def get_fundamentals(self, ticker: str) -> Fundamental | None:
        return None

    async def get_historical(
        self,
        ticker: str,
        period: str = "1y",
        interval: str = "1d",
    ) -> pd.DataFrame | None:
        return None

    # ─── Options ──────────────────────────────────────────────────────────────

    async def get_option_expiries(self, ticker: str) -> tuple[str, ...]:
        return ()

    async def get_options_chain(
        self, ticker: str, expiry: str
    ) -> tuple[list[OptionContract], list[OptionContract]]:
        return [], []

    # ─── News ──────────────────────────────────────────────────────────────────

    async def get_news(self, ticker: str, limit: int = 50) -> list[NewsItem]:
        return []

    # ─── Econ ─────────────────────────────────────────────────────────────────

    async def get_econ_series(
        self, series_id: str, start: str = "2010-01-01"
    ) -> EconSeries | None:
        return None

    async def get_latest_value(self, series_id: str) -> float | None:
        return None

    # ─── Filings ──────────────────────────────────────────────────────────────

    async def get_filings(
        self, ticker: str, form_type: str = "10-K", limit: int = 10
    ) -> list[Filing]:
        return []

    # ─── Search ───────────────────────────────────────────────────────────────

    async def search_symbols(self, query: str) -> list[dict]:
        return []

    # ─── Convenience ─────────────────────────────────────────────────────────

    async def get_bulk_quotes(self, tickers: list[str]) -> list[Quote]:
        import asyncio

        results = await asyncio.gather(
            *[self.get_quote(t) for t in tickers], return_exceptions=True
        )
        output: list[Quote] = []
        for ticker, result in zip(tickers, results):
            if isinstance(result, Exception) or result is None:
                output.append(Quote(ticker=ticker))
            else:
                output.append(result)
        return output