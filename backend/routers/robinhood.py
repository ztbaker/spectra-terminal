"""Robinhood integration — sync holdings + historical portfolio equity."""

import asyncio
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import current_user_id
from database import get_conn

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Lazy-load robin_stocks so the rest of the app works even if it isn't installed
# ---------------------------------------------------------------------------

_rs: Any = None
_rs_available = True


def _get_rs():
    global _rs, _rs_available
    if _rs is not None:
        return _rs
    try:
        import robin_stocks.robinhood as rs
        _rs = rs
        return _rs
    except ImportError:
        _rs_available = False
        return None


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RobinhoodLogin(BaseModel):
    username: str  # Robinhood email
    password: str
    mfa_code: str | None = None


class RobinhoodSyncResult(BaseModel):
    synced: int
    holdings: list[dict]


class EquityPoint(BaseModel):
    date: str
    equity: float


class RobinhoodHistoryResponse(BaseModel):
    equity_history: list[EquityPoint]
    current_equity: float | None = None
    span: str


class RobinhoodStatus(BaseModel):
    connected: bool
    last_sync: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_sync(fn, *args, **kwargs):
    """Run a blocking robin_stocks call in a thread."""
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(None, lambda: fn(*args, **kwargs))


def _save_sync_timestamp(user_id: int):
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO robinhood_sync (user_id, synced_at)
               VALUES (?, datetime('now'))
               ON CONFLICT(user_id) DO UPDATE SET synced_at = datetime('now')""",
            (user_id,),
        )


def _get_last_sync(user_id: int) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT synced_at FROM robinhood_sync WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    return row["synced_at"] if row else None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/portfolio/robinhood/login")
async def robinhood_login(
    creds: RobinhoodLogin,
    user_id: int = Depends(current_user_id),
):
    """Authenticate with Robinhood. Returns success status.

    The session stays alive in-process for subsequent sync calls.
    """
    rs = _get_rs()
    if rs is None:
        raise HTTPException(
            status_code=501,
            detail="robin_stocks not installed on server — run: pip install robin_stocks",
        )

    try:
        login_kwargs: dict[str, Any] = {
            "username": creds.username,
            "password": creds.password,
            "store_session": False,
        }
        if creds.mfa_code:
            login_kwargs["mfa_code"] = creds.mfa_code

        result = await _run_sync(rs.login, **login_kwargs)

        if not result or "access_token" not in result:
            raise HTTPException(status_code=401, detail="Robinhood login failed — check credentials or MFA code")

        return {"status": "ok", "message": "Robinhood authenticated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Robinhood login error")
        raise HTTPException(status_code=401, detail=f"Login failed: {str(e)}")


@router.post("/portfolio/robinhood/sync", response_model=RobinhoodSyncResult)
async def robinhood_sync(user_id: int = Depends(current_user_id)):
    """Pull current Robinhood holdings and upsert into the portfolio table."""
    rs = _get_rs()
    if rs is None:
        raise HTTPException(status_code=501, detail="robin_stocks not installed")

    try:
        positions = await _run_sync(rs.build_holdings)
    except Exception as e:
        logger.exception("Failed to fetch Robinhood holdings")
        raise HTTPException(status_code=502, detail=f"Could not fetch holdings: {e}")

    if not positions:
        return RobinhoodSyncResult(synced=0, holdings=[])

    synced_holdings = []

    with get_conn() as conn:
        for ticker, data in positions.items():
            shares = float(data.get("quantity", 0))
            avg_cost = float(data.get("average_buy_price", 0))
            current_price = float(data.get("price", 0))
            equity = float(data.get("equity", 0))
            pct_change = float(data.get("percent_change", 0))

            if shares <= 0:
                continue

            # Upsert: update if ticker already exists for this user, else insert
            existing = conn.execute(
                "SELECT id FROM portfolio WHERE user_id = ? AND ticker = ?",
                (user_id, ticker),
            ).fetchone()

            if existing:
                conn.execute(
                    "UPDATE portfolio SET shares = ?, avg_cost = ? WHERE id = ?",
                    (shares, avg_cost, existing["id"]),
                )
            else:
                conn.execute(
                    "INSERT INTO portfolio (user_id, ticker, shares, avg_cost) VALUES (?, ?, ?, ?)",
                    (user_id, ticker, shares, avg_cost),
                )

            synced_holdings.append({
                "ticker": ticker,
                "shares": shares,
                "avg_cost": round(avg_cost, 2),
                "current_price": round(current_price, 2),
                "equity": round(equity, 2),
                "pct_change": round(pct_change, 2),
            })

    _save_sync_timestamp(user_id)

    return RobinhoodSyncResult(synced=len(synced_holdings), holdings=synced_holdings)


@router.get("/portfolio/robinhood/history", response_model=RobinhoodHistoryResponse)
async def robinhood_history(
    span: str = "year",
    user_id: int = Depends(current_user_id),
):
    """Fetch historical portfolio equity curve from Robinhood.

    span: day, week, month, 3month, year, 5year, all
    """
    rs = _get_rs()
    if rs is None:
        raise HTTPException(status_code=501, detail="robin_stocks not installed")

    valid_spans = {"day", "week", "month", "3month", "year", "5year", "all"}
    if span not in valid_spans:
        raise HTTPException(status_code=400, detail=f"Invalid span. Use: {', '.join(sorted(valid_spans))}")

    # Map span to robin_stocks interval/span params
    interval_map = {
        "day": ("5minute", "day"),
        "week": ("10minute", "week"),
        "month": ("day", "month"),
        "3month": ("day", "3month"),
        "year": ("day", "year"),
        "5year": ("week", "5year"),
        "all": ("week", "all"),
    }
    interval, rh_span = interval_map[span]

    try:
        historicals = await _run_sync(
            rs.get_portfolio_historicals,
            interval=interval,
            span=rh_span,
        )
    except Exception as e:
        logger.exception("Failed to fetch Robinhood history")
        raise HTTPException(status_code=502, detail=f"Could not fetch history: {e}")

    if not historicals:
        return RobinhoodHistoryResponse(equity_history=[], span=span)

    equity_points = []
    for point in historicals:
        try:
            eq = float(point.get("adjusted_close_equity") or point.get("close_equity") or 0)
            dt = point.get("begins_at", "")
            if eq > 0 and dt:
                equity_points.append(EquityPoint(
                    date=dt[:10] if len(dt) >= 10 else dt,
                    equity=round(eq, 2),
                ))
        except (ValueError, TypeError):
            continue

    current_equity = equity_points[-1].equity if equity_points else None

    return RobinhoodHistoryResponse(
        equity_history=equity_points,
        current_equity=current_equity,
        span=span,
    )


@router.get("/portfolio/robinhood/status", response_model=RobinhoodStatus)
async def robinhood_status(user_id: int = Depends(current_user_id)):
    """Check if Robinhood is connected and when last sync occurred."""
    rs = _get_rs()
    if rs is None:
        return RobinhoodStatus(connected=False, last_sync=None)

    # Check if we have an active session
    connected = False
    try:
        # robin_stocks stores auth in module-level state
        if hasattr(rs, 'get_linked_user_info'):
            info = await _run_sync(rs.get_linked_user_info)
            connected = info is not None
    except Exception:
        connected = False

    last_sync = _get_last_sync(user_id)
    return RobinhoodStatus(connected=connected, last_sync=last_sync)


@router.post("/portfolio/robinhood/logout")
async def robinhood_logout(user_id: int = Depends(current_user_id)):
    """Log out of Robinhood session."""
    rs = _get_rs()
    if rs is None:
        return {"status": "ok"}

    try:
        await _run_sync(rs.logout)
    except Exception:
        pass

    return {"status": "ok", "message": "Robinhood session cleared"}
