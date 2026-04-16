import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import (
    current_token,
    current_user_id,
    hash_password,
    new_token,
    verify_password,
)
from database import get_conn

router = APIRouter(prefix="/auth", tags=["auth"])

USERNAME_RE = re.compile(r"^[A-Za-z0-9_\-.]{3,32}$")


class AuthRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=256)


class AuthResponse(BaseModel):
    token: str
    user_id: int
    username: str


class UserInfo(BaseModel):
    user_id: int
    username: str


def _normalize_username(raw: str) -> str:
    username = raw.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(
            status_code=400,
            detail="username must be 3-32 chars: letters, digits, underscore, dash, or dot",
        )
    return username


@router.post("/signup", response_model=AuthResponse)
async def signup(req: AuthRequest):
    username = _normalize_username(req.username)
    pw_hash = hash_password(req.password)
    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, pw_hash),
            )
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise HTTPException(status_code=409, detail="username already taken")
            raise
        user_id = cur.lastrowid
        token = new_token()
        conn.execute(
            "INSERT INTO sessions (token, user_id) VALUES (?, ?)",
            (token, user_id),
        )
    return AuthResponse(token=token, user_id=user_id, username=username)


@router.post("/login", response_model=AuthResponse)
async def login(req: AuthRequest):
    username = req.username.strip()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
        if not row or not verify_password(req.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="invalid username or password")
        token = new_token()
        conn.execute(
            "INSERT INTO sessions (token, user_id) VALUES (?, ?)",
            (token, row["id"]),
        )
    return AuthResponse(token=token, user_id=row["id"], username=row["username"])


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
            "SELECT id, username FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="user not found")
    return UserInfo(user_id=row["id"], username=row["username"])
