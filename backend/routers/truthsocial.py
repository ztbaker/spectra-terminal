"""Truth Social router — fetches Trump's latest posts via truthbrush."""

import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cache import cache_get, cache_set

router = APIRouter()

TTL_TRUTHS = 120  # 2 minutes


class TruthPost(BaseModel):
    id: str
    created_at: str
    content: str  # plain text (HTML stripped)
    url: str
    replies_count: int
    reblogs_count: int  # "retruths"
    favourites_count: int  # likes
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


def _fetch_truths(username: str, count: int = 40) -> list[dict]:
    """Synchronous fetch using truthbrush."""
    from truthbrush.api import Api

    api = Api(require_auth=False)
    posts = []
    for status in api.pull_statuses(username):
        content = _strip_html(status.get("content", ""))
        if not content:
            continue

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

        if len(posts) >= count:
            break

    return posts


@router.get("/truthsocial/{username}")
async def get_truth_social(username: str, limit: int = 40):
    username = username.strip().lstrip("@")
    cache_key = f"truthsocial_{username}_{limit}"

    cached = cache_get("news", cache_key, TTL_TRUTHS)
    if cached:
        return TruthSocialResponse(**cached, cached=True)

    try:
        import asyncio
        posts = await asyncio.to_thread(_fetch_truths, username, limit)
    except Exception as exc:
        fallback = cache_get("news", cache_key, TTL_TRUTHS * 10)
        if fallback:
            return TruthSocialResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Truth Social fetch failed: {exc}")

    data = {
        "username": username,
        "display_name": "Donald J. Trump" if username.lower() == "realdonaldtrump" else username,
        "posts": posts,
    }
    cache_set("news", cache_key, data)
    return TruthSocialResponse(**data)
