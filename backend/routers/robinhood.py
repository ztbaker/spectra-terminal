"""Robinhood integration — save client-side holdings to the portfolio DB.

All Robinhood API calls happen client-side in the Electron renderer process.
This router only persists the resulting holdings into the SQLite portfolio table.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import current_user_id
from database import get_conn

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class HoldingItem(BaseModel):
    ticker: str
    shares: float
    avg_cost: float


class SaveHoldingsRequest(BaseModel):
    holdings: list[HoldingItem]


class SaveHoldingsResponse(BaseModel):
    synced: int


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/portfolio/robinhood/save", response_model=SaveHoldingsResponse)
async def robinhood_save(
    body: SaveHoldingsRequest,
    user_id: int = Depends(current_user_id),
):
    """Upsert Robinhood holdings into the portfolio table."""
    count = 0

    with get_conn() as conn:
        for h in body.holdings:
            if h.shares <= 0:
                continue

            existing = conn.execute(
                "SELECT id FROM portfolio WHERE user_id = ? AND ticker = ?",
                (user_id, h.ticker),
            ).fetchone()

            if existing:
                conn.execute(
                    "UPDATE portfolio SET shares = ?, avg_cost = ? WHERE id = ?",
                    (h.shares, h.avg_cost, existing["id"]),
                )
            else:
                conn.execute(
                    "INSERT INTO portfolio (user_id, ticker, shares, avg_cost) VALUES (?, ?, ?, ?)",
                    (user_id, h.ticker, h.shares, h.avg_cost),
                )
            count += 1

        # Update sync timestamp
        conn.execute(
            """INSERT INTO robinhood_sync (user_id, synced_at)
               VALUES (?, datetime('now'))
               ON CONFLICT(user_id) DO UPDATE SET synced_at = datetime('now')""",
            (user_id,),
        )

    return SaveHoldingsResponse(synced=count)
