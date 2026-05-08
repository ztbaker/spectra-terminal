from datetime import datetime, timezone

import httpx

from config import settings

HEADERS = {
    "X-API-Key": settings.TWITTERAPI_KEY,
    "Accept": "application/json",
}


def _parse_twitter_date(raw: str) -> str:
    # Twitter API returns RFC 2822: "Tue Mar 04 18:23:21 +0000 2026"
    try:
        dt = datetime.strptime(raw, "%a %b %d %H:%M:%S %z %Y")
        return dt.strftime("%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        pass
    # Fallback: ISO format
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        return raw


async def fetch_user_tweets(username: str, limit: int = 20) -> tuple[list[dict], str]:
    if not settings.TWITTERAPI_KEY:
        raise ValueError("TWITTERAPI_KEY not configured")

    params = {
        "userName": username,
        "includeReplies": "false",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.twitterapi.io/twitter/user/last_tweets",
            params=params,
            headers=HEADERS,
        )
        if resp.status_code != 200:
            raise Exception(f"twitterapi.io returned {resp.status_code}")

        body = resp.json()
        # twitterapi.io wraps the tweet list under `data.tweets` (with a top-level
        # `status`/`code`/`msg`). Older docs showed the array at the root, so accept either.
        data = body.get("data") if isinstance(body.get("data"), dict) else None
        tweets = (data or body).get("tweets") or []
        display_name = username

        posts = []
        for tweet in tweets:
            if len(posts) >= limit:
                break
            tid = tweet.get("id", "")
            author = tweet.get("author", {})
            if author and author.get("name"):
                display_name = author["name"]
            posts.append({
                "id": tid,
                "source": "twitter",
                "username": username,
                "display_name": display_name,
                "created_at": _parse_twitter_date(tweet.get("createdAt", "")),
                "content": tweet.get("text", ""),
                "url": tweet.get("url") or f"https://x.com/{username}/status/{tid}",
                "replies_count": int(tweet.get("replyCount", 0) or 0),
                "reblogs_count": int(tweet.get("retweetCount", 0) or 0),
                "favourites_count": int(tweet.get("likeCount", 0) or 0),
                "media": None,
            })

        return posts, display_name