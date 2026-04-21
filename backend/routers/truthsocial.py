"""Truth Social router — fetches Trump's latest posts via direct API."""

import re
from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cache import cache_get, cache_set

router = APIRouter()

TTL_TRUTHS = 5  # 5 seconds — backend deduplicates rapid client polls

# Trump's Truth Social account ID (stable, won't change)
KNOWN_ACCOUNTS = {
    "realdonaldtrump": "107780257626128497",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}


class TruthPost(BaseModel):
    id: str
    created_at: str
    content: str
    url: str
    replies_count: int
    reblogs_count: int
    favourites_count: int
    media: list[dict] | None = None


class TruthSocialResponse(BaseModel):
    username: str
    display_name: str
    posts: list[TruthPost]
    cached: bool = False


def _strip_html(html: str) -> str:
    """Remove HTML tags and decode entities."""
    text = re.sub(r"<br\s*/?>", "\n", html)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    text = text.replace("&#39;", "'")
    text = text.replace("\u00a0", " ")
    return text.strip()


def _format_ts(iso: str) -> str:
    """Format ISO timestamp to readable string."""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return iso


async def _fetch_truths(username: str, count: int = 40) -> tuple[list[dict], str]:
    """Fetch posts from Truth Social's Mastodon-compatible API."""
    account_id = KNOWN_ACCOUNTS.get(username.lower())

    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
        # If we don't have a cached account ID, look it up
        if not account_id:
            resp = await client.get(
                f"https://truthsocial.com/api/v1/accounts/lookup",
                params={"acct": username},
                headers=HEADERS,
            )
            if resp.status_code != 200:
                raise Exception(f"Account lookup failed ({resp.status_code})")
            account_id = resp.json().get("id")
            if not account_id:
                raise Exception("Account not found")

        # Fetch statuses
        resp = await client.get(
            f"https://truthsocial.com/api/v1/accounts/{account_id}/statuses",
            params={"limit": min(count, 40), "exclude_replies": "true"},
            headers=HEADERS,
        )
        if resp.status_code != 200:
            raise Exception(f"Statuses fetch failed ({resp.status_code})")

        statuses = resp.json()
        display_name = username

        posts = []
        for status in statuses:
            content = _strip_html(status.get("content", ""))
            if not content:
                continue

            # Extract account display name from first status
            acct = status.get("account", {})
            if acct.get("display_name"):
                display_name = acct["display_name"]

            media = []
            for att in status.get("media_attachments", []) or []:
                media.append({
                    "type": att.get("type", "unknown"),
                    "url": att.get("url", ""),
                    "preview_url": att.get("preview_url", ""),
                })

            posts.append({
                "id": status.get("id", ""),
                "created_at": _format_ts(status.get("created_at", "")),
                "content": content,
                "url": status.get("url", ""),
                "replies_count": status.get("replies_count", 0) or 0,
                "reblogs_count": status.get("reblogs_count", 0) or 0,
                "favourites_count": status.get("favourites_count", 0) or 0,
                "media": media if media else None,
            })

        return posts, display_name


@router.get("/truthsocial/{username}")
async def get_truth_social(username: str, limit: int = 40):
    username = username.strip().lstrip("@")
    cache_key = f"truthsocial_{username}_{limit}"

    cached = cache_get("news", cache_key, TTL_TRUTHS)
    if cached:
        return TruthSocialResponse(**cached, cached=True)

    try:
        posts, display_name = await _fetch_truths(username, limit)
    except Exception as exc:
        fallback = cache_get("news", cache_key, TTL_TRUTHS * 10)
        if fallback:
            return TruthSocialResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Truth Social fetch failed: {exc}")

    data = {
        "username": username,
        "display_name": display_name,
        "posts": posts,
    }
    cache_set("news", cache_key, data)
    return TruthSocialResponse(**data)
