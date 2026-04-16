import secrets
import bcrypt
from fastapi import Header, HTTPException

from database import get_conn


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, pw_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), pw_hash.encode("utf-8"))
    except Exception:
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def _extract_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return ""
    return parts[1].strip()


def current_user_id(authorization: str | None = Header(default=None)) -> int:
    token = _extract_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="missing bearer token")

    with get_conn() as conn:
        row = conn.execute(
            "SELECT user_id FROM sessions WHERE token = ?",
            (token,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="invalid or expired session")
        conn.execute(
            "UPDATE sessions SET last_used_at = datetime('now') WHERE token = ?",
            (token,),
        )
        return row["user_id"]


def current_token(authorization: str | None = Header(default=None)) -> str:
    token = _extract_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="missing bearer token")
    return token
