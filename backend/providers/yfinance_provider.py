import asyncio
import math
from functools import partial
from typing import Any

import yfinance as yf
import pandas as pd

from providers.base import BaseProvider
from models.shared import (
    Quote,
    OHLCBar,
    Fundamental,
    NewsItem,
    OptionContract,
)


class YFinanceProvider(BaseProvider):
    name = "yfinance"

    @staticmethod
    async def _run_sync(func, *args, **kwargs) -> Any:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(func, *args, **kwargs))

    async def _retry(
        self, func, *args, attempts: int = 3, delay: float = 0.5, **kwargs
    ) -> Any:
        for attempt in range(attempts):
            try:
                return await self._run_sync(func, *args, **kwargs)
            except Exception:
                if attempt == attempts - 1:
                    raise
                await asyncio.sleep(delay * (attempt + 1))

    @staticmethod
    def _safe_float(val) -> float | None:
        try:
            v = float(val)
            return None if math.isnan(v) or math.isinf(v) else v
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _safe_int(val) -> int | None:
        try:
            return int(val)
        except (TypeError, ValueError):
            return None

    async def get_quote(self, ticker: str) -> Quote | None:
        def _fetch():
            t = yf.Ticker(ticker)
            fi = t.fast_info
            info = t.info or {}
            price = getattr(fi, "last_price", None)
            prev_close = getattr(fi, "previous_close", None)
            change = None
            change_pct = None
            if price and prev_close:
                change = round(price - prev_close, 4)
                change_pct = round((change / prev_close) * 100, 4)
            return Quote(
                ticker=ticker.upper(),
                price=self._safe_float(price),
                prev_close=self._safe_float(prev_close),
                change=self._safe_float(change),
                change_pct=self._safe_float(change_pct),
                open=self._safe_float(getattr(fi, "open", None)),
                bid=self._safe_float(info.get("bid")),
                ask=self._safe_float(info.get("ask")),
                day_high=self._safe_float(getattr(fi, "day_high", None)),
                day_low=self._safe_float(getattr(fi, "day_low", None)),
                volume=self._safe_int(getattr(fi, "last_volume", None)),
                avg_volume=self._safe_int(info.get("averageVolume")),
                market_cap=self._safe_float(getattr(fi, "market_cap", None)),
                currency=getattr(fi, "currency", None),
                exchange=getattr(fi, "exchange", None),
                source="yfinance",
            )

        try:
            return await self._retry(_fetch)
        except Exception:
            return None

    async def get_fundamentals(self, ticker: str) -> Fundamental | None:
        def _fetch():
            t = yf.Ticker(ticker)
            info = t.info or {}
            if not info:
                return None

            price = info.get("currentPrice") or info.get("regularMarketPrice")
            prev_close = info.get("previousClose") or info.get(
                "regularMarketPreviousClose"
            )
            change = None
            change_pct = None
            if price and prev_close:
                change = round(price - prev_close, 4)
                change_pct = round((change / prev_close) * 100, 4)

            officers = info.get("companyOfficers", [])
            ceo = None
            if isinstance(officers, list):
                for officer in officers:
                    title = (officer.get("title") or "").lower()
                    if "ceo" in title or "chief executive" in title:
                        ceo = officer.get("name")
                        break

            address_parts = [
                info.get("address1"),
                info.get("city"),
                info.get("state"),
            ]
            address = ", ".join(p for p in address_parts if p) or None

            return Fundamental(
                ticker=ticker.upper(),
                revenue_ttm=self._safe_float(info.get("totalRevenue")),
                net_income_ttm=self._safe_float(info.get("netIncomeToCommon")),
                eps_ttm=self._safe_float(info.get("trailingEps")),
                gross_margin=self._safe_float(info.get("grossMargins")),
                operating_margin=self._safe_float(info.get("operatingMargins")),
                debt_to_equity=self._safe_float(info.get("debtToEquity")),
                current_ratio=self._safe_float(info.get("currentRatio")),
                return_on_equity=self._safe_float(info.get("returnOnEquity")),
                return_on_assets=self._safe_float(info.get("returnOnAssets")),
                revenue_growth=self._safe_float(info.get("revenueGrowth")),
                earnings_growth=self._safe_float(info.get("earningsGrowth")),
                pe_ratio=self._safe_float(
                    info.get("trailingPE") or info.get("forwardPE")
                ),
                forward_pe=self._safe_float(info.get("forwardPE")),
                ev_ebitda=self._safe_float(info.get("enterpriseToEbitda")),
                price_to_book=self._safe_float(info.get("priceToBook")),
                sector=info.get("sector"),
                industry=info.get("industry"),
                company_name=info.get("longName") or info.get("shortName"),
                description=info.get("longBusinessSummary"),
                country=info.get("country"),
                employees=self._safe_int(info.get("fullTimeEmployees")),
                source="yfinance",
            )

        try:
            return await self._retry(_fetch)
        except Exception:
            return None

    async def get_historical(
        self,
        ticker: str,
        period: str = "1y",
        interval: str = "1d",
        prepost: bool = False,
    ) -> pd.DataFrame | None:
        def _fetch():
            t = yf.Ticker(ticker)
            return t.history(
                period=period, interval=interval, auto_adjust=True, prepost=prepost
            )

        try:
            df = await self._retry(_fetch)
            return df if df is not None and not df.empty else None
        except Exception:
            return None

    async def get_historical_range(
        self,
        ticker: str,
        start: str,
        end: str,
        interval: str = "1d",
    ) -> tuple[pd.DataFrame | None, bool, bool]:
        """Fetch historical data by date range.

        Returns (df, truncated, has_more):
          - df: DataFrame with OHLCV columns (auto_adjust=False to preserve
                original Close for indicator consistency), or None on error.
          - truncated: True if the requested start fell before yfinance's
                intraday lookback limit and was clamped.
          - has_more: heuristic — False if df is empty or the first bar is
                at/before a known IPO-like boundary; otherwise True.
        """
        intraday_intervals = {"1m", "5m", "15m", "30m", "1h"}
        truncated = False

        if interval in intraday_intervals:
            cutoff = pd.Timestamp.utcnow() - pd.Timedelta(days=60)
            start_ts = pd.Timestamp(start, tz="UTC")
            if start_ts < cutoff:
                start = cutoff.strftime("%Y-%m-%d")
                truncated = True

        def _fetch():
            t = yf.Ticker(ticker)
            return t.history(
                start=start,
                end=end,
                interval=interval,
                auto_adjust=False,
            )

        try:
            df = await self._retry(_fetch)
            if df is None or df.empty:
                return None, False, False
            has_more = True
            return df, truncated, has_more
        except Exception:
            return None, False, False

    async def get_option_expiries(self, ticker: str) -> tuple[str, ...]:
        def _fetch():
            t = yf.Ticker(ticker)
            return t.options or ()

        try:
            return await self._retry(_fetch)
        except Exception:
            return ()

    async def get_options_chain(
        self, ticker: str, expiry: str
    ) -> tuple[list[OptionContract], list[OptionContract]]:
        def _fetch():
            t = yf.Ticker(ticker)
            chain = t.option_chain(expiry)
            return chain.calls, chain.puts

        try:
            calls_df, puts_df = await self._retry(_fetch)
        except Exception:
            return [], []

        calls = self._parse_chain(calls_df, "call", expiry)
        puts = self._parse_chain(puts_df, "put", expiry)
        return calls, puts

    def _parse_chain(
        self, df: pd.DataFrame, option_type: str, expiry: str
    ) -> list[OptionContract]:
        contracts = []
        for _, row in df.iterrows():
            iv = self._safe_float(row.get("impliedVolatility"))
            contracts.append(
                OptionContract(
                    strike=self._safe_float(row.get("strike")),
                    last_price=self._safe_float(row.get("lastPrice")),
                    bid=self._safe_float(row.get("bid")),
                    ask=self._safe_float(row.get("ask")),
                    volume=self._safe_int(row.get("volume")),
                    open_interest=self._safe_int(row.get("openInterest")),
                    implied_volatility=iv,
                    in_the_money=bool(row.get("inTheMoney", False)),
                    expiration=expiry,
                )
            )
        return contracts

    async def get_news(self, ticker: str, limit: int = 50) -> list[NewsItem]:
        return []

    async def get_ticker_info_raw(self, ticker: str) -> dict:
        def _fetch():
            t = yf.Ticker(ticker)
            return t.info or {}

        try:
            return await self._retry(_fetch) or {}
        except Exception:
            return {}

    async def get_fast_quote_raw(self, ticker: str) -> dict:
        def _fetch():
            t = yf.Ticker(ticker)
            fi = t.fast_info
            return {
                "ticker": ticker,
                "price": getattr(fi, "last_price", None),
                "prev_close": getattr(fi, "previous_close", None),
                "open": getattr(fi, "open", None),
                "day_high": getattr(fi, "day_high", None),
                "day_low": getattr(fi, "day_low", None),
                "volume": getattr(fi, "last_volume", None),
                "market_cap": getattr(fi, "market_cap", None),
                "currency": getattr(fi, "currency", None),
                "exchange": getattr(fi, "exchange", None),
            }

        try:
            return await self._retry(_fetch)
        except Exception:
            return {"ticker": ticker}

    async def get_financials_raw(self, ticker: str, period: str) -> dict:
        def _fetch():
            t = yf.Ticker(ticker)
            if period == "quarterly":
                return {
                    "income": t.quarterly_income_stmt,
                    "balance": t.quarterly_balance_sheet,
                    "cashflow": t.quarterly_cashflow,
                    "info": t.info or {},
                }
            return {
                "income": t.income_stmt,
                "balance": t.balance_sheet,
                "cashflow": t.cashflow,
                "info": t.info or {},
            }

        try:
            return await self._retry(_fetch)
        except Exception:
            return {"income": None, "balance": None, "cashflow": None, "info": {}}

    async def get_extended_quote_raw(self, ticker: str) -> dict:
        def _fetch():
            t = yf.Ticker(ticker)
            fi = t.fast_info
            info = t.info or {}
            price = getattr(fi, "last_price", None)
            prev_close = getattr(fi, "previous_close", None)
            market_state = info.get("marketState", "CLOSED")
            pre_market_price = info.get("preMarketPrice")
            pre_market_change = info.get("preMarketChange")
            pre_market_change_pct = info.get("preMarketChangePercent")
            post_market_price = info.get("postMarketPrice")
            post_market_change = info.get("postMarketChange")
            post_market_change_pct = info.get("postMarketChangePercent")
            regular_market_price = info.get("regularMarketPrice")
            regular_market_time = info.get("regularMarketTime")
            pre_market_time = info.get("preMarketTime")
            post_market_time = info.get("postMarketTime")
            regular_market_previous_close = (
                info.get("regularMarketPreviousClose") or prev_close
            )
            return {
                "ticker": ticker,
                "price": self._safe_float(price),
                "prev_close": self._safe_float(prev_close),
                "market_state": market_state,
                "pre_market_price": self._safe_float(pre_market_price),
                "pre_market_change": self._safe_float(pre_market_change),
                "pre_market_change_pct": self._safe_float(pre_market_change_pct),
                "pre_market_time": self._safe_int(pre_market_time)
                if pre_market_time
                else None,
                "post_market_price": self._safe_float(post_market_price),
                "post_market_change": self._safe_float(post_market_change),
                "post_market_change_pct": self._safe_float(post_market_change_pct),
                "post_market_time": self._safe_int(post_market_time)
                if post_market_time
                else None,
                "regular_market_price": self._safe_float(regular_market_price),
                "regular_market_time": self._safe_int(regular_market_time)
                if regular_market_time
                else None,
                "regular_close": self._safe_float(regular_market_previous_close),
                "open": self._safe_float(getattr(fi, "open", None)),
                "day_high": self._safe_float(getattr(fi, "day_high", None)),
                "day_low": self._safe_float(getattr(fi, "day_low", None)),
                "volume": self._safe_int(getattr(fi, "last_volume", None)),
                "bid": self._safe_float(info.get("bid")),
                "ask": self._safe_float(info.get("ask")),
            }

        try:
            return await self._retry(_fetch)
        except Exception:
            return {"ticker": ticker}
