import asyncio
import re

from fastapi import APIRouter, Query
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL

router = APIRouter()

_POSITIVE = {"surge", "jump", "gain", "beat", "record", "upgrade", "buy", "strong", "growth", "profit"}
_NEGATIVE = {"fall", "drop", "decline", "miss", "downgrade", "sell", "weak", "loss", "cut", "crash"}


def _naive_sentiment(text: str) -> str:
    words = set(re.findall(r"\b\w+\b", text.lower()))
    pos = len(words & _POSITIVE)
    neg = len(words & _NEGATIVE)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def _vader_sentiment(text: str) -> tuple[str, float]:
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        analyzer = SentimentIntensityAnalyzer()
        scores = analyzer.polarity_scores(text)
        compound = scores["compound"]
        if compound >= 0.05:
            return "positive", round(compound, 4)
        elif compound <= -0.05:
            return "negative", round(compound, 4)
        else:
            return "neutral", round(compound, 4)
    except ImportError:
        return _naive_sentiment(text), 0.0


async def _fetch_yahoo_rss(ticker: str) -> list[dict]:
    from datetime import datetime, timezone
    import httpx
    import feedparser

    url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            feed = feedparser.parse(resp.text)
    except Exception:
        return []

    articles = []
    for entry in feed.entries:
        published_ts = 0
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            published_ts = int(datetime(*entry.published_parsed[:6], tzinfo=timezone.utc).timestamp())

        text = entry.get("title", "") + " " + entry.get("summary", "")
        sentiment, vader_score = _vader_sentiment(text)
        articles.append({
            "headline":    entry.get("title", ""),
            "source":      "Yahoo Finance",
            "url":         entry.get("link", ""),
            "datetime":    published_ts,
            "summary":     entry.get("summary", ""),
            "sentiment":   sentiment,
            "vader_score": vader_score,
        })
    return articles


async def _fetch_world_news(topic: str = "general", limit: int = 50) -> list[dict]:
    from datetime import datetime, timezone
    import httpx
    import feedparser

    sources_map = {
        "general": "https://news.google.com/rss",
        "business": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB",
        "technology": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRQTVdZU0FtVnVHZ0pWVXlnQVAB",
        "science": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB",
    }
    url = sources_map.get(topic, sources_map["general"])

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            feed = feedparser.parse(resp.text)
    except Exception:
        return []

    articles = []
    for entry in feed.entries[:limit]:
        published_ts = 0
        if getattr(entry, "published_parsed", None):
            try:
                published_ts = int(datetime(*entry.published_parsed[:6], tzinfo=timezone.utc).timestamp())
            except Exception:
                published_ts = 0

        src = entry.get("source")
        if isinstance(src, dict):
            source_name = src.get("title") or "Google News"
        elif isinstance(src, str) and src:
            source_name = src
        else:
            source_name = "Google News"

        text = entry.get("title", "") + " " + entry.get("summary", "")
        sentiment, vader_score = _vader_sentiment(text)
        articles.append({
            "headline":    entry.get("title", ""),
            "source":      source_name,
            "url":         entry.get("link", ""),
            "datetime":    published_ts,
            "summary":     entry.get("summary", ""),
            "sentiment":   sentiment,
            "vader_score": vader_score,
        })
    return articles


class NewsItem(BaseModel):
    headline: str
    source: str
    url: str
    datetime: int
    summary: str
    sentiment: str | None
    vader_score: float | None = None


class NewsResponse(BaseModel):
    ticker: str | None
    items: list[NewsItem]
    cached: bool = False


@router.get("/news", response_model=NewsResponse)
async def get_news(
    ticker: str = Query(default="MARKET"),
    limit: int = Query(default=50, le=100),
):
    ticker = ticker.upper()
    cache_key = f"{ticker}_news"
    cached = cache_get("news", cache_key, TTL["news"])
    if cached:
        return NewsResponse(ticker=ticker, items=cached, cached=True)

    finnhub_provider = get_provider("finnhub")
    finnhub_articles = []
    if finnhub_provider:
        try:
            fn_items = await finnhub_provider.get_news(ticker, limit=limit)
            for item in fn_items:
                text = item.headline + " " + item.summary
                sentiment, vader_score = _vader_sentiment(text)
                finnhub_articles.append({
                    "headline":    item.headline,
                    "source":      item.source,
                    "url":         item.url,
                    "datetime":    item.datetime,
                    "summary":     item.summary,
                    "sentiment":   sentiment,
                    "vader_score": vader_score,
                })
        except Exception:
            pass

    yahoo_articles = await _fetch_yahoo_rss(ticker) if ticker != "MARKET" else []

    seen_urls: set[str] = set()
    merged = []
    for art in finnhub_articles + yahoo_articles:
        url = art.get("url", "")
        if url and url in seen_urls:
            continue
        seen_urls.add(url)
        merged.append(art)

    merged.sort(key=lambda x: x.get("datetime", 0), reverse=True)
    articles = merged[:limit]

    cache_set("news", cache_key, articles)
    return NewsResponse(ticker=ticker, items=articles)


@router.get("/news/company", response_model=NewsResponse)
async def get_company_news(
    symbol: str = Query(..., min_length=1),
    limit: int = Query(default=50, le=100),
):
    return await get_news(ticker=symbol.upper(), limit=limit)


class ReaderArticle(BaseModel):
    url: str
    title: str | None = None
    author: str | None = None
    published: str | None = None
    site: str | None = None
    text: str
    word_count: int = 0
    error: str | None = None


_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

_GOOGLEBOT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}

# Pre-seeded consent cookies that bypass the most common consent walls.
# Google's own YES+cb format, plus generic flags many CMPs check.
_CONSENT_COOKIES = {
    "CONSENT":         "YES+cb.20210328-17-p0.en-GB+FX+917",
    "SOCS":            "CAISHAgBEhJnd3NfMjAyMzA2MTMtMF9SQzIaAmVuIAEaBgiAy_qkBg",
    "euconsent-v2":    "CPw-HIAPw-HIAAOACBENCrCsAP_AAH_AAAAAJPNf_X__b3_j-_5_f_t0eY1P9_7__-0zjhfdl-8N3f_X_L8X42M7vF36pq4KuR4Eu3LBIQdlHOHcTUmw6okVrzPsbk2cr7NKJ7LEmnMZO2dYGH9_n93T-ZKY7___f__z_v-v___9____7-3f3__5_3---_f_V_99zLv9____39nP___9v-_9_____4IQAAAAA",
    "OptanonAlertBoxClosed": "2024-01-01T00:00:00.000Z",
    "OptanonConsent":  "isGpcEnabled=0&datestamp=Mon+Jan+01+2024&version=202401.1.0&isIABGlobal=false&hosts=&consentId=00000000-0000-0000-0000-000000000000&interactionCount=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1",
}

_CONSENT_HOST_PATTERNS = (
    "consent.google",
    "consent.yahoo",
    "guce.",
    "/consent",
    "cookie-consent",
)

_CONSENT_BODY_MARKERS = (
    "before you continue to google",
    "accept cookies",
    "we and our partners store",
    "your privacy is important",
    "consent to the use of cookies",
)


def _looks_like_consent_wall(final_url: str, html: str) -> bool:
    lower_url = final_url.lower()
    if any(p in lower_url for p in _CONSENT_HOST_PATTERNS):
        return True
    snippet = html[:4000].lower()
    hits = sum(1 for m in _CONSENT_BODY_MARKERS if m in snippet)
    return hits >= 2


async def _fetch_with_headers(client_cls, url: str, headers: dict, cookies: dict | None = None):
    async with client_cls(
        timeout=15,
        follow_redirects=True,
        headers=headers,
        cookies=cookies or {},
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text, str(resp.url)


@router.get("/news/reader", response_model=ReaderArticle)
async def get_reader(url: str = Query(..., min_length=1)):
    import httpx
    import trafilatura
    from urllib.parse import urlparse

    cache_key = f"reader_{url}"
    cached = cache_get("news", cache_key, TTL["news"])
    if cached:
        return ReaderArticle(**cached)

    html: str | None = None
    final_url = url

    attempts = [
        ("browser",            _BROWSER_HEADERS, _CONSENT_COOKIES),
        ("browser-no-cookies", _BROWSER_HEADERS, None),
        ("googlebot",          _GOOGLEBOT_HEADERS, None),
    ]

    last_error: str | None = None
    for _label, hdrs, cookies in attempts:
        try:
            html, final_url = await _fetch_with_headers(httpx.AsyncClient, url, hdrs, cookies)
        except Exception as exc:
            last_error = f"Fetch failed: {exc.__class__.__name__}"
            continue
        if not _looks_like_consent_wall(final_url, html):
            break
        last_error = "Blocked by cookie consent wall"
        html = None

    if not html:
        return ReaderArticle(url=url, text="", error=last_error or "Fetch failed")

    try:
        import json as _json

        def _extract(favor_precision: bool):
            return trafilatura.extract(
                html,
                url=final_url,
                include_comments=False,
                include_tables=False,
                favor_precision=favor_precision,
                favor_recall=not favor_precision,
                output_format="json",
                with_metadata=True,
            )

        extracted = _extract(favor_precision=True)
        meta = _json.loads(extracted) if extracted else {}
        text = (meta.get("text") or "").strip()

        if not text:
            extracted = _extract(favor_precision=False)
            meta = _json.loads(extracted) if extracted else {}
            text = (meta.get("text") or "").strip()

        if not text:
            return ReaderArticle(
                url=final_url, text="",
                error="Could not extract readable content. Some sites block reader mode.",
            )
        site = meta.get("sitename") or urlparse(final_url).netloc
        payload = {
            "url":        final_url,
            "title":      meta.get("title"),
            "author":     meta.get("author"),
            "published":  meta.get("date"),
            "site":       site,
            "text":       text,
            "word_count": len(text.split()),
            "error":      None,
        }
        cache_set("news", cache_key, payload)
        return ReaderArticle(**payload)
    except Exception as exc:
        return ReaderArticle(
            url=final_url, text="",
            error=f"Extraction failed: {exc.__class__.__name__}",
        )


@router.get("/news/world", response_model=NewsResponse)
async def get_world_news(
    topic: str = Query(default="general"),
    limit: int = Query(default=50, le=100),
):
    cache_key = f"world_news_{topic}"
    cached = cache_get("news", cache_key, TTL["news"])
    if cached:
        return NewsResponse(ticker=None, items=cached, cached=True)

    articles = await _fetch_world_news(topic=topic, limit=limit)

    cache_set("news", cache_key, articles)
    return NewsResponse(ticker=None, items=articles)