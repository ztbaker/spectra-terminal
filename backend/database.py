import sqlite3
from contextlib import contextmanager
from config import settings


def get_db_path() -> str:
    return settings.DB_PATH


def init_db(db_path: str | None = None) -> None:
    path = db_path or get_db_path()
    with sqlite3.connect(path) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker    TEXT NOT NULL UNIQUE,
                added_at  TEXT NOT NULL DEFAULT (datetime('now')),
                notes     TEXT
            );

            CREATE TABLE IF NOT EXISTS portfolio (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker    TEXT NOT NULL,
                shares    REAL NOT NULL,
                avg_cost  REAL NOT NULL,
                added_at  TEXT NOT NULL DEFAULT (datetime('now'))
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

            CREATE TABLE IF NOT EXISTS command_history (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                command      TEXT NOT NULL,
                executed_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS financials_cache (
                ticker     TEXT PRIMARY KEY,
                data_json  TEXT NOT NULL,
                cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)


@contextmanager
def get_conn(db_path: str | None = None):
    path = db_path or get_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
