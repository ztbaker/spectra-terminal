"""Robinhood integration — sync holdings + historical portfolio equity.

Uses robin_stocks directly, with monkey-patched input() to handle
interactive prompts in a server context.
"""

import asyncio
import builtins
import logging
import queue
import threading
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import current_user_id
from database import get_conn

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Lazy-load robin_stocks
# ---------------------------------------------------------------------------

_rs: Any = None


def _get_rs():
    global _rs
    if _rs is not None:
        return _rs
    try:
        import robin_stocks.robinhood as rs
        _rs = rs
        return _rs
    except ImportError:
        return None


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class RobinhoodLogin(BaseModel):
    username: str
    password: str
    mfa_code: str | None = None


class RobinhoodChallengeResponse(BaseModel):
    code: str


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
# Pending challenge state (keyed by user_id)
# When rs.login() blocks on input(), we store the queue here so the
# /challenge endpoint can feed the code back.
# ---------------------------------------------------------------------------

_pending_logins: dict[int, dict] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_sync(fn, *args, **kwargs):
    """Run a blocking call in a thread."""
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


def _do_login(username: str, password: str, mfa_code: str | None,
              input_queue: queue.Queue, result_holder: dict, log_lines: list):
    """Run rs.login() in a thread with monkey-patched input() and print().

    If login needs an SMS/email code, input() will block. The main thread
    can detect this via result_holder["waiting_for_input"] and feed the
    code via input_queue.put(code).
    """
    rs = _get_rs()
    original_input = builtins.input
    original_print = builtins.print

    def patched_input(prompt=""):
        log_lines.append(f"INPUT_PROMPT: {prompt}")
        logger.info("robin_stocks wants input: %s", prompt)
        result_holder["waiting_for_input"] = True
        result_holder["input_prompt"] = prompt
        # Block until the code is provided via the queue
        try:
            code = input_queue.get(timeout=300)  # 5 min timeout
            logger.info("Received input response (length: %d)", len(code))
            return code
        except queue.Empty:
            raise TimeoutError("Timed out waiting for verification code")

    def patched_print(*args, **kwargs):
        msg = " ".join(str(a) for a in args)
        log_lines.append(msg)
        logger.info("robin_stocks: %s", msg)

    try:
        builtins.input = patched_input
        builtins.print = patched_print

        login_result = rs.login(
            username=username,
            password=password,
            mfa_code=mfa_code,
            store_session=True,
        )

        result_holder["result"] = login_result
        result_holder["success"] = login_result is not None and "access_token" in (login_result or {})
        logger.info("Login completed — success=%s, keys=%s",
                     result_holder["success"],
                     list(login_result.keys()) if login_result else None)
    except Exception as e:
        result_holder["error"] = str(e)
        logger.exception("Login thread error")
    finally:
        builtins.input = original_input
        builtins.print = original_print
        result_holder["done"] = True


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/portfolio/robinhood/login")
async def robinhood_login(
    creds: RobinhoodLogin,
    user_id: int = Depends(current_user_id),
):
    """Authenticate with Robinhood.

    Uses robin_stocks.login() directly. If Robinhood requires an SMS/email
    code, this returns {"status": "challenge"} and the login thread blocks
    waiting. Call /portfolio/robinhood/challenge with the code to unblock it.

    Push-to-app verification is handled automatically by robin_stocks.
    """
    rs = _get_rs()
    if rs is None:
        raise HTTPException(
            status_code=501,
            detail="robin_stocks not installed — run: pip install robin_stocks",
        )

    # Clean up any stale pending login for this user
    old = _pending_logins.pop(user_id, None)

    input_q: queue.Queue = queue.Queue()
    result_holder: dict = {
        "done": False,
        "success": False,
        "result": None,
        "error": None,
        "waiting_for_input": False,
        "input_prompt": "",
    }
    log_lines: list = []

    # Start login in a background thread
    thread = threading.Thread(
        target=_do_login,
        args=(creds.username, creds.password, creds.mfa_code, input_q, result_holder, log_lines),
        daemon=True,
    )
    thread.start()

    # Poll: wait for either completion, input prompt, or timeout
    start = time.time()
    timeout = 120  # 2 minutes for push-to-app approval

    while time.time() - start < timeout:
        await asyncio.sleep(1)

        if result_holder["done"]:
            if result_holder["error"]:
                raise HTTPException(status_code=400, detail=f"RH_LOGIN_ERROR: {result_holder['error']}")
            if result_holder["success"]:
                return {"status": "ok", "message": "Robinhood authenticated"}
            # Login returned None — failed
            raise HTTPException(
                status_code=400,
                detail="RH_LOGIN_FAILED: " + " | ".join(log_lines[-3:]),
            )

        if result_holder["waiting_for_input"]:
            # Login is blocked waiting for a verification code
            prompt = result_holder["input_prompt"].lower()
            challenge_type = "sms" if "sms" in prompt else "email" if "email" in prompt else "code"
            _pending_logins[user_id] = {
                "input_queue": input_q,
                "result_holder": result_holder,
                "thread": thread,
                "log_lines": log_lines,
            }
            return {
                "status": "challenge",
                "challenge_type": challenge_type,
                "message": result_holder["input_prompt"] or f"Enter verification code",
            }

    # Timeout
    raise HTTPException(
        status_code=408,
        detail="Login timed out — if using push notification, approve in your Robinhood app and try again",
    )


@router.post("/portfolio/robinhood/challenge")
async def robinhood_challenge(
    body: RobinhoodChallengeResponse,
    user_id: int = Depends(current_user_id),
):
    """Submit SMS/email verification code to complete a pending login."""
    pending = _pending_logins.pop(user_id, None)
    if not pending:
        raise HTTPException(status_code=400, detail="No pending login — connect again")

    input_q: queue.Queue = pending["input_queue"]
    result_holder: dict = pending["result_holder"]
    thread: threading.Thread = pending["thread"]
    log_lines: list = pending["log_lines"]

    # Feed the code to the blocked input() call
    input_q.put(body.code)

    # Wait for login to complete
    start = time.time()
    while time.time() - start < 60:
        await asyncio.sleep(1)
        if result_holder["done"]:
            if result_holder["error"]:
                raise HTTPException(status_code=400, detail=f"RH_LOGIN_ERROR: {result_holder['error']}")
            if result_holder["success"]:
                return {"status": "ok", "message": "Robinhood authenticated"}
            raise HTTPException(
                status_code=400,
                detail="RH_VERIFY_FAILED: " + " | ".join(log_lines[-3:]),
            )

    raise HTTPException(status_code=408, detail="Challenge verification timed out")


@router.get("/portfolio/robinhood/debug")
async def robinhood_debug(user_id: int = Depends(current_user_id)):
    """Diagnostic endpoint — returns full session state."""
    info: dict[str, Any] = {"user_id": user_id}
    try:
        import robin_stocks.robinhood.helper as rh_helper
        info["LOGGED_IN"] = rh_helper.LOGGED_IN
        info["has_auth_header"] = bool(rh_helper.SESSION.headers.get("Authorization"))
        info["auth_header_prefix"] = str(rh_helper.SESSION.headers.get("Authorization", ""))[:20] + "..."
        info["session_headers"] = list(rh_helper.SESSION.headers.keys())
    except Exception as e:
        info["helper_error"] = str(e)

    try:
        rs = _get_rs()
        if rs:
            # Try a simple API call
            from robin_stocks.robinhood.helper import request_get
            from robin_stocks.robinhood.urls import positions_url
            res = request_get(positions_url(), "pagination", {"nonzero": "true"}, jsonify_data=False)
            if hasattr(res, "status_code"):
                info["positions_status"] = res.status_code
                if res.status_code != 200:
                    info["positions_body"] = res.text[:200]
            else:
                info["positions_result"] = "got data" if res else "None"
    except Exception as e:
        info["positions_error"] = str(e)

    # Check pickle file
    import os
    pickle_path = os.path.expanduser("~/.tokens/robinhood.pickle")
    info["pickle_exists"] = os.path.isfile(pickle_path)

    return info


@router.post("/portfolio/robinhood/sync", response_model=RobinhoodSyncResult)
async def robinhood_sync(user_id: int = Depends(current_user_id)):
    """Pull current Robinhood holdings and upsert into the portfolio table."""
    rs = _get_rs()
    if rs is None:
        raise HTTPException(status_code=501, detail="robin_stocks not installed")

    try:
        import robin_stocks.robinhood.helper as rh_helper
        logged_in = rh_helper.LOGGED_IN
        has_auth = bool(rh_helper.SESSION.headers.get("Authorization"))
        logger.info("Sync — LOGGED_IN=%s, auth_header=%s", logged_in, has_auth)
        if not logged_in:
            raise HTTPException(
                status_code=400,
                detail=f"RH_NOT_CONNECTED: LOGGED_IN={logged_in}, has_auth={has_auth}. Connect Robinhood first.",
            )
    except ImportError:
        pass
    except HTTPException:
        raise

    try:
        positions = await _run_sync(rs.build_holdings)
    except Exception as e:
        logger.exception("Failed to fetch Robinhood holdings")
        err_msg = str(e)
        raise HTTPException(
            status_code=400,
            detail=f"RH_SYNC_ERROR: {err_msg}",
        )

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
    """Fetch historical portfolio equity curve from Robinhood."""
    rs = _get_rs()
    if rs is None:
        raise HTTPException(status_code=501, detail="robin_stocks not installed")

    valid_spans = {"day", "week", "month", "3month", "year", "5year", "all"}
    if span not in valid_spans:
        raise HTTPException(status_code=400, detail=f"Invalid span. Use: {', '.join(sorted(valid_spans))}")

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

    connected = False
    try:
        import robin_stocks.robinhood.helper as rh_helper
        connected = rh_helper.LOGGED_IN and bool(rh_helper.SESSION.headers.get("Authorization"))
    except Exception:
        pass

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

    _pending_logins.pop(user_id, None)
    return {"status": "ok", "message": "Robinhood session cleared"}
