import asyncio

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import current_user_id
from database import get_conn
from providers.registry import get_provider

router = APIRouter()


class PortfolioItem(BaseModel):
    ticker: str
    shares: float
    avg_cost: float


class PortfolioRow(BaseModel):
    id: int
    ticker: str
    shares: float
    avg_cost: float
    added_at: str
    current_price: float | None = None
    market_value: float | None = None
    pnl: float | None = None
    pnl_pct: float | None = None


class PortfolioPerformance(BaseModel):
    holdings: list[PortfolioRow]
    total_cost: float
    total_value: float
    total_pnl: float
    total_pnl_pct: float


@router.get("/portfolio", response_model=list[PortfolioRow])
async def list_portfolio(user_id: int = Depends(current_user_id)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, ticker, shares, avg_cost, added_at FROM portfolio "
            "WHERE user_id = ? ORDER BY added_at DESC",
            (user_id,),
        ).fetchall()
    return [PortfolioRow(**dict(r)) for r in rows]


@router.post("/portfolio", response_model=PortfolioRow, status_code=201)
async def add_position(
    item: PortfolioItem,
    user_id: int = Depends(current_user_id),
):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO portfolio (user_id, ticker, shares, avg_cost) VALUES (?, ?, ?, ?)",
            (user_id, item.ticker.upper(), item.shares, item.avg_cost),
        )
        row = conn.execute(
            "SELECT id, ticker, shares, avg_cost, added_at FROM portfolio WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
    return PortfolioRow(**dict(row))


@router.delete("/portfolio/{item_id}", status_code=204)
async def delete_position(
    item_id: int,
    user_id: int = Depends(current_user_id),
):
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM portfolio WHERE id = ? AND user_id = ?",
            (item_id, user_id),
        )


@router.get("/portfolio/performance", response_model=PortfolioPerformance)
async def get_performance(user_id: int = Depends(current_user_id)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, ticker, shares, avg_cost, added_at FROM portfolio WHERE user_id = ?",
            (user_id,),
        ).fetchall()

    if not rows:
        return PortfolioPerformance(
            holdings=[], total_cost=0, total_value=0, total_pnl=0, total_pnl_pct=0
        )

    tickers = list({r["ticker"] for r in rows})
    provider = get_provider("yfinance")
    quotes: dict[str, dict] = {}
    if provider:
        quote_tasks = [provider.get_fast_quote_raw(t) for t in tickers]
        results = await asyncio.gather(*quote_tasks, return_exceptions=True)
        for t, q in zip(tickers, results):
            if not isinstance(q, Exception):
                quotes[t] = q

    holdings = []
    total_cost = 0.0
    total_value = 0.0

    for r in rows:
        ticker = r["ticker"]
        cost_basis = r["shares"] * r["avg_cost"]
        price = quotes.get(ticker, {}).get("price")
        mkt_val = r["shares"] * price if price else None
        pnl = (mkt_val - cost_basis) if mkt_val is not None else None
        pnl_pct = ((pnl / cost_basis) * 100) if pnl is not None and cost_basis else None

        total_cost += cost_basis
        if mkt_val:
            total_value += mkt_val

        holdings.append(PortfolioRow(
            id=r["id"],
            ticker=ticker,
            shares=r["shares"],
            avg_cost=r["avg_cost"],
            added_at=r["added_at"],
            current_price=price,
            market_value=mkt_val,
            pnl=round(pnl, 2) if pnl is not None else None,
            pnl_pct=round(pnl_pct, 2) if pnl_pct is not None else None,
        ))

    total_pnl = total_value - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost else 0

    return PortfolioPerformance(
        holdings=holdings,
        total_cost=round(total_cost, 2),
        total_value=round(total_value, 2),
        total_pnl=round(total_pnl, 2),
        total_pnl_pct=round(total_pnl_pct, 2),
    )
