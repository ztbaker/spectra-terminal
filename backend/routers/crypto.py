import asyncio
import math

from fastapi import APIRouter
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL

router = APIRouter()

CRYPTO_TICKERS: dict[str, str] = {
    "BTC-USD":  "BTC",
    "ETH-USD":  "ETH",
    "SOL-USD":  "SOL",
    "BNB-USD":  "BNB",
    "XRP-USD":  "XRP",
    "DOGE-USD": "DOGE",
    "ADA-USD":  "ADA",
    "AVAX-USD": "AVAX",
}

_CACHE_KEY = "crypto_all"


class CryptoAsset(BaseModel):
    ticker: str
    symbol: str
    name: str | None = None
    price: float | None = None
    change: float | None = None
    change_pct: float | None = None
    market_cap: float | None = None
    volume: float | None = None


class CryptoResponse(BaseModel):
    assets: list[CryptoAsset]
    cached: bool = False


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


async def _fetch_asset(ticker: str, symbol: str) -> CryptoAsset:
    provider = get_provider("yfinance")
    if not provider:
        return CryptoAsset(ticker=ticker, symbol=symbol)

    quote_task = asyncio.create_task(_safe_get_quote(ticker))
    info_task = asyncio.create_task(_safe_get_info(ticker))
    quote_data, info_data = await asyncio.gather(quote_task, info_task)

    price = _safe_float(quote_data.get("price"))
    prev_close = _safe_float(quote_data.get("prev_close"))

    market_cap = _safe_float(quote_data.get("market_cap")) or _safe_float(info_data.get("marketCap"))
    volume = _safe_float(quote_data.get("volume")) or _safe_float(
        info_data.get("volume24Hr") or info_data.get("volume") or info_data.get("regularMarketVolume")
    )
    name = info_data.get("longName") or info_data.get("shortName")

    change: float | None = None
    change_pct: float | None = None
    if price is not None and prev_close and prev_close != 0:
        change = round(price - prev_close, 8)
        change_pct = round((change / prev_close) * 100, 4)

    return CryptoAsset(
        ticker=ticker,
        symbol=symbol,
        name=name,
        price=price,
        change=change,
        change_pct=change_pct,
        market_cap=market_cap,
        volume=volume,
    )


async def _safe_get_quote(ticker: str) -> dict:
    try:
        provider = get_provider("yfinance")
        return await provider.get_fast_quote_raw(ticker) if provider else {}
    except Exception:
        return {}


async def _safe_get_info(ticker: str) -> dict:
    try:
        provider = get_provider("yfinance")
        return await provider.get_ticker_info_raw(ticker) if provider else {}
    except Exception:
        return {}


MEME_TICKERS: dict[str, str] = {
    "DOGE-USD":  "DOGE",
    "SHIB-USD":  "SHIB",
    "PEPE24478-USD": "PEPE",
    "BONK-USD":  "BONK",
    "FLOKI-USD": "FLOKI",
    "WIF-USD":   "WIF",
    "MEME-USD":  "MEME",
    "TURBO-USD": "TURBO",
    "MYRO-USD":  "MYRO",
    "BRETT-USD": "BRETT",
}

_MEME_CACHE_KEY = "meme_all"


@router.get("/crypto/meme", response_model=CryptoResponse)
async def get_meme_coins():
    cached = cache_get("price", _MEME_CACHE_KEY, TTL["price"])
    if cached:
        return CryptoResponse(**cached, cached=True)

    tasks = [
        _fetch_asset(ticker, symbol)
        for ticker, symbol in MEME_TICKERS.items()
    ]
    assets = list(await asyncio.gather(*tasks))

    payload = {"assets": [a.model_dump() for a in assets]}
    cache_set("price", _MEME_CACHE_KEY, payload)

    return CryptoResponse(assets=assets, cached=False)


@router.get("/crypto", response_model=CryptoResponse)
async def get_crypto():
    cached = cache_get("price", _CACHE_KEY, TTL["price"])
    if cached:
        return CryptoResponse(**cached, cached=True)

    tasks = [
        _fetch_asset(ticker, symbol)
        for ticker, symbol in CRYPTO_TICKERS.items()
    ]
    assets = list(await asyncio.gather(*tasks))

    payload = {"assets": [a.model_dump() for a in assets]}
    cache_set("price", _CACHE_KEY, payload)

    return CryptoResponse(assets=assets, cached=False)