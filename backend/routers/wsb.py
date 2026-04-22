import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Query
from pydantic import BaseModel

from cache import cache_get, cache_set

router = APIRouter()

_UA = "SpectraTerminal/1.0 (market-data-terminal)"
_BASE = "https://www.reddit.com"

TTL_WSB = 10  # 10 second cache — near-real-time


class WsbComment(BaseModel):
    id: str
    author: str
    body: str
    score: int
    created_utc: float
    created_at: str
    depth: int = 0
    is_op: bool = False


class WsbThread(BaseModel):
    thread_id: str
    title: str
    author: str
    url: str
    num_comments: int
    score: int
    created_utc: float
    created_at: str


class WsbResponse(BaseModel):
    thread: WsbThread | None
    comments: list[WsbComment]
    total_comments: int
    cached: bool = False
    error: str | None = None


def _ts_to_str(ts: float) -> str:
    try:
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return ""


def _strip_markdown(text: str) -> str:
    """Light cleanup of Reddit markdown for terminal display."""
    # Remove bold/italic markers
    text = re.sub(r'\*{1,3}', '', text)
    # Remove links: [text](url) → text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove strikethrough
    text = re.sub(r'~~(.+?)~~', r'\1', text)
    return text.strip()


async def _find_daily_thread() -> dict | None:
    """Find the stickied Daily/Weekly Discussion Thread from r/wallstreetbets."""
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                f"{_BASE}/r/wallstreetbets/hot.json",
                params={"limit": 10},
                headers={"User-Agent": _UA},
            )
            resp.raise_for_status()
            data = resp.json()

        posts = data.get("data", {}).get("children", [])
        stickied = [p.get("data", {}) for p in posts if p.get("data", {}).get("stickied")]

        # Prefer daily discussion, then weekly, then any stickied
        for pd in stickied:
            title = (pd.get("title") or "").lower()
            if "daily discussion" in title:
                return pd
        for pd in stickied:
            title = (pd.get("title") or "").lower()
            if "weekly" in title or "discussion" in title or "thread" in title:
                return pd
        if stickied:
            return stickied[0]
    except Exception:
        return None
    return None


def _parse_comments(children: list, op_author: str, max_depth: int = 0) -> list[dict]:
    """Parse Reddit comment tree into flat list."""
    result = []
    for child in children:
        if child.get("kind") != "t1":
            continue
        cd = child.get("data", {})
        author = cd.get("author", "[deleted]")
        body = cd.get("body", "")
        if not body or body == "[deleted]" or body == "[removed]":
            continue

        depth = cd.get("depth", 0)
        if depth > max_depth:
            continue

        result.append({
            "id": cd.get("id", ""),
            "author": author,
            "body": _strip_markdown(body),
            "score": cd.get("score", 0),
            "created_utc": cd.get("created_utc", 0),
            "created_at": _ts_to_str(cd.get("created_utc", 0)),
            "depth": depth,
            "is_op": author == op_author,
        })

        # Include direct replies (depth 1) but not deeper
        replies = cd.get("replies")
        if isinstance(replies, dict):
            reply_children = replies.get("data", {}).get("children", [])
            result.extend(_parse_comments(reply_children, op_author, max_depth))

    return result


@router.get("/wsb", response_model=WsbResponse)
async def get_wsb(
    limit: int = Query(default=200, le=500),
    sort: str = Query(default="new"),
):
    cache_key = f"wsb_{sort}_{limit}"
    cached = cache_get("news", cache_key, TTL_WSB)
    if cached:
        return WsbResponse(**cached, cached=True)

    thread_data = await _find_daily_thread()
    if not thread_data:
        return WsbResponse(
            thread=None, comments=[], total_comments=0,
            error="Could not find today's Daily Discussion Thread.",
        )

    thread_id = thread_data.get("id", "")
    thread = WsbThread(
        thread_id=thread_id,
        title=thread_data.get("title", ""),
        author=thread_data.get("author", ""),
        url=f"https://reddit.com{thread_data.get('permalink', '')}",
        num_comments=thread_data.get("num_comments", 0),
        score=thread_data.get("score", 0),
        created_utc=thread_data.get("created_utc", 0),
        created_at=_ts_to_str(thread_data.get("created_utc", 0)),
    )

    # Fetch comments
    comments = []
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(
                f"{_BASE}/r/wallstreetbets/comments/{thread_id}.json",
                params={"sort": sort, "limit": limit},
                headers={"User-Agent": _UA},
            )
            resp.raise_for_status()
            data = resp.json()

        # Reddit returns [post, comments] array
        if isinstance(data, list) and len(data) >= 2:
            comment_listing = data[1].get("data", {}).get("children", [])
            comments = _parse_comments(
                comment_listing,
                thread_data.get("author", ""),
                max_depth=1,
            )
    except Exception:
        pass

    # Sort newest first for "new", highest score first for "top"
    if sort == "new":
        comments.sort(key=lambda c: c["created_utc"], reverse=True)
    else:
        comments.sort(key=lambda c: c["score"], reverse=True)

    payload = {
        "thread": thread.model_dump(),
        "comments": comments[:limit],
        "total_comments": thread.num_comments,
    }
    cache_set("news", cache_key, payload)
    return WsbResponse(**payload)
