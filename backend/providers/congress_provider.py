"""Congress.gov API provider for bills, bill text, and bill info.

Free API with API key from https://api.congress.gov/
"""

import logging
from typing import Any

import httpx

from providers.base import BaseProvider
from config import settings

logger = logging.getLogger(__name__)

_CONGRESS_API_BASE = "https://api.congress.gov/v3"
_TIMEOUT = 15.0


class CongressProvider(BaseProvider):
    name = "congress"

    @staticmethod
    def _make_client() -> httpx.AsyncClient:
        headers = {}
        if settings.CONGRESS_API_KEY:
            headers["x-api-key"] = settings.CONGRESS_API_KEY
        return httpx.AsyncClient(
            timeout=httpx.Timeout(_TIMEOUT),
            headers=headers,
            follow_redirects=True,
        )

    async def get_bills(self, limit: int = 20, congress: int | None = None) -> list[dict]:
        """Fetch recent bills from Congress.gov."""
        from datetime import datetime
        if congress is None:
            congress = 118

        url = f"{_CONGRESS_API_BASE}/bill/{congress}"
        params = {
            "limit": limit,
            "sort": "updateDate+desc",
            "format": "json",
        }
        if settings.CONGRESS_API_KEY:
            params["api_key"] = settings.CONGRESS_API_KEY

        try:
            async with self._make_client() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("Congress.gov bills fetch failed: %s", exc)
            return []

        bills = data.get("bills", [])
        results = []
        for bill in bills:
            results.append({
                "bill_id": bill.get("number", ""),
                "title": bill.get("title", ""),
                "type": bill.get("type", ""),
                "congress": bill.get("congress", {}).get("number", congress),
                "latest_action": bill.get("latestAction", {}).get("text", ""),
                "update_date": bill.get("updateDate", ""),
                "url": bill.get("url", ""),
            })
        return results

    async def get_bill(self, congress: int, bill_type: str, bill_number: str) -> dict | None:
        """Fetch a specific bill's details."""
        url = f"{_CONGRESS_API_BASE}/bill/{congress}/{bill_type}/{bill_number}"
        params = {"format": "json"}
        if settings.CONGRESS_API_KEY:
            params["api_key"] = settings.CONGRESS_API_KEY

        try:
            async with self._make_client() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                return resp.json()
        except Exception as exc:
            logger.error("Congress.gov bill fetch failed for %s %s: %s", bill_type, bill_number, exc)
            return None