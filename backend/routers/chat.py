import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import current_user_id
from database import get_conn


router = APIRouter()


# ─── Models ─────────────────────────────────────────────────────────────────

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,31}$")


class RoomCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=64)
    description: Optional[str] = Field(None, max_length=240)


class RoomRow(BaseModel):
    id: int
    slug: str
    name: str
    description: Optional[str] = None
    created_at: str
    member_count: int
    joined: bool


class MessageSend(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class MessageRow(BaseModel):
    id: int
    room_id: Optional[int] = None
    sender_id: int
    sender_username: str
    recipient_id: Optional[int] = None
    recipient_username: Optional[str] = None
    body: str
    created_at: str


class DMThread(BaseModel):
    peer_id: int
    peer_username: str
    last_message: Optional[str] = None
    last_at: Optional[str] = None


class UserRow(BaseModel):
    id: int
    username: str


# ─── Helpers ────────────────────────────────────────────────────────────────

def _get_room_by_slug(conn, slug: str):
    row = conn.execute(
        "SELECT id, slug, name, description, created_at "
        "FROM chat_rooms WHERE slug = ? COLLATE NOCASE",
        (slug,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="room not found")
    return row


def _get_user_by_username(conn, username: str):
    row = conn.execute(
        "SELECT id, username FROM users WHERE username = ? COLLATE NOCASE",
        (username,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="user not found")
    return row


def _ensure_membership(conn, room_id: int, user_id: int) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO chat_memberships (room_id, user_id) VALUES (?, ?)",
        (room_id, user_id),
    )


def _serialize_message(row) -> MessageRow:
    return MessageRow(
        id=row["id"],
        room_id=row["room_id"],
        sender_id=row["sender_id"],
        sender_username=row["sender_username"],
        recipient_id=row["recipient_id"],
        recipient_username=row["recipient_username"],
        body=row["body"],
        created_at=row["created_at"],
    )


# ─── Rooms ──────────────────────────────────────────────────────────────────

@router.get("/chat/rooms", response_model=list[RoomRow])
async def list_rooms(user_id: int = Depends(current_user_id)):
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                r.id, r.slug, r.name, r.description, r.created_at,
                (SELECT COUNT(*) FROM chat_memberships m WHERE m.room_id = r.id)
                    AS member_count,
                EXISTS(
                    SELECT 1 FROM chat_memberships m
                    WHERE m.room_id = r.id AND m.user_id = ?
                ) AS joined
            FROM chat_rooms r
            ORDER BY r.created_at ASC
            """,
            (user_id,),
        ).fetchall()
    return [
        RoomRow(
            id=r["id"],
            slug=r["slug"],
            name=r["name"],
            description=r["description"],
            created_at=r["created_at"],
            member_count=r["member_count"],
            joined=bool(r["joined"]),
        )
        for r in rows
    ]


@router.post("/chat/rooms", response_model=RoomRow, status_code=201)
async def create_room(
    payload: RoomCreate,
    user_id: int = Depends(current_user_id),
):
    slug = payload.slug.strip().lower()
    if not SLUG_RE.match(slug):
        raise HTTPException(
            status_code=400,
            detail="slug must be 1-32 chars, a-z/0-9/- only, start alphanumeric",
        )
    name = payload.name.strip()
    desc = payload.description.strip() if payload.description else None

    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO chat_rooms (slug, name, description, created_by) "
                "VALUES (?, ?, ?, ?)",
                (slug, name, desc, user_id),
            )
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise HTTPException(status_code=409, detail=f"#{slug} already exists")
            raise
        room_id = cur.lastrowid
        _ensure_membership(conn, room_id, user_id)
        row = conn.execute(
            "SELECT id, slug, name, description, created_at "
            "FROM chat_rooms WHERE id = ?",
            (room_id,),
        ).fetchone()

    return RoomRow(
        id=row["id"],
        slug=row["slug"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
        member_count=1,
        joined=True,
    )


@router.post("/chat/rooms/{slug}/join", status_code=204)
async def join_room(slug: str, user_id: int = Depends(current_user_id)):
    with get_conn() as conn:
        room = _get_room_by_slug(conn, slug)
        _ensure_membership(conn, room["id"], user_id)


@router.post("/chat/rooms/{slug}/leave", status_code=204)
async def leave_room(slug: str, user_id: int = Depends(current_user_id)):
    with get_conn() as conn:
        room = _get_room_by_slug(conn, slug)
        conn.execute(
            "DELETE FROM chat_memberships WHERE room_id = ? AND user_id = ?",
            (room["id"], user_id),
        )


# ─── Room messages ──────────────────────────────────────────────────────────

@router.get("/chat/rooms/{slug}/messages", response_model=list[MessageRow])
async def list_room_messages(
    slug: str,
    after: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user_id: int = Depends(current_user_id),  # noqa: ARG001 -- auth required
):
    with get_conn() as conn:
        room = _get_room_by_slug(conn, slug)
        rows = conn.execute(
            """
            SELECT
                m.id, m.room_id, m.sender_id, m.recipient_id, m.body, m.created_at,
                us.username AS sender_username,
                ur.username AS recipient_username
            FROM chat_messages m
            JOIN users us ON us.id = m.sender_id
            LEFT JOIN users ur ON ur.id = m.recipient_id
            WHERE m.room_id = ? AND m.id > ?
            ORDER BY m.id ASC
            LIMIT ?
            """,
            (room["id"], after, limit),
        ).fetchall()
    return [_serialize_message(r) for r in rows]


@router.post("/chat/rooms/{slug}/messages", response_model=MessageRow, status_code=201)
async def send_room_message(
    slug: str,
    payload: MessageSend,
    user_id: int = Depends(current_user_id),
):
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="message cannot be empty")

    with get_conn() as conn:
        room = _get_room_by_slug(conn, slug)
        _ensure_membership(conn, room["id"], user_id)
        cur = conn.execute(
            "INSERT INTO chat_messages (room_id, sender_id, body) VALUES (?, ?, ?)",
            (room["id"], user_id, body),
        )
        row = conn.execute(
            """
            SELECT
                m.id, m.room_id, m.sender_id, m.recipient_id, m.body, m.created_at,
                us.username AS sender_username,
                ur.username AS recipient_username
            FROM chat_messages m
            JOIN users us ON us.id = m.sender_id
            LEFT JOIN users ur ON ur.id = m.recipient_id
            WHERE m.id = ?
            """,
            (cur.lastrowid,),
        ).fetchone()
    return _serialize_message(row)


# ─── Direct messages ────────────────────────────────────────────────────────

@router.get("/chat/dms", response_model=list[DMThread])
async def list_dm_threads(user_id: int = Depends(current_user_id)):
    with get_conn() as conn:
        rows = conn.execute(
            """
            WITH pairs AS (
                SELECT
                    CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END
                        AS peer_id,
                    id, body, created_at
                FROM chat_messages
                WHERE room_id IS NULL
                  AND (sender_id = ? OR recipient_id = ?)
            ),
            latest AS (
                SELECT peer_id, MAX(id) AS last_id FROM pairs GROUP BY peer_id
            )
            SELECT
                u.id    AS peer_id,
                u.username AS peer_username,
                p.body  AS last_message,
                p.created_at AS last_at
            FROM latest l
            JOIN pairs p  ON p.peer_id = l.peer_id AND p.id = l.last_id
            JOIN users u  ON u.id      = l.peer_id
            ORDER BY p.id DESC
            """,
            (user_id, user_id, user_id),
        ).fetchall()
    return [
        DMThread(
            peer_id=r["peer_id"],
            peer_username=r["peer_username"],
            last_message=r["last_message"],
            last_at=r["last_at"],
        )
        for r in rows
    ]


@router.get("/chat/dms/{username}/messages", response_model=list[MessageRow])
async def list_dm_messages(
    username: str,
    after: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user_id: int = Depends(current_user_id),
):
    with get_conn() as conn:
        peer = _get_user_by_username(conn, username)
        if peer["id"] == user_id:
            raise HTTPException(status_code=400, detail="cannot DM yourself")
        rows = conn.execute(
            """
            SELECT
                m.id, m.room_id, m.sender_id, m.recipient_id, m.body, m.created_at,
                us.username AS sender_username,
                ur.username AS recipient_username
            FROM chat_messages m
            JOIN users us ON us.id = m.sender_id
            LEFT JOIN users ur ON ur.id = m.recipient_id
            WHERE m.room_id IS NULL
              AND m.id > ?
              AND (
                  (m.sender_id = ? AND m.recipient_id = ?) OR
                  (m.sender_id = ? AND m.recipient_id = ?)
              )
            ORDER BY m.id ASC
            LIMIT ?
            """,
            (after, user_id, peer["id"], peer["id"], user_id, limit),
        ).fetchall()
    return [_serialize_message(r) for r in rows]


@router.post("/chat/dms/{username}/messages", response_model=MessageRow, status_code=201)
async def send_dm(
    username: str,
    payload: MessageSend,
    user_id: int = Depends(current_user_id),
):
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="message cannot be empty")

    with get_conn() as conn:
        peer = _get_user_by_username(conn, username)
        if peer["id"] == user_id:
            raise HTTPException(status_code=400, detail="cannot DM yourself")
        cur = conn.execute(
            "INSERT INTO chat_messages (sender_id, recipient_id, body) "
            "VALUES (?, ?, ?)",
            (user_id, peer["id"], body),
        )
        row = conn.execute(
            """
            SELECT
                m.id, m.room_id, m.sender_id, m.recipient_id, m.body, m.created_at,
                us.username AS sender_username,
                ur.username AS recipient_username
            FROM chat_messages m
            JOIN users us ON us.id = m.sender_id
            LEFT JOIN users ur ON ur.id = m.recipient_id
            WHERE m.id = ?
            """,
            (cur.lastrowid,),
        ).fetchone()
    return _serialize_message(row)


# ─── User search (for starting DMs) ─────────────────────────────────────────

@router.get("/chat/users", response_model=list[UserRow])
async def search_users(
    q: str = Query("", max_length=32),
    user_id: int = Depends(current_user_id),
):
    q = q.strip()
    with get_conn() as conn:
        if q:
            rows = conn.execute(
                "SELECT id, username FROM users "
                "WHERE id != ? AND username LIKE ? COLLATE NOCASE "
                "ORDER BY username LIMIT 20",
                (user_id, f"{q}%"),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, username FROM users WHERE id != ? "
                "ORDER BY username LIMIT 20",
                (user_id,),
            ).fetchall()
    return [UserRow(id=r["id"], username=r["username"]) for r in rows]
