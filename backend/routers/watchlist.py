import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import get_conn
from providers.registry import get_provider

router = APIRouter()


class WatchlistItem(BaseModel):
    ticker: str
    notes: str | None = None


class WatchlistRow(BaseModel):
    id: int
    ticker: str
    added_at: str
    notes: str | None


class WatchlistQuote(BaseModel):
    ticker: str
    company_name: str | None
    price: float | None
    change: float | None
    change_pct: float | None
    volume: int | None
    market_cap: float | None


@router.get("/watchlist", response_model=list[WatchlistRow])
async def list_watchlist():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM watchlist ORDER BY added_at DESC").fetchall()
    return [WatchlistRow(**dict(r)) for r in rows]


@router.post("/watchlist", response_model=WatchlistRow, status_code=201)
async def add_to_watchlist(item: WatchlistItem):
    ticker = item.ticker.upper()
    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO watchlist (ticker, notes) VALUES (?, ?)",
                (ticker, item.notes),
            )
            row = conn.execute("SELECT * FROM watchlist WHERE id = ?", (cur.lastrowid,)).fetchone()
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise HTTPException(status_code=409, detail=f"{ticker} already in watchlist")
            raise
    return WatchlistRow(**dict(row))


@router.delete("/watchlist/{ticker}", status_code=204)
async def remove_from_watchlist(ticker: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM watchlist WHERE ticker = ?", (ticker.upper(),))


@router.get("/watchlist/quotes", response_model=list[WatchlistQuote])
async def get_watchlist_quotes():
    with get_conn() as conn:
        rows = conn.execute("SELECT ticker FROM watchlist").fetchall()
    tickers = [r["ticker"] for r in rows]

    if not tickers:
        return []

    provider = get_provider("yfinance")
    if not provider:
        return []

    quotes = await provider.get_bulk_quotes(tickers)
    infos = await asyncio.gather(*[provider.get_ticker_info_raw(t) for t in tickers], return_exceptions=True)

    result = []
    for i, ticker in enumerate(tickers):
        q = quotes[i] if i < len(quotes) else None
        info = infos[i] if i < len(infos) else {}
        if isinstance(info, Exception):
            info = {}

        price = q.price if q else None
        prev = q.prev_close if q else None
        change = round(price - prev, 4) if price and prev else None
        change_pct = round((change / prev) * 100, 4) if change and prev else None

        result.append(WatchlistQuote(
            ticker=ticker,
            company_name=info.get("longName") or info.get("shortName"),
            price=price,
            change=change,
            change_pct=change_pct,
            volume=q.volume if q else None,
            market_cap=q.market_cap if q else None,
        ))

    return result
