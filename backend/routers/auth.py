import logging
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr, Field

from auth import (
    current_token,
    current_user_id,
    hash_password,
    new_token,
    verify_password,
)
from config import settings
from database import get_conn
from email_svc import (
    EmailSendError,
    render_reset_email,
    render_verify_email,
    send_email,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

USERNAME_RE = re.compile(r"^[A-Za-z0-9_\-.]{3,32}$")
VERIFY_TTL = timedelta(hours=24)
RESET_TTL = timedelta(hours=1)


# ─── Models ────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    email: EmailStr
    password: str = Field(min_length=6, max_length=256)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=256)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=6, max_length=256)


class VerifyRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class AuthResponse(BaseModel):
    token: str
    user_id: int
    username: str
    email_verified: bool


class UserInfo(BaseModel):
    user_id: int
    username: str
    email: str | None = None
    email_verified: bool = False


# ─── Helpers ───────────────────────────────────────────────────────────────

def _normalize_username(raw: str) -> str:
    username = raw.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(
            status_code=400,
            detail="username must be 3-32 chars: letters, digits, underscore, dash, or dot",
        )
    return username


def _now_plus(td: timedelta) -> str:
    return (datetime.now(timezone.utc) + td).isoformat()


def _insert_email_token(conn, user_id: int, kind: str, ttl: timedelta) -> str:
    token = new_token()
    conn.execute(
        "INSERT INTO email_tokens (token, user_id, kind, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, kind, _now_plus(ttl)),
    )
    return token


def _verify_link(token: str) -> str:
    return f"{settings.PUBLIC_BASE_URL}/api/auth/verify?token={token}"


def _reset_link(token: str) -> str:
    return f"{settings.PUBLIC_BASE_URL}/api/auth/reset-password?token={token}"


def _safe_send(to: str, subject: str, html: str) -> None:
    """Send email; log but never surface errors (avoid leaking deliverability issues)."""
    try:
        send_email(to, subject, html)
    except EmailSendError as exc:
        log.warning("email send failed to=%s subject=%s err=%s", to, subject, exc)


# ─── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthResponse)
async def signup(req: SignupRequest):
    username = _normalize_username(req.username)
    pw_hash = hash_password(req.password)
    email = req.email.strip().lower()

    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
                (username, pw_hash, email),
            )
        except Exception as exc:
            msg = str(exc)
            if "users.email" in msg or "ix_users_email_nocase" in msg:
                raise HTTPException(status_code=409, detail="email already registered")
            if "UNIQUE" in msg and "username" in msg.lower():
                raise HTTPException(status_code=409, detail="username already taken")
            if "UNIQUE" in msg:
                raise HTTPException(status_code=409, detail="username or email already taken")
            raise
        user_id = cur.lastrowid
        session_token = new_token()
        conn.execute(
            "INSERT INTO sessions (token, user_id) VALUES (?, ?)",
            (session_token, user_id),
        )
        verify_token = _insert_email_token(conn, user_id, "verify", VERIFY_TTL)

    _safe_send(
        email,
        "Confirm your Spectra Terminal email",
        render_verify_email(username, _verify_link(verify_token)),
    )

    return AuthResponse(
        token=session_token,
        user_id=user_id,
        username=username,
        email_verified=False,
    )


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    username = req.username.strip()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash, email_verified FROM users "
            "WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
        if not row or not verify_password(req.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="invalid username or password")
        token = new_token()
        conn.execute(
            "INSERT INTO sessions (token, user_id) VALUES (?, ?)",
            (token, row["id"]),
        )
    return AuthResponse(
        token=token,
        user_id=row["id"],
        username=row["username"],
        email_verified=bool(row["email_verified"]),
    )


@router.post("/logout", status_code=204)
async def logout(
    _user_id: int = Depends(current_user_id),
    token: str = Depends(current_token),
):
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


@router.get("/me", response_model=UserInfo)
async def me(user_id: int = Depends(current_user_id)):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, email, email_verified FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="user not found")
    return UserInfo(
        user_id=row["id"],
        username=row["username"],
        email=row["email"],
        email_verified=bool(row["email_verified"]),
    )


# ─── Verify email (browser click from email) ───────────────────────────────

_VERIFY_OK_HTML = """<!doctype html><html><body style="background:#0a0a0a;color:#ff9900;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;padding:40px;border:1px solid #ff9900;box-shadow:0 0 30px rgba(255,153,0,.3);">
  <div style="font-size:20px;font-weight:700;letter-spacing:.25em;margin-bottom:8px;">SPECTRA TERMINAL</div>
  <div style="font-size:13px;letter-spacing:.1em;color:#cc7700;margin-bottom:20px;">EMAIL VERIFIED</div>
  <div style="font-size:13px;">You can return to the app.</div>
</div></body></html>"""

_VERIFY_BAD_HTML = """<!doctype html><html><body style="background:#0a0a0a;color:#ff3333;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;padding:40px;border:1px solid #ff3333;">
  <div style="font-size:20px;font-weight:700;letter-spacing:.25em;margin-bottom:8px;color:#ff9900;">SPECTRA TERMINAL</div>
  <div style="font-size:13px;">This verification link is invalid or expired.</div>
</div></body></html>"""


def _consume_token(conn, token: str, kind: str) -> int | None:
    row = conn.execute(
        "SELECT user_id, expires_at FROM email_tokens WHERE token = ? AND kind = ?",
        (token, kind),
    ).fetchone()
    if not row:
        return None
    try:
        expires = datetime.fromisoformat(row["expires_at"])
    except ValueError:
        return None
    if expires <= datetime.now(timezone.utc):
        conn.execute("DELETE FROM email_tokens WHERE token = ?", (token,))
        return None
    conn.execute("DELETE FROM email_tokens WHERE token = ?", (token,))
    return int(row["user_id"])


@router.get("/verify", response_class=HTMLResponse)
async def verify_from_email(token: str):
    with get_conn() as conn:
        user_id = _consume_token(conn, token, "verify")
        if not user_id:
            return HTMLResponse(_VERIFY_BAD_HTML, status_code=400)
        conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))
    return HTMLResponse(_VERIFY_OK_HTML)


@router.post("/verify", response_model=UserInfo)
async def verify_from_api(req: VerifyRequest):
    with get_conn() as conn:
        user_id = _consume_token(conn, req.token, "verify")
        if not user_id:
            raise HTTPException(status_code=400, detail="invalid or expired verification link")
        conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))
        row = conn.execute(
            "SELECT id, username, email, email_verified FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return UserInfo(
        user_id=row["id"],
        username=row["username"],
        email=row["email"],
        email_verified=bool(row["email_verified"]),
    )


@router.post("/resend-verification", status_code=204)
async def resend_verification(user_id: int = Depends(current_user_id)):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT username, email, email_verified FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row or not row["email"]:
            raise HTTPException(status_code=400, detail="no email on file")
        if row["email_verified"]:
            raise HTTPException(status_code=400, detail="email already verified")
        conn.execute(
            "DELETE FROM email_tokens WHERE user_id = ? AND kind = 'verify'",
            (user_id,),
        )
        token = _insert_email_token(conn, user_id, "verify", VERIFY_TTL)
        email = row["email"]
        username = row["username"]
    _safe_send(
        email,
        "Confirm your Spectra Terminal email",
        render_verify_email(username, _verify_link(token)),
    )


# ─── Forgot password ───────────────────────────────────────────────────────

@router.post("/forgot-password", status_code=204)
async def forgot_password(req: ForgotPasswordRequest):
    """Always returns 204 to avoid leaking whether an email exists."""
    email = req.email.strip().lower()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, email FROM users WHERE email = ? COLLATE NOCASE",
            (email,),
        ).fetchone()
        if not row:
            return
        conn.execute(
            "DELETE FROM email_tokens WHERE user_id = ? AND kind = 'reset'",
            (row["id"],),
        )
        token = _insert_email_token(conn, row["id"], "reset", RESET_TTL)
        username = row["username"]
        to_email = row["email"]
    _safe_send(
        to_email,
        "Reset your Spectra Terminal password",
        render_reset_email(username, _reset_link(token)),
    )


# Browser-facing reset page (simple single-file form, no auth).
@router.get("/reset-password", response_class=HTMLResponse)
async def reset_password_page(token: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT expires_at FROM email_tokens WHERE token = ? AND kind = 'reset'",
            (token,),
        ).fetchone()
    invalid = True
    if row:
        try:
            expires = datetime.fromisoformat(row["expires_at"])
            invalid = expires <= datetime.now(timezone.utc)
        except ValueError:
            invalid = True

    if invalid:
        return HTMLResponse(
            """<!doctype html><html><body style="background:#0a0a0a;color:#ff3333;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;padding:40px;border:1px solid #ff3333;">
  <div style="font-size:20px;font-weight:700;letter-spacing:.25em;margin-bottom:8px;color:#ff9900;">SPECTRA TERMINAL</div>
  <div style="font-size:13px;">This password reset link is invalid or expired.</div>
</div></body></html>""",
            status_code=400,
        )

    return HTMLResponse(
        f"""<!doctype html><html><body style="background:#0a0a0a;color:#ff9900;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<form id="f" style="text-align:center;padding:40px;border:1px solid #ff9900;width:360px;box-shadow:0 0 30px rgba(255,153,0,.3);">
  <div style="font-size:20px;font-weight:700;letter-spacing:.25em;margin-bottom:8px;">SPECTRA TERMINAL</div>
  <div style="font-size:12px;letter-spacing:.15em;color:#cc7700;margin-bottom:24px;">RESET PASSWORD</div>
  <input id="pw" type="password" placeholder="New password" minlength="6" required style="width:100%;padding:8px;background:transparent;border:none;border-bottom:1px solid #ff9900;color:#ff9900;font-size:14px;margin-bottom:14px;outline:none;"/>
  <input id="pw2" type="password" placeholder="Confirm password" minlength="6" required style="width:100%;padding:8px;background:transparent;border:none;border-bottom:1px solid #ff9900;color:#ff9900;font-size:14px;margin-bottom:20px;outline:none;"/>
  <button type="submit" style="width:100%;padding:9px;background:#ff9900;color:#000;border:none;font-weight:700;letter-spacing:.2em;font-size:12px;cursor:pointer;">UPDATE PASSWORD</button>
  <div id="msg" style="margin-top:16px;font-size:12px;min-height:18px;"></div>
</form>
<script>
const form = document.getElementById('f');
const msg = document.getElementById('msg');
form.addEventListener('submit', async (e) => {{
  e.preventDefault();
  msg.textContent = ''; msg.style.color = '#ff3333';
  const pw = document.getElementById('pw').value;
  const pw2 = document.getElementById('pw2').value;
  if (pw !== pw2) {{ msg.textContent = 'Passwords do not match'; return; }}
  if (pw.length < 6) {{ msg.textContent = 'At least 6 characters'; return; }}
  try {{
    const r = await fetch('/api/auth/reset-password', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{ token: {token!r}, new_password: pw }}),
    }});
    if (r.ok) {{
      msg.style.color = '#ff9900';
      msg.textContent = 'Password updated. Return to Spectra Terminal.';
      form.querySelector('button').disabled = true;
    }} else {{
      const data = await r.json().catch(() => ({{}}));
      msg.textContent = (data.detail || 'Reset failed').toString();
    }}
  }} catch (err) {{
    msg.textContent = 'Network error';
  }}
}});
</script>
</body></html>"""
    )


@router.post("/reset-password", status_code=204)
async def reset_password(req: ResetPasswordRequest):
    with get_conn() as conn:
        user_id = _consume_token(conn, req.token, "reset")
        if not user_id:
            raise HTTPException(status_code=400, detail="invalid or expired reset link")
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(req.new_password), user_id),
        )
        # Invalidate all sessions so the user has to re-login everywhere.
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
