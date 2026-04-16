"""Stooq provider — free fallback for historical OHLC when yfinance fails.

Uses https://stooq.com/ — free, no API key required.
"""

import io
import logging
from typing import Any
from datetime import datetime

import httpx
import pandas as pd

from providers.base import BaseProvider

logger = logging.getLogger(__name__)

_STOOQ_BASE = "https://stooq.com/q/d/l/"
_TIMEOUT = 15.0

_INTERVAL_MAP = {
    "1d": "d",
    "1wk": "w",
    "1mo": "m",
}


class StooqProvider(BaseProvider):
    name = "stooq"

    @staticmethod
    def _make_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=httpx.Timeout(_TIMEOUT),
            headers={"User-Agent": "Mozilla/5.0"},
            follow_redirects=True,
        )

    @staticmethod
    def _ticker_to_stooq(ticker: str) -> str:
        """Convert common ticker formats to Stooq format."""
        ticker = ticker.upper()
        mapping = {
            "^GSPC": "^sp500",
            "^DJI": "^dji",
            "^IXIC": "^ndq",
            "^VIX": "^vix",
            "GC=F": "gc.f",
            "CL=F": "cl.f",
            "SI=F": "si.f",
            "BTC-USD": "btc.v",
        }
        return mapping.get(ticker, ticker.lower())

    async def get_historical(
        self,
        ticker: str,
        period: str = "1y",
        interval: str = "1d",
    ) -> pd.DataFrame | None:
        stooq_symbol = self._ticker_to_stooq(ticker)
        stooq_interval = _INTERVAL_MAP.get(interval, "d")

        date_from = "20100101"
        if period == "1mo":
            date_from = (datetime.now().replace(day=1)).strftime("%Y%m%d")
        elif period == "3mo":
            from dateutil.relativedelta import relativedelta
            date_from = (datetime.now() - relativedelta(months=3)).strftime("%Y%m%d")
        elif period == "6mo":
            from dateutil.relativedelta import relativedelta
            date_from = (datetime.now() - relativedelta(months=6)).strftime("%Y%m%d")
        elif period == "1y":
            from dateutil.relativedelta import relativedelta
            date_from = (datetime.now() - relativedelta(years=1)).strftime("%Y%m%d")
        elif period == "5y":
            from dateutil.relativedelta import relativedelta
            date_from = (datetime.now() - relativedelta(years=5)).strftime("%Y%m%d")

        params = {
            "s": stooq_symbol,
            "d1": date_from,
            "d2": "99991231",
            "i": stooq_interval,
        }

        try:
            async with self._make_client() as client:
                resp = await client.get(_STOOQ_BASE, params=params)
                resp.raise_for_status()
                text = resp.text
        except Exception as exc:
            logger.error("Stooq fetch failed for %s: %s", ticker, exc)
            return None

        try:
            df = pd.read_csv(io.StringIO(text), sep=",")
            if df.empty or "Date" not in df.columns:
                return None
            df["Date"] = pd.to_datetime(df["Date"])
            df = df.set_index("Date")
            df.columns = [c.capitalize() for c in df.columns]
            if "Close" in df.columns:
                df["Close"] = pd.to_numeric(df["Close"], errors="coerce")
            return df
        except Exception as exc:
            logger.error("Stooq parse failed for %s: %s", ticker, exc)
            return None