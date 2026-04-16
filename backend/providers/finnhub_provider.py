import asyncio
from datetime import datetime, timezone, timedelta
from functools import partial
from typing import Any

import finnhub

from providers.base import BaseProvider
from models.shared import NewsItem
from config import settings


class FinnhubProvider(BaseProvider):
    name = "finnhub"

    def __init__(self):
        self._client: finnhub.Client | None = None

    @property
    def client(self) -> finnhub.Client:
        if self._client is None:
            self._client = finnhub.Client(api_key=settings.FINNHUB_API_KEY)
        return self._client

    @staticmethod
    async def _run(func, *args, **kwargs) -> Any:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(func, *args, **kwargs))

    async def get_news(self, ticker: str, limit: int = 50) -> list[NewsItem]:
        today = datetime.now(timezone.utc).date()
        from_date = (today - timedelta(days=7)).strftime("%Y-%m-%d")
        to_date = today.strftime("%Y-%m-%d")

        try:
            articles = await self._run(
                self.client.company_news, ticker, _from=from_date, to=to_date
            )
        except Exception:
            return []

        items = []
        for art in (articles or [])[:limit]:
            items.append(
                NewsItem(
                    headline=art.get("headline", ""),
                    source=art.get("source", "Finnhub"),
                    url=art.get("url", ""),
                    datetime=art.get("datetime", 0),
                    summary=art.get("summary", ""),
                    source_provider="finnhub",
                )
            )
        return items

    async def get_company_profile(self, ticker: str) -> dict:
        try:
            return await self._run(self.client.company_profile2, symbol=ticker) or {}
        except Exception:
            return {}