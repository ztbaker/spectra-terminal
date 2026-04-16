import sqlite3
from contextlib import contextmanager
from config import settings


def get_db_path() -> str:
    return settings.DB_PATH


# Target schema for user-scoped tables. If an existing table is missing
# `user_id`, it's dropped and recreated — acceptable because data on the
# Fly ephemeral filesystem was already being lost between restarts.

_USER_SCOPED = {
    "watchlist": """
        CREATE TABLE watchlist (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            ticker     TEXT NOT NULL,
            added_at   TEXT NOT NULL DEFAULT (datetime('now')),
            notes      TEXT,
            UNIQUE(user_id, ticker),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """,
    "portfolio": """
        CREATE TABLE portfolio (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            ticker     TEXT NOT NULL,
            shares     REAL NOT NULL,
            avg_cost   REAL NOT NULL,
            added_at   TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """,
    "command_history": """
        CREATE TABLE command_history (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER,
            command      TEXT NOT NULL,
            executed_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """,
}


def _ensure_user_scoped(conn: sqlite3.Connection) -> None:
    for table, create_sql in _USER_SCOPED.items():
        cols = conn.execute(f"PRAGMA table_info({table})").fetchall()
        has_user_id = any(c[1] == "user_id" for c in cols)
        if cols and not has_user_id:
            conn.execute(f"DROP TABLE {table}")
        conn.execute(create_sql.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS "))


def _ensure_email_columns(conn: sqlite3.Connection) -> None:
    cols = {c[1] for c in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "email" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
    if "email_verified" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
    # Case-insensitive uniqueness only enforced on non-null emails.
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_nocase "
        "ON users(email COLLATE NOCASE) WHERE email IS NOT NULL"
    )


def init_db(db_path: str | None = None) -> None:
    path = db_path or get_db_path()
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA foreign_keys = ON")

        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash  TEXT NOT NULL,
                created_at     TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token         TEXT PRIMARY KEY,
                user_id       INTEGER NOT NULL,
                created_at    TEXT NOT NULL DEFAULT (datetime('now')),
                last_used_at  TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS price_cache (
                ticker     TEXT PRIMARY KEY,
                data_json  TEXT NOT NULL,
                cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS news_cache (
                ticker     TEXT PRIMARY KEY,
                data_json  TEXT NOT NULL,
                cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS chart_cache (
                cache_key  TEXT PRIMARY KEY,
                data_json  TEXT NOT NULL,
                cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS econ_cache (
                series_id  TEXT PRIMARY KEY,
                data_json  TEXT NOT NULL,
                cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS financials_cache (
                ticker     TEXT PRIMARY KEY,
                data_json  TEXT NOT NULL,
                cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS email_tokens (
                token       TEXT PRIMARY KEY,
                user_id     INTEGER NOT NULL,
                kind        TEXT NOT NULL CHECK (kind IN ('verify','reset')),
                expires_at  TEXT NOT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS ix_email_tokens_user
                ON email_tokens(user_id, kind);

            CREATE TABLE IF NOT EXISTS chat_rooms (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                slug        TEXT NOT NULL UNIQUE COLLATE NOCASE,
                name        TEXT NOT NULL,
                description TEXT,
                created_by  INTEGER NOT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_memberships (
                room_id   INTEGER NOT NULL,
                user_id   INTEGER NOT NULL,
                joined_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (room_id, user_id),
                FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id      INTEGER,
                sender_id    INTEGER NOT NULL,
                recipient_id INTEGER,
                body         TEXT NOT NULL,
                created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (room_id)      REFERENCES chat_rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id)    REFERENCES users(id)      ON DELETE CASCADE,
                FOREIGN KEY (recipient_id) REFERENCES users(id)      ON DELETE CASCADE,
                CHECK (
                    (room_id IS NOT NULL AND recipient_id IS NULL) OR
                    (room_id IS NULL     AND recipient_id IS NOT NULL)
                )
            );

            CREATE INDEX IF NOT EXISTS ix_chat_msgs_room
                ON chat_messages(room_id, id);
            CREATE INDEX IF NOT EXISTS ix_chat_msgs_dm_pair
                ON chat_messages(sender_id, recipient_id, id);
            CREATE INDEX IF NOT EXISTS ix_chat_msgs_dm_pair_rev
                ON chat_messages(recipient_id, sender_id, id);
        """)

        _ensure_email_columns(conn)
        _ensure_user_scoped(conn)
        conn.commit()


@contextmanager
def get_conn(db_path: str | None = None):
    path = db_path or get_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
