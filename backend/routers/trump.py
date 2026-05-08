import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cache import cache_get, cache_set
from routers.truthsocial import _fetch_truths
from providers.twitterapi_provider import fetch_user_tweets

router = APIRouter()

TTL = 30
CACHE_KEY = "trump_feed_v1"


class FeedPost(BaseModel):
    id: str
    source: str
    username: str
    display_name: str
    created_at: str
    content: str
    url: str
    replies_count: int
    reblogs_count: int
    favourites_count: int
    media: list[dict] | None = None


class SourceStatus(BaseModel):
    ok: bool
    error: str | None = None
    count: int = 0
    display_name: str = ""


class TrumpFeedResponse(BaseModel):
    posts: list[FeedPost]
    sources: dict[str, SourceStatus]
    cached: bool = False


@router.get("/trump")
async def get_trump_feed():
    cached = cache_get("news", CACHE_KEY, TTL)
    if cached:
        return TrumpFeedResponse(**cached, cached=True)

    results = await asyncio.gather(
        _fetch_truths("realdonaldtrump", 40),
        fetch_user_tweets("RapidResponse47", 20),
        fetch_user_tweets("WhiteHouse", 20),
        return_exceptions=True,
    )

    all_posts = []
    sources = {}

    # Truth Social
    ts_result = results[0]
    if isinstance(ts_result, Exception):
        sources["truth"] = SourceStatus(ok=False, error=str(ts_result))
    else:
        ts_posts, ts_display = ts_result
        for p in ts_posts:
            p["source"] = "truth"
            p["username"] = "realDonaldTrump"
        all_posts.extend(ts_posts)
        sources["truth"] = SourceStatus(ok=True, count=len(ts_posts), display_name=ts_display)

    # RapidResponse47
    rr_result = results[1]
    if isinstance(rr_result, Exception):
        sources["rr47"] = SourceStatus(ok=False, error=str(rr_result))
    else:
        rr_posts, rr_display = rr_result
        all_posts.extend(rr_posts)
        sources["rr47"] = SourceStatus(ok=True, count=len(rr_posts), display_name=rr_display)

    # WhiteHouse
    wh_result = results[2]
    if isinstance(wh_result, Exception):
        sources["wh"] = SourceStatus(ok=False, error=str(wh_result))
    else:
        wh_posts, wh_display = wh_result
        all_posts.extend(wh_posts)
        sources["wh"] = SourceStatus(ok=True, count=len(wh_posts), display_name=wh_display)

    all_posts.sort(key=lambda p: p.get("created_at", ""), reverse=True)

    data = {
        "posts": all_posts,
        "sources": {k: v.model_dump() for k, v in sources.items()},
    }

    any_ok = any(s.ok for s in sources.values())
    if any_ok:
        cache_set("news", CACHE_KEY, data)

    if not any_ok:
        fallback = cache_get("news", CACHE_KEY, TTL * 20)
        if fallback:
            return TrumpFeedResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail="All sources failed")

    return TrumpFeedResponse(posts=all_posts, sources=sources)