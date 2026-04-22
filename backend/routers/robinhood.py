"""Robinhood integration — sync holdings + historical portfolio equity.

Uses robin_stocks internally but wraps the login flow to work in a
server context (no interactive input() calls).
"""

import asyncio
import logging
import os
import pickle
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
# Request / response models
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
# In-memory state for pending challenges (keyed by user_id)
# ---------------------------------------------------------------------------

_pending_challenges: dict[int, dict] = {}


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


def _activate_session(data: dict, update_session=None, set_login_state=None):
    """Set robin_stocks session state from a login response."""
    if update_session is None:
        from robin_stocks.robinhood.authentication import update_session, set_login_state
    token = f"{data['token_type']} {data['access_token']}"
    update_session("Authorization", token)
    set_login_state(True)
    # Double-check: also set directly on the helper module
    import robin_stocks.robinhood.helper as rh_helper
    rh_helper.SESSION.headers["Authorization"] = token
    rh_helper.LOGGED_IN = True
    logger.info("Robinhood session activated — token type: %s", data.get("token_type"))


def _server_login(username: str, password: str, mfa_code: str | None = None) -> dict:
    """Login to Robinhood without interactive input() calls.

    Handles three scenarios:
    1. MFA code provided → direct login with code
    2. Device verification (push to app) → polls until approved
    3. SMS/email challenge → returns challenge info for two-step flow

    Returns dict with either:
      - {"access_token": ...} on success
      - {"challenge": "sms"|"email"|"prompt", "challenge_id": ..., "workflow_id": ...}
        when user action is needed
    """
    rs = _get_rs()
    from robin_stocks.robinhood.helper import request_post, request_get
    from robin_stocks.robinhood.urls import login_url
    from robin_stocks.robinhood.authentication import generate_device_token

    device_token = generate_device_token()

    login_payload = {
        "client_id": "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS",
        "expires_in": 86400,
        "grant_type": "password",
        "password": password,
        "scope": "internal",
        "username": username,
        "device_token": device_token,
        "try_passkeys": False,
        "token_request_path": "/login",
        "create_read_only_secondary_token": True,
    }

    if mfa_code:
        login_payload["mfa_code"] = mfa_code

    data = request_post(login_url(), login_payload)

    if not data:
        raise ValueError("No response from Robinhood")

    # Direct success (e.g. with MFA code)
    if "access_token" in data:
        _activate_session(data, update_session, set_login_state)
        return data

    # MFA required (app-based TOTP)
    if "mfa_required" in data and data.get("mfa_required"):
        return {"challenge": "mfa", "mfa_type": data.get("mfa_type", "app")}

    # Verification workflow (push/sms/email)
    if "verification_workflow" in data:
        workflow_id = data["verification_workflow"]["id"]

        # Start the pathfinder flow
        pathfinder_url = "https://api.robinhood.com/pathfinder/user_machine/"
        machine_payload = {
            "device_id": device_token,
            "flow": "suv",
            "input": {"workflow_id": workflow_id},
        }
        machine_data = request_post(url=pathfinder_url, payload=machine_payload, json=True)

        # Extract machine ID
        machine_id = None
        if machine_data and "id" in machine_data:
            machine_id = machine_data["id"]
        elif machine_data:
            # Try to find it in nested structure
            from robin_stocks.robinhood.authentication import _get_sherrif_id
            try:
                machine_id = _get_sherrif_id(machine_data)
            except Exception:
                pass

        if not machine_id:
            raise ValueError("Could not start verification workflow")

        inquiries_url = f"https://api.robinhood.com/pathfinder/inquiries/{machine_id}/user_view/"

        # Poll for the challenge type
        start_time = time.time()
        while time.time() - start_time < 30:
            time.sleep(3)
            inquiries_response = request_get(inquiries_url)

            if not inquiries_response:
                continue

            if "context" in inquiries_response and "sheriff_challenge" in inquiries_response.get("context", {}):
                challenge = inquiries_response["context"]["sheriff_challenge"]
                challenge_type = challenge.get("type", "")
                challenge_id = challenge.get("id", "")
                challenge_status = challenge.get("status", "")

                if challenge_type == "prompt":
                    # Push notification — poll until approved
                    prompt_url = f"https://api.robinhood.com/push/{challenge_id}/get_prompts_status/"
                    poll_start = time.time()
                    while time.time() - poll_start < 90:
                        time.sleep(5)
                        prompt_status = request_get(url=prompt_url)
                        if prompt_status and prompt_status.get("challenge_status") == "validated":
                            # Re-attempt login
                            data2 = request_post(login_url(), login_payload)
                            if data2 and "access_token" in data2:
                                _activate_session(data2)
                                return data2
                    raise ValueError("Push notification approval timed out — approve in your Robinhood app")

                elif challenge_type in ("sms", "email") and challenge_status == "issued":
                    # Need user to enter a code — return challenge info
                    return {
                        "challenge": challenge_type,
                        "challenge_id": challenge_id,
                        "machine_id": machine_id,
                        "device_token": device_token,
                        "login_payload": login_payload,
                    }

                elif challenge_status == "validated":
                    # Already validated, retry login
                    data2 = request_post(login_url(), login_payload)
                    if data2 and "access_token" in data2:
                        _activate_session(data2)
                        return data2

        raise ValueError("Verification workflow timed out")

    # Unknown response
    detail = data.get("detail", str(data))
    raise ValueError(f"Login failed: {detail}")


def _respond_to_challenge(challenge_id: str, code: str, device_token: str, login_payload: dict) -> dict:
    """Submit an SMS/email verification code and complete login."""
    rs = _get_rs()
    from robin_stocks.robinhood.helper import request_post
    from robin_stocks.robinhood.urls import login_url

    challenge_url = f"https://api.robinhood.com/challenge/{challenge_id}/respond/"
    challenge_response = request_post(url=challenge_url, payload={"response": code})

    if not challenge_response or challenge_response.get("status") != "validated":
        raise ValueError("Invalid verification code")

    # Re-attempt login after challenge validated
    data = request_post(login_url(), login_payload)
    if data and "access_token" in data:
        _activate_session(data)
        return data

    raise ValueError("Login failed after verification")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/portfolio/robinhood/login")
async def robinhood_login(
    creds: RobinhoodLogin,
    user_id: int = Depends(current_user_id),
):
    """Authenticate with Robinhood.

    Step 1: Call with username + password (and optional mfa_code for TOTP apps).
    If Robinhood requires SMS/email verification, returns:
      {"status": "challenge", "challenge_type": "sms"|"email"}
    Then call /portfolio/robinhood/challenge with the code.

    If using push notification (Robinhood app), this endpoint polls up to 90s
    for approval, then completes automatically.
    """
    rs = _get_rs()
    if rs is None:
        raise HTTPException(
            status_code=501,
            detail="robin_stocks not installed — run: pip install robin_stocks",
        )

    try:
        result = await _run_sync(
            _server_login, creds.username, creds.password, creds.mfa_code
        )
    except Exception as e:
        logger.exception("Robinhood login error")
        raise HTTPException(status_code=401, detail=str(e))

    if "access_token" in result:
        return {"status": "ok", "message": "Robinhood authenticated"}

    if "challenge" in result:
        challenge_type = result["challenge"]

        if challenge_type == "mfa":
            return {
                "status": "mfa_required",
                "mfa_type": result.get("mfa_type", "app"),
                "message": "Enter your authenticator app code",
            }

        # SMS or email challenge — store state for step 2
        _pending_challenges[user_id] = result
        return {
            "status": "challenge",
            "challenge_type": challenge_type,
            "message": f"Enter the verification code sent via {challenge_type}",
        }

    raise HTTPException(status_code=401, detail="Unexpected login response")


@router.post("/portfolio/robinhood/challenge")
async def robinhood_challenge(
    body: RobinhoodChallengeResponse,
    user_id: int = Depends(current_user_id),
):
    """Step 2: Submit SMS/email verification code to complete login."""
    rs = _get_rs()
    if rs is None:
        raise HTTPException(status_code=501, detail="robin_stocks not installed")

    challenge_data = _pending_challenges.pop(user_id, None)
    if not challenge_data:
        raise HTTPException(status_code=400, detail="No pending challenge — login again")

    try:
        result = await _run_sync(
            _respond_to_challenge,
            challenge_data["challenge_id"],
            body.code,
            challenge_data["device_token"],
            challenge_data["login_payload"],
        )
    except Exception as e:
        logger.exception("Challenge verification error")
        raise HTTPException(status_code=401, detail=str(e))

    if "access_token" in result:
        return {"status": "ok", "message": "Robinhood authenticated"}

    raise HTTPException(status_code=401, detail="Verification failed")


@router.post("/portfolio/robinhood/sync", response_model=RobinhoodSyncResult)
async def robinhood_sync(user_id: int = Depends(current_user_id)):
    """Pull current Robinhood holdings and upsert into the portfolio table."""
    rs = _get_rs()
    if rs is None:
        raise HTTPException(status_code=501, detail="robin_stocks not installed")

    # Verify login state before calling build_holdings
    try:
        from robin_stocks.robinhood import helper as rh_helper
        if not rh_helper.LOGGED_IN:
            raise HTTPException(
                status_code=401,
                detail="Not logged into Robinhood — connect first",
            )
    except ImportError:
        pass

    try:
        positions = await _run_sync(rs.build_holdings)
    except Exception as e:
        logger.exception("Failed to fetch Robinhood holdings")
        err_msg = str(e)
        if "401" in err_msg or "Unauthorized" in err_msg:
            raise HTTPException(
                status_code=401,
                detail="Robinhood session expired — reconnect",
            )
        raise HTTPException(status_code=502, detail=f"Could not fetch holdings: {err_msg}")

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
    """Fetch historical portfolio equity curve from Robinhood.

    span: day, week, month, 3month, year, 5year, all
    """
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
        from robin_stocks.robinhood.authentication import LOGIN_STATE
        # robin_stocks stores login state in a module-level variable
        connected = bool(getattr(rs.authentication, 'LOGGED_IN', False))
        if not connected:
            # Fallback: check if session has auth header
            from robin_stocks.robinhood.helper import request_get
            from robin_stocks.robinhood.urls import positions_url
            res = await _run_sync(
                request_get, positions_url(), "pagination",
                {"nonzero": "true"},
            )
            connected = res is not None
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

    _pending_challenges.pop(user_id, None)
    return {"status": "ok", "message": "Robinhood session cleared"}
