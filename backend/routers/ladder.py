from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from providers.registry import get_provider
from analytics.ladder import compute_ladder
from cache import cache_get, cache_set

router = APIRouter()


class LadderLevelModel(BaseModel):
    price: float
    volume: int
    side: str


class LadderResponse(BaseModel):
    ticker: str
    current_price: float
    bid: float | None = None
    ask: float | None = None
    bid_size: int | None = None
    ask_size: int | None = None
    tick: float
    lookback_minutes: int
    levels: list[LadderLevelModel]
    cached: bool = False


@router.get("/ladder/{ticker}", response_model=LadderResponse)
async def get_ladder(
    ticker: str,
    levels: int = Query(20, ge=5, le=50),
    lookback: int = Query(60, ge=5, le=390),
):
    ticker = ticker.upper()
    cache_key = f'ladder_{ticker}_{levels}_{lookback}'
    cached = cache_get('chart', cache_key, 5)
    if cached:
        return LadderResponse(**cached, cached=True)

    provider = get_provider('yfinance')
    if provider is None:
        raise HTTPException(status_code=503, detail='yfinance provider unavailable')

    quote = await provider.get_fast_quote_raw(ticker)
    current = quote.get('price')
    if current is None:
        raise HTTPException(status_code=404, detail=f'no price for {ticker}')

    period = '1d' if lookback <= 390 else '5d'
    bars = await provider.get_historical(ticker, period=period, interval='1m')
    if bars is None or bars.empty:
        raise HTTPException(status_code=404, detail=f'no intraday data for {ticker}')
    bars = bars.tail(lookback)

    ladder, tick = compute_ladder(bars, float(current), levels=levels)

    info = await provider.get_extended_quote_raw(ticker)
    payload = {
        'ticker': ticker,
        'current_price': float(current),
        'bid': info.get('bid'),
        'ask': info.get('ask'),
        'bid_size': None,
        'ask_size': None,
        'tick': tick,
        'lookback_minutes': lookback,
        'levels': [l.__dict__ for l in ladder],
    }
    cache_set('chart', cache_key, payload)
    return LadderResponse(**payload)