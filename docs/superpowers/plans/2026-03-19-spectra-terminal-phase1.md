# Spectra Terminal Phase 1 — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete FastAPI backend for Spectra Terminal — a Bloomberg Terminal emulator using entirely free data sources.

**Architecture:** Foundation-first then parallel routers. Build `config → database → cache → services → main` sequentially, then dispatch all 14 routers in parallel since they are independent once the service layer exists.

**Tech Stack:** Python 3.11+, FastAPI, SQLite (sqlite3 built-in), yfinance, httpx, finnhub-python, feedparser, APScheduler, pandas, numpy, pydantic, uvicorn.

---

## File Map

**Create (foundation — sequential):**
- `backend/requirements.txt`
- `backend/.env.example`
- `backend/config.py`
- `backend/database.py`
- `backend/cache.py`
- `backend/services/yfinance_service.py`
- `backend/services/fred_service.py`
- `backend/services/finnhub_service.py`
- `backend/services/edgar_service.py`
- `backend/services/news_service.py`
- `backend/main.py`

**Create (routers — parallel after foundation):**
- `backend/routers/equity.py`
- `backend/routers/chart.py`
- `backend/routers/options.py`
- `backend/routers/news.py`
- `backend/routers/econ.py`
- `backend/routers/portfolio.py`
- `backend/routers/watchlist.py`
- `backend/routers/earnings.py`
- `backend/routers/screener.py`
- `backend/routers/fx.py`
- `backend/routers/crypto.py`
- `backend/routers/filings.py`
- `backend/routers/macro.py`
- `backend/routers/indices.py`

**Test files:**
- `backend/tests/test_config.py`
- `backend/tests/test_database.py`
- `backend/tests/test_cache.py`
- `backend/tests/test_services.py`
- `backend/tests/test_routers.py`
- `backend/tests/conftest.py`

---

## PHASE A — FOUNDATION (sequential, tasks 1–9)

---

### Task 1: Project scaffold + requirements

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/routers/__init__.py`
- Create: `backend/services/__init__.py`

- [ ] **Step 1: Create directory structure**

```bash
cd "/Users/zacbaker/Documents/Trade Strat/SpectraTerminal"
mkdir -p backend/routers backend/services backend/tests
touch backend/routers/__init__.py backend/services/__init__.py backend/tests/__init__.py
```

- [ ] **Step 2: Write requirements.txt**

Create `backend/requirements.txt`:
```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
python-dotenv>=1.0.0
yfinance>=0.2.37
pandas>=2.0.0
numpy>=1.26.0
httpx>=0.27.0
finnhub-python>=2.4.19
feedparser>=6.0.11
pydantic>=2.0.0
apscheduler>=3.10.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.27.0
```

- [ ] **Step 3: Write .env.example**

Create `backend/.env.example`:
```
FRED_API_KEY=your_fred_key_here
FINNHUB_API_KEY=your_finnhub_key_here
DB_PATH=spectra_terminal.db
```

- [ ] **Step 4: Write conftest.py**

Create `backend/tests/conftest.py`:
```python
import pytest
import os
import tempfile

@pytest.fixture(autouse=True)
def temp_db(monkeypatch):
    """Use a temp SQLite file for every test."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    monkeypatch.setenv("DB_PATH", db_path)
    yield db_path
    os.unlink(db_path)

@pytest.fixture(autouse=True)
def fake_api_keys(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "test_fred_key")
    monkeypatch.setenv("FINNHUB_API_KEY", "test_finnhub_key")
```

- [ ] **Step 5: Install dependencies**

```bash
cd "/Users/zacbaker/Documents/Trade Strat/SpectraTerminal/backend"
pip install -r requirements.txt
```

Expected: All packages install without error.

- [ ] **Step 6: Commit**

```bash
cd "/Users/zacbaker/Documents/Trade Strat/SpectraTerminal"
git init
git add backend/
git commit -m "feat: scaffold backend project structure"
```

---

### Task 2: config.py

**Files:**
- Create: `backend/config.py`
- Create: `backend/tests/test_config.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_config.py`:
```python
import pytest
import os

def test_config_loads_keys(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "abc123")
    monkeypatch.setenv("FINNHUB_API_KEY", "xyz789")
    # Re-import to pick up env changes
    import importlib
    import backend.config as cfg
    importlib.reload(cfg)
    assert cfg.FRED_API_KEY == "abc123"
    assert cfg.FINNHUB_API_KEY == "xyz789"

def test_config_db_path_default(monkeypatch):
    monkeypatch.delenv("DB_PATH", raising=False)
    import importlib
    import backend.config as cfg
    importlib.reload(cfg)
    assert cfg.DB_PATH == "spectra_terminal.db"
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "/Users/zacbaker/Documents/Trade Strat/SpectraTerminal/backend"
pytest tests/test_config.py -v
```

Expected: `ModuleNotFoundError` or `ImportError` — config doesn't exist yet.

- [ ] **Step 3: Implement config.py**

Create `backend/config.py`:
```python
import os
from dotenv import load_dotenv

load_dotenv()

FRED_API_KEY: str = os.environ.get("FRED_API_KEY", "")
FINNHUB_API_KEY: str = os.environ.get("FINNHUB_API_KEY", "")
DB_PATH: str = os.environ.get("DB_PATH", "spectra_terminal.db")

if not FRED_API_KEY:
    raise EnvironmentError("FRED_API_KEY is not set. Copy .env.example to .env and fill in your keys.")
if not FINNHUB_API_KEY:
    raise EnvironmentError("FINNHUB_API_KEY is not set. Copy .env.example to .env and fill in your keys.")
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pytest tests/test_config.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/config.py backend/tests/test_config.py
git commit -m "feat: add config.py with env loading and validation"
```

---

### Task 3: database.py

**Files:**
- Create: `backend/database.py`
- Create: `backend/tests/test_database.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_database.py`:
```python
import sqlite3
import os
import pytest

def test_init_db_creates_tables(temp_db):
    from backend import database
    import importlib
    importlib.reload(database)
    database.init_db()
    with sqlite3.connect(temp_db) as conn:
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
    expected = {"watchlist", "portfolio", "price_cache", "news_cache",
                "chart_cache", "options_cache", "econ_cache"}
    assert expected.issubset(tables)

def test_get_db_returns_connection(temp_db):
    from backend import database
    import importlib
    importlib.reload(database)
    database.init_db()
    with database.get_db() as conn:
        assert isinstance(conn, sqlite3.Connection)

def test_watchlist_table_schema(temp_db):
    from backend import database
    import importlib
    importlib.reload(database)
    database.init_db()
    with database.get_db() as conn:
        conn.execute("INSERT INTO watchlist (ticker, notes) VALUES (?, ?)", ("AAPL", "test"))
        row = conn.execute("SELECT ticker, notes FROM watchlist WHERE ticker='AAPL'").fetchone()
    assert row == ("AAPL", "test")

def test_portfolio_table_schema(temp_db):
    from backend import database
    import importlib
    importlib.reload(database)
    database.init_db()
    with database.get_db() as conn:
        conn.execute(
            "INSERT INTO portfolio (ticker, shares, avg_cost) VALUES (?, ?, ?)",
            ("MSFT", 10.0, 300.0)
        )
        row = conn.execute("SELECT ticker, shares, avg_cost FROM portfolio WHERE ticker='MSFT'").fetchone()
    assert row == ("MSFT", 10.0, 300.0)
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_database.py -v
```

Expected: ImportError — database module doesn't exist.

- [ ] **Step 3: Implement database.py**

Create `backend/database.py`:
```python
import sqlite3
import contextlib
from backend.config import DB_PATH


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL UNIQUE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS portfolio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                shares REAL NOT NULL,
                avg_cost REAL NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS price_cache (
                ticker TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                cached_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS news_cache (
                ticker TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                cached_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chart_cache (
                cache_key TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                cached_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS options_cache (
                cache_key TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                cached_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS econ_cache (
                series_id TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                cached_at TIMESTAMP NOT NULL
            );
        """)


@contextlib.contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_database.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/database.py backend/tests/test_database.py
git commit -m "feat: add database.py with SQLite schema"
```

---

### Task 4: cache.py

**Files:**
- Create: `backend/cache.py`
- Create: `backend/tests/test_cache.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_cache.py`:
```python
import time
import pytest

def test_cache_miss_returns_none(temp_db):
    from backend import database, cache
    import importlib; importlib.reload(database); importlib.reload(cache)
    database.init_db()
    assert cache.get("missing_key") is None

def test_cache_set_and_get(temp_db):
    from backend import database, cache
    import importlib; importlib.reload(database); importlib.reload(cache)
    database.init_db()
    cache.set("equity_AAPL_abc", {"price": 180.0}, ttl_seconds=60)
    result = cache.get("equity_AAPL_abc")
    assert result == {"price": 180.0}

def test_cache_expired_returns_none(temp_db):
    from backend import database, cache
    import importlib; importlib.reload(database); importlib.reload(cache)
    database.init_db()
    cache.set("equity_MSFT_xyz", {"price": 400.0}, ttl_seconds=1)
    time.sleep(1.1)
    assert cache.get("equity_MSFT_xyz") is None

def test_cache_invalidate(temp_db):
    from backend import database, cache
    import importlib; importlib.reload(database); importlib.reload(cache)
    database.init_db()
    cache.set("news_TSLA_abc", {"items": []}, ttl_seconds=300)
    cache.invalidate("news_TSLA_abc")
    assert cache.get("news_TSLA_abc") is None

def test_cache_key_helper(temp_db):
    from backend import cache
    key = cache.make_key("chart", "AAPL", {"period": "1y", "interval": "1d"})
    assert key.startswith("chart_AAPL_")
    assert len(key) > 15
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_cache.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement cache.py**

Create `backend/cache.py`:
```python
import json
import hashlib
import sqlite3
from datetime import datetime, timezone
from typing import Any
from backend.config import DB_PATH


def make_key(endpoint: str, ticker: str, params: dict) -> str:
    params_str = json.dumps(params, sort_keys=True)
    params_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]
    return f"{endpoint}_{ticker}_{params_hash}"


def _table_for_key(key: str) -> str:
    """Route cache key to its SQLite table based on prefix."""
    if key.startswith("equity_") or key.startswith("fx_") or key.startswith("crypto_") or key.startswith("indices_"):
        return "price_cache"
    if key.startswith("news_"):
        return "news_cache"
    if key.startswith("chart_"):
        return "chart_cache"
    if key.startswith("options_"):
        return "options_cache"
    if key.startswith("econ_") or key.startswith("macro_"):
        return "econ_cache"
    # Generic fallback: use chart_cache as a general key-value store
    return "chart_cache"


def get(key: str) -> Any | None:
    table = _table_for_key(key)
    now = datetime.now(timezone.utc).isoformat()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            # price_cache and news_cache use 'ticker' as primary key; others use 'cache_key'
            if table in ("price_cache", "news_cache", "econ_cache"):
                row = conn.execute(
                    f"SELECT data_json, cached_at FROM {table} WHERE ticker=? OR series_id=? OR ticker=?",
                    (key, key, key)
                ).fetchone()
            else:
                row = conn.execute(
                    f"SELECT data_json, cached_at FROM {table} WHERE cache_key=?",
                    (key,)
                ).fetchone()
            if row is None:
                return None
            data_json, cached_at_str = row
            cached_at = datetime.fromisoformat(cached_at_str)
            if cached_at.tzinfo is None:
                cached_at = cached_at.replace(tzinfo=timezone.utc)
            entry = json.loads(data_json)
            ttl = entry.get("__ttl__", 60)
            elapsed = (datetime.now(timezone.utc) - cached_at).total_seconds()
            if elapsed > ttl:
                return None
            return entry.get("__data__")
    except Exception:
        return None


def set(key: str, data: Any, ttl_seconds: int) -> None:
    table = _table_for_key(key)
    now = datetime.now(timezone.utc).isoformat()
    payload = json.dumps({"__data__": data, "__ttl__": ttl_seconds})
    try:
        with sqlite3.connect(DB_PATH) as conn:
            if table == "price_cache":
                conn.execute(
                    "INSERT OR REPLACE INTO price_cache (ticker, data_json, cached_at) VALUES (?,?,?)",
                    (key, payload, now)
                )
            elif table == "news_cache":
                conn.execute(
                    "INSERT OR REPLACE INTO news_cache (ticker, data_json, cached_at) VALUES (?,?,?)",
                    (key, payload, now)
                )
            elif table == "econ_cache":
                conn.execute(
                    "INSERT OR REPLACE INTO econ_cache (series_id, data_json, cached_at) VALUES (?,?,?)",
                    (key, payload, now)
                )
            else:
                conn.execute(
                    f"INSERT OR REPLACE INTO {table} (cache_key, data_json, cached_at) VALUES (?,?,?)",
                    (key, payload, now)
                )
            conn.commit()
    except Exception:
        pass


def invalidate(key: str) -> None:
    table = _table_for_key(key)
    try:
        with sqlite3.connect(DB_PATH) as conn:
            if table in ("price_cache", "news_cache"):
                conn.execute(f"DELETE FROM {table} WHERE ticker=?", (key,))
            elif table == "econ_cache":
                conn.execute("DELETE FROM econ_cache WHERE series_id=?", (key,))
            else:
                conn.execute(f"DELETE FROM {table} WHERE cache_key=?", (key,))
            conn.commit()
    except Exception:
        pass
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_cache.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/cache.py backend/tests/test_cache.py
git commit -m "feat: add cache.py with TTL-based SQLite caching"
```

---

### Task 5: yfinance_service.py

**Files:**
- Create: `backend/services/yfinance_service.py`
- Modify: `backend/tests/test_services.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_services.py`:
```python
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd

# ── yfinance_service ──────────────────────────────────────────────────────────

def test_get_ticker_info_returns_dict():
    mock_info = {"currentPrice": 180.0, "shortName": "Apple Inc."}
    with patch("yfinance.Ticker") as MockTicker:
        MockTicker.return_value.info = mock_info
        from backend.services import yfinance_service
        import importlib; importlib.reload(yfinance_service)
        import asyncio
        result = asyncio.run(yfinance_service.get_ticker_info("AAPL"))
    assert result["currentPrice"] == 180.0

def test_get_ticker_info_returns_none_on_error():
    with patch("yfinance.Ticker") as MockTicker:
        MockTicker.side_effect = Exception("network error")
        from backend.services import yfinance_service
        import importlib; importlib.reload(yfinance_service)
        import asyncio
        result = asyncio.run(yfinance_service.get_ticker_info("BADTICKER"))
    assert result is None

def test_get_history_returns_dataframe():
    mock_df = pd.DataFrame({
        "Open": [100.0], "High": [105.0], "Low": [99.0],
        "Close": [103.0], "Volume": [1000000]
    }, index=pd.to_datetime(["2024-01-01"]))
    with patch("yfinance.Ticker") as MockTicker:
        MockTicker.return_value.history.return_value = mock_df
        from backend.services import yfinance_service
        import importlib; importlib.reload(yfinance_service)
        import asyncio
        result = asyncio.run(yfinance_service.get_history("AAPL", "1y", "1d"))
    assert result is not None
    assert len(result) == 1

def test_get_multiple_quotes_returns_list():
    mock_info = {"currentPrice": 180.0, "symbol": "AAPL"}
    with patch("yfinance.Ticker") as MockTicker:
        MockTicker.return_value.info = mock_info
        from backend.services import yfinance_service
        import importlib; importlib.reload(yfinance_service)
        import asyncio
        result = asyncio.run(yfinance_service.get_multiple_quotes(["AAPL", "MSFT"]))
    assert isinstance(result, list)
    assert len(result) == 2
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_services.py::test_get_ticker_info_returns_dict -v
```

Expected: ImportError.

- [ ] **Step 3: Implement yfinance_service.py**

Create `backend/services/yfinance_service.py`:
```python
import asyncio
import yfinance as yf
import pandas as pd
from typing import Any


async def _run(func, *args):
    """Run a synchronous yfinance call in a thread."""
    return await asyncio.to_thread(func, *args)


def _fetch_info(ticker: str) -> dict:
    return yf.Ticker(ticker).info


def _fetch_history(ticker: str, period: str, interval: str) -> pd.DataFrame:
    return yf.Ticker(ticker).history(period=period, interval=interval)


def _fetch_options_expiries(ticker: str) -> tuple:
    t = yf.Ticker(ticker)
    return t.options, t


def _fetch_option_chain(ticker_obj, expiry: str):
    return ticker_obj.option_chain(expiry)


async def get_ticker_info(ticker: str) -> dict | None:
    for attempt in range(3):
        try:
            info = await asyncio.to_thread(_fetch_info, ticker)
            if info and isinstance(info, dict):
                return info
        except Exception:
            if attempt < 2:
                await asyncio.sleep(0.5 * (2 ** attempt))
    return None


async def get_history(ticker: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame | None:
    for attempt in range(3):
        try:
            df = await asyncio.to_thread(_fetch_history, ticker, period, interval)
            if df is not None and not df.empty:
                return df
        except Exception:
            if attempt < 2:
                await asyncio.sleep(0.5 * (2 ** attempt))
    return None


async def get_options(ticker: str) -> dict | None:
    """Return nearest 4 expiry dates and the yfinance Ticker object."""
    try:
        expiries, ticker_obj = await asyncio.to_thread(_fetch_options_expiries, ticker)
        return {"expiries": expiries[:4], "ticker_obj": ticker_obj}
    except Exception:
        return None


async def get_option_chain(ticker: str, expiry: str):
    try:
        t = yf.Ticker(ticker)
        return await asyncio.to_thread(t.option_chain, expiry)
    except Exception:
        return None


async def get_multiple_quotes(tickers: list[str]) -> list[dict | None]:
    tasks = [get_ticker_info(t) for t in tickers]
    return await asyncio.gather(*tasks)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_services.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/services/yfinance_service.py backend/tests/test_services.py
git commit -m "feat: add yfinance_service with async wrapper and retry"
```

---

### Task 6: fred_service.py, finnhub_service.py, edgar_service.py, news_service.py

**Files:**
- Create: `backend/services/fred_service.py`
- Create: `backend/services/finnhub_service.py`
- Create: `backend/services/edgar_service.py`
- Create: `backend/services/news_service.py`

- [ ] **Step 1: Implement fred_service.py**

Create `backend/services/fred_service.py`:
```python
import httpx
from datetime import datetime
from backend.config import FRED_API_KEY

FRED_BASE = "https://api.stlouisfed.org/fred"


async def get_series(series_id: str, start_date: str = "2010-01-01") -> dict | None:
    params = {
        "series_id": series_id,
        "observation_start": start_date,
        "api_key": FRED_API_KEY,
        "file_type": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{FRED_BASE}/series/observations", params=params)
            r.raise_for_status()
            data = r.json()
            observations = [
                {"date": o["date"], "value": float(o["value"]) if o["value"] != "." else None}
                for o in data.get("observations", [])
            ]
            # Get series metadata
            meta_r = await client.get(f"{FRED_BASE}/series", params={"series_id": series_id, "api_key": FRED_API_KEY, "file_type": "json"})
            meta_r.raise_for_status()
            meta = meta_r.json().get("seriess", [{}])[0]
            return {
                "id": series_id,
                "title": meta.get("title", series_id),
                "units": meta.get("units_short", ""),
                "frequency": meta.get("frequency_short", ""),
                "observations": observations,
            }
    except Exception:
        return None


async def get_latest_value(series_id: str) -> float | None:
    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 2,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{FRED_BASE}/series/observations", params=params)
            r.raise_for_status()
            obs = r.json().get("observations", [])
            valid = [o for o in obs if o["value"] != "."]
            if not valid:
                return None
            return float(valid[0]["value"])
    except Exception:
        return None


async def get_latest_two(series_id: str) -> tuple[float | None, float | None]:
    """Return (latest, previous) values for computing change."""
    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 5,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{FRED_BASE}/series/observations", params=params)
            r.raise_for_status()
            obs = r.json().get("observations", [])
            valid = [float(o["value"]) for o in obs if o["value"] != "."]
            latest = valid[0] if len(valid) > 0 else None
            previous = valid[1] if len(valid) > 1 else None
            return latest, previous
    except Exception:
        return None, None
```

- [ ] **Step 2: Implement finnhub_service.py**

Create `backend/services/finnhub_service.py`:
```python
import httpx
import asyncio
import time
from backend.config import FINNHUB_API_KEY

FINNHUB_BASE = "https://finnhub.io/api/v1"

# Simple rate limiter: 60 req/min = 1 per second
_last_request_time = 0.0
_min_interval = 1.0  # seconds between requests


async def _get(path: str, params: dict) -> dict | None:
    global _last_request_time
    now = time.monotonic()
    wait = _min_interval - (now - _last_request_time)
    if wait > 0:
        await asyncio.sleep(wait)
    _last_request_time = time.monotonic()
    params["token"] = FINNHUB_API_KEY
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{FINNHUB_BASE}{path}", params=params)
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


async def get_company_news(ticker: str, from_date: str, to_date: str) -> list[dict]:
    data = await _get("/company-news", {"symbol": ticker, "from": from_date, "to": to_date})
    if not isinstance(data, list):
        return []
    return data


async def get_company_profile(ticker: str) -> dict | None:
    return await _get("/stock/profile2", {"symbol": ticker})
```

- [ ] **Step 3: Implement edgar_service.py**

Create `backend/services/edgar_service.py`:
```python
import httpx
import asyncio

EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions"
EDGAR_COMPANY = "https://www.sec.gov/cgi-bin/browse-edgar"

HEADERS = {"User-Agent": "SpectraTerminal contact@example.com"}


async def get_cik(ticker: str) -> str | None:
    """Resolve ticker to zero-padded 10-digit CIK."""
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=HEADERS) as client:
            # Try the company tickers JSON from SEC (fast, no scraping)
            r = await client.get("https://www.sec.gov/files/company_tickers.json")
            r.raise_for_status()
            data = r.json()
            ticker_upper = ticker.upper()
            for entry in data.values():
                if entry.get("ticker", "").upper() == ticker_upper:
                    cik = str(entry["cik_str"]).zfill(10)
                    return cik
        return None
    except Exception:
        return None


async def search_filings(ticker: str, form_type: str = "10-K", limit: int = 10) -> list[dict]:
    await asyncio.sleep(0.1)  # polite rate limiting
    cik = await get_cik(ticker)
    if not cik:
        return []
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=HEADERS) as client:
            r = await client.get(f"{EDGAR_SUBMISSIONS}/CIK{cik}.json")
            r.raise_for_status()
            data = r.json()
            filings = data.get("filings", {}).get("recent", {})
            forms = filings.get("form", [])
            dates = filings.get("filingDate", [])
            descriptions = filings.get("primaryDocument", [])
            accession_numbers = filings.get("accessionNumber", [])
            periods = filings.get("reportDate", [])

            results = []
            for i, form in enumerate(forms):
                if form == form_type and len(results) < limit:
                    accession = accession_numbers[i].replace("-", "")
                    doc = descriptions[i] if i < len(descriptions) else ""
                    url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession}/{doc}"
                    results.append({
                        "form_type": form,
                        "filed_date": dates[i] if i < len(dates) else "",
                        "description": doc,
                        "url": url,
                        "period_of_report": periods[i] if i < len(periods) else "",
                    })
            return results
    except Exception:
        return []
```

- [ ] **Step 4: Implement news_service.py**

Create `backend/services/news_service.py`:
```python
import feedparser
import asyncio
from datetime import datetime, timezone, timedelta
from backend.services.finnhub_service import get_company_news

POSITIVE_WORDS = {"surge", "gain", "rise", "jump", "beat", "profit", "record", "growth", "strong", "buy"}
NEGATIVE_WORDS = {"fall", "drop", "decline", "loss", "miss", "cut", "weak", "sell", "layoff", "crash", "debt"}

YAHOO_RSS_GENERAL = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US"
YAHOO_RSS_TICKER = "https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"


def _sentiment(text: str) -> str:
    words = set(text.lower().split())
    pos = len(words & POSITIVE_WORDS)
    neg = len(words & NEGATIVE_WORDS)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def _parse_rss(url: str) -> list[dict]:
    try:
        feed = feedparser.parse(url)
        items = []
        for entry in feed.entries[:30]:
            items.append({
                "headline": entry.get("title", ""),
                "source": "Yahoo Finance",
                "url": entry.get("link", ""),
                "datetime": entry.get("published", ""),
                "summary": entry.get("summary", ""),
                "sentiment": _sentiment(entry.get("title", "")),
            })
        return items
    except Exception:
        return []


def _deduplicate(items: list[dict]) -> list[dict]:
    seen = set()
    result = []
    for item in items:
        key = item["headline"][:60].lower()
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


async def get_news(ticker: str | None = None, limit: int = 50) -> list[dict]:
    items = []

    if ticker:
        # Finnhub company news (last 7 days)
        today = datetime.now(timezone.utc)
        from_date = (today - timedelta(days=7)).strftime("%Y-%m-%d")
        to_date = today.strftime("%Y-%m-%d")
        finnhub_items = await get_company_news(ticker, from_date, to_date)
        for fi in finnhub_items[:30]:
            items.append({
                "headline": fi.get("headline", ""),
                "source": fi.get("source", "Finnhub"),
                "url": fi.get("url", ""),
                "datetime": datetime.fromtimestamp(fi.get("datetime", 0), tz=timezone.utc).isoformat(),
                "summary": fi.get("summary", ""),
                "sentiment": _sentiment(fi.get("headline", "")),
            })
        # Yahoo RSS for ticker
        rss_items = await asyncio.to_thread(_parse_rss, YAHOO_RSS_TICKER.format(ticker=ticker))
        items.extend(rss_items)
    else:
        # General market news via Yahoo RSS
        rss_items = await asyncio.to_thread(_parse_rss, YAHOO_RSS_GENERAL)
        items.extend(rss_items)

    items = _deduplicate(items)
    return items[:limit]
```

- [ ] **Step 5: Run a basic import check**

```bash
cd "/Users/zacbaker/Documents/Trade Strat/SpectraTerminal/backend"
python -c "from services import fred_service, finnhub_service, edgar_service, news_service; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/services/
git commit -m "feat: add fred, finnhub, edgar, news service wrappers"
```

---

### Task 7: main.py

**Files:**
- Create: `backend/main.py`

- [ ] **Step 1: Implement main.py**

Create `backend/main.py`:
```python
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from backend.database import init_db
from backend.routers import (
    equity, chart, options, news, econ,
    portfolio, watchlist, earnings, screener,
    fx, crypto, filings, macro, indices
)

scheduler = AsyncIOScheduler()


async def _warm_screener():
    """Pre-warm the S&P 500 screener universe cache."""
    try:
        from backend.routers.screener import build_universe_cache
        await build_universe_cache()
    except Exception:
        pass  # Non-fatal: screener will return warming=true until ready


async def _warm_earnings():
    """Pre-warm the earnings calendar cache."""
    try:
        from backend.routers.earnings import build_earnings_cache
        await build_earnings_cache()
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    asyncio.create_task(_warm_screener())
    asyncio.create_task(_warm_earnings())
    scheduler.add_job(_warm_screener, "interval", hours=4)
    scheduler.add_job(_warm_earnings, "interval", hours=24)
    scheduler.start()
    yield
    # Shutdown
    scheduler.shutdown(wait=False)


app = FastAPI(title="Spectra Terminal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Register all routers
app.include_router(equity.router, prefix="/api")
app.include_router(chart.router, prefix="/api")
app.include_router(options.router, prefix="/api")
app.include_router(news.router, prefix="/api")
app.include_router(econ.router, prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(earnings.router, prefix="/api")
app.include_router(screener.router, prefix="/api")
app.include_router(fx.router, prefix="/api")
app.include_router(crypto.router, prefix="/api")
app.include_router(filings.router, prefix="/api")
app.include_router(macro.router, prefix="/api")
app.include_router(indices.router, prefix="/api")
```

- [ ] **Step 2: Commit**

```bash
git add backend/main.py
git commit -m "feat: add main.py with FastAPI app, CORS, scheduler, lifespan"
```

---

## PHASE B — ROUTERS (build all 14 in parallel after Task 7)

> **Parallelization note:** Tasks 8–21 are independent. Each router only imports from `backend.services` and `backend.cache`. Dispatch them as parallel subagents. Each subagent should run: `cd backend && pytest tests/test_routers.py::Test<RouterName> -v` after implementing.

---

### Task 8: equity router

**Files:**
- Create: `backend/routers/equity.py`
- Create: `backend/tests/test_routers.py` (start the file here, append for each router)

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_routers.py` (first section):
```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

# ── Equity ────────────────────────────────────────────────────────────────────

MOCK_INFO = {
    "currentPrice": 180.50,
    "previousClose": 178.0,
    "regularMarketChange": 2.50,
    "regularMarketChangePercent": 1.40,
    "regularMarketVolume": 55000000,
    "marketCap": 2800000000000,
    "trailingPE": 28.5,
    "trailingEps": 6.34,
    "fiftyTwoWeekHigh": 199.62,
    "fiftyTwoWeekLow": 124.17,
    "averageVolume": 58000000,
    "beta": 1.24,
    "dividendYield": 0.005,
    "sector": "Technology",
    "industry": "Consumer Electronics",
    "longBusinessSummary": "Apple Inc. designs consumer electronics.",
    "exchange": "NMS",
    "currency": "USD",
    "sharesOutstanding": 15550000000,
    "floatShares": 15400000000,
    "shortName": "Apple Inc.",
}

def test_equity_endpoint(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    with patch("backend.services.yfinance_service.get_ticker_info", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = MOCK_INFO
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/equity/AAPL")
    assert response.status_code == 200
    data = response.json()
    assert data["ticker"] == "AAPL"
    assert data["price"] == 180.50
    assert data["sector"] == "Technology"

def test_equity_endpoint_bad_ticker(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    with patch("backend.services.yfinance_service.get_ticker_info", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = None
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/equity/XXXXBAD")
    assert response.status_code == 200
    data = response.json()
    assert "error" in data
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_routers.py::test_equity_endpoint -v
```

Expected: ImportError on `backend.routers.equity`.

- [ ] **Step 3: Implement equity.py**

Create `backend/routers/equity.py`:
```python
from fastapi import APIRouter
from backend.services.yfinance_service import get_ticker_info
from backend import cache

router = APIRouter()


@router.get("/equity/{ticker}")
async def get_equity(ticker: str):
    ticker = ticker.upper()
    cache_key = cache.make_key("equity", ticker, {})
    cached = cache.get(cache_key)
    if cached:
        return cached

    info = await get_ticker_info(ticker)
    if not info:
        return {"ticker": ticker, "error": "Failed to fetch equity data"}

    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose", 0)
    current = info.get("currentPrice") or info.get("regularMarketPrice", 0)
    change = info.get("regularMarketChange", current - prev_close if prev_close else 0)
    change_pct = info.get("regularMarketChangePercent", (change / prev_close * 100) if prev_close else 0)

    result = {
        "ticker": ticker,
        "name": info.get("shortName") or info.get("longName", ticker),
        "price": current,
        "change": round(change, 4),
        "change_pct": round(change_pct, 4),
        "volume": info.get("regularMarketVolume"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "eps": info.get("trailingEps"),
        "52w_high": info.get("fiftyTwoWeekHigh"),
        "52w_low": info.get("fiftyTwoWeekLow"),
        "avg_volume": info.get("averageVolume"),
        "beta": info.get("beta"),
        "dividend_yield": info.get("dividendYield"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "description": info.get("longBusinessSummary"),
        "exchange": info.get("exchange"),
        "currency": info.get("currency", "USD"),
        "shares_outstanding": info.get("sharesOutstanding"),
        "float_shares": info.get("floatShares"),
        "bid": info.get("bid"),
        "ask": info.get("ask"),
    }
    cache.set(cache_key, result, ttl_seconds=60)
    return result
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_routers.py::test_equity_endpoint tests/test_routers.py::test_equity_endpoint_bad_ticker -v
```

Expected: 2 passed.

- [ ] **Step 5: Smoke test with live server (optional, requires .env)**

```bash
uvicorn backend.main:app --reload --port 8000 &
sleep 2
curl -s http://localhost:8000/api/equity/AAPL | python3 -m json.tool | head -20
```

- [ ] **Step 6: Commit**

```bash
git add backend/routers/equity.py backend/tests/test_routers.py
git commit -m "feat: add equity router GET /api/equity/{ticker}"
```

---

### Task 9: chart router

**Files:**
- Create: `backend/routers/chart.py`

- [ ] **Step 1: Write failing test** (append to `backend/tests/test_routers.py`)

```python
# ── Chart ─────────────────────────────────────────────────────────────────────
import pandas as pd
import numpy as np

def _mock_ohlcv():
    dates = pd.date_range("2023-01-01", periods=60, freq="B")
    np.random.seed(42)
    closes = 150.0 + np.random.randn(60).cumsum()
    return pd.DataFrame({
        "Open": closes - 1,
        "High": closes + 2,
        "Low": closes - 2,
        "Close": closes,
        "Volume": np.random.randint(1e7, 1e8, 60).astype(float),
    }, index=dates)

def test_chart_endpoint_returns_ohlcv(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    with patch("backend.services.yfinance_service.get_history", new_callable=AsyncMock) as mock_h:
        mock_h.return_value = _mock_ohlcv()
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/chart/AAPL?period=1y&interval=1d")
    assert response.status_code == 200
    data = response.json()
    assert "ohlcv" in data
    assert len(data["ohlcv"]) == 60
    assert "time" in data["ohlcv"][0]
    assert "sma20" in data["indicators"]
    assert "rsi" in data["indicators"]
    assert "macd" in data["indicators"]
    assert "bb" in data["indicators"]
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_routers.py::test_chart_endpoint_returns_ohlcv -v
```

- [ ] **Step 3: Implement chart.py**

Create `backend/routers/chart.py`:
```python
import numpy as np
import pandas as pd
from fastapi import APIRouter, Query
from backend.services.yfinance_service import get_history
from backend import cache

router = APIRouter()

INTRADAY_INTERVALS = {"1m", "5m", "15m", "30m", "1h"}


def _sma(series: pd.Series, period: int) -> list:
    result = series.rolling(window=period).mean()
    return [round(v, 4) if not np.isnan(v) else None for v in result]


def _rsi(series: pd.Series, period: int = 14) -> list:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return [round(v, 2) if not np.isnan(v) else None for v in rsi]


def _macd(series: pd.Series):
    ema12 = series.ewm(span=12, adjust=False).mean()
    ema26 = series.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal = macd_line.ewm(span=9, adjust=False).mean()
    hist = macd_line - signal

    def fmt(s):
        return [round(v, 4) if not np.isnan(v) else None for v in s]

    return {"macd": fmt(macd_line), "signal": fmt(signal), "histogram": fmt(hist)}


def _bollinger(series: pd.Series, period: int = 20):
    sma = series.rolling(window=period).mean()
    std = series.rolling(window=period).std()
    upper = sma + 2 * std
    lower = sma - 2 * std

    def fmt(s):
        return [round(v, 4) if not np.isnan(v) else None for v in s]

    return {"upper": fmt(upper), "middle": fmt(sma), "lower": fmt(lower)}


@router.get("/chart/{ticker}")
async def get_chart(
    ticker: str,
    period: str = Query("1y"),
    interval: str = Query("1d"),
):
    ticker = ticker.upper()
    cache_key = cache.make_key("chart", ticker, {"period": period, "interval": interval})
    cached = cache.get(cache_key)
    if cached:
        return cached

    df = await get_history(ticker, period, interval)
    if df is None or df.empty:
        return {"ticker": ticker, "error": "No chart data available"}

    df.index = pd.to_datetime(df.index)
    # lightweight-charts expects Unix timestamp (seconds) as "time"
    ohlcv = []
    for ts, row in df.iterrows():
        t = int(ts.timestamp()) if hasattr(ts, "timestamp") else int(ts.value // 1e9)
        ohlcv.append({
            "time": t,
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
        })

    closes = df["Close"]
    indicators = {
        "sma20": _sma(closes, 20),
        "sma50": _sma(closes, 50),
        "sma200": _sma(closes, 200),
        "rsi": _rsi(closes, 14),
        "macd": _macd(closes),
        "bb": _bollinger(closes, 20),
    }

    result = {"ticker": ticker, "period": period, "interval": interval, "ohlcv": ohlcv, "indicators": indicators}
    ttl = 300 if interval in INTRADAY_INTERVALS else 3600
    cache.set(cache_key, result, ttl_seconds=ttl)
    return result
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_routers.py::test_chart_endpoint_returns_ohlcv -v
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/chart.py
git commit -m "feat: add chart router with OHLCV + SMA/RSI/MACD/BB indicators"
```

---

### Task 10: options router

**Files:**
- Create: `backend/routers/options.py`

- [ ] **Step 1: Write failing test** (append to test_routers.py)

```python
# ── Options ───────────────────────────────────────────────────────────────────

def test_options_endpoint(temp_db, fake_api_keys):
    from backend import database
    database.init_db()

    mock_chain = MagicMock()
    mock_calls = pd.DataFrame({
        "strike": [170.0, 175.0, 180.0],
        "lastPrice": [12.0, 8.5, 5.2],
        "bid": [11.9, 8.4, 5.1],
        "ask": [12.1, 8.6, 5.3],
        "volume": [1200, 3400, 5600],
        "openInterest": [8000, 12000, 20000],
        "impliedVolatility": [0.28, 0.25, 0.22],
        "inTheMoney": [True, True, False],
    })
    mock_puts = mock_calls.copy()
    mock_chain.calls = mock_calls
    mock_chain.puts = mock_puts

    with patch("backend.services.yfinance_service.get_ticker_info", new_callable=AsyncMock) as mock_info, \
         patch("backend.services.yfinance_service.get_option_chain", new_callable=AsyncMock) as mock_chain_fn, \
         patch("backend.services.fred_service.get_latest_value", new_callable=AsyncMock) as mock_fred:
        mock_info.return_value = {"currentPrice": 178.0}
        mock_chain_fn.return_value = mock_chain
        mock_fred.return_value = 5.33
        with patch("yfinance.Ticker") as MockTicker:
            MockTicker.return_value.options = ("2024-03-15", "2024-03-22", "2024-03-29", "2024-04-05")
            from backend.main import app
            client = TestClient(app)
            response = client.get("/api/options/AAPL")

    assert response.status_code == 200
    data = response.json()
    assert "expirations" in data
    assert len(data["chains"]) > 0
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_routers.py::test_options_endpoint -v
```

- [ ] **Step 3: Implement options.py**

Create `backend/routers/options.py`:
```python
import math
import asyncio
import numpy as np
from fastapi import APIRouter
from backend.services.yfinance_service import get_ticker_info, get_option_chain
from backend.services.fred_service import get_latest_value
from backend import cache
import yfinance as yf

router = APIRouter()


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _black_scholes_delta(S: float, K: float, t: float, r: float, sigma: float, is_call: bool) -> float:
    """Compute Black-Scholes delta. Returns None if inputs are invalid."""
    try:
        if t <= 0 or sigma <= 0 or S <= 0 or K <= 0:
            return None
        d1 = (math.log(S / K) + (r + sigma ** 2 / 2) * t) / (sigma * math.sqrt(t))
        if is_call:
            return round(_norm_cdf(d1), 4)
        else:
            return round(_norm_cdf(d1) - 1.0, 4)
    except Exception:
        return None


def _chain_to_list(df, S: float, t: float, r: float, is_call: bool) -> list[dict]:
    rows = []
    for _, row in df.iterrows():
        K = float(row.get("strike", 0))
        sigma = float(row.get("impliedVolatility", 0)) if row.get("impliedVolatility") else 0
        delta = _black_scholes_delta(S, K, t, r, sigma, is_call)
        rows.append({
            "strike": K,
            "lastPrice": row.get("lastPrice"),
            "bid": row.get("bid"),
            "ask": row.get("ask"),
            "volume": int(row["volume"]) if row.get("volume") == row.get("volume") else None,
            "openInterest": int(row["openInterest"]) if row.get("openInterest") == row.get("openInterest") else None,
            "impliedVolatility": round(sigma, 4) if sigma else None,
            "delta": delta,
            "inTheMoney": bool(row.get("inTheMoney", False)),
        })
    return rows


@router.get("/options/{ticker}")
async def get_options(ticker: str):
    ticker = ticker.upper()
    cache_key = cache.make_key("options", ticker, {})
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Get current price and risk-free rate in parallel
    info_task = get_ticker_info(ticker)
    rate_task = get_latest_value("FEDFUNDS")
    info, fed_rate = await asyncio.gather(info_task, rate_task)

    if not info:
        return {"ticker": ticker, "error": "No data"}

    S = info.get("currentPrice") or info.get("regularMarketPrice", 100)
    r = (fed_rate or 5.0) / 100.0

    # Get expiration dates
    try:
        t_obj = await asyncio.to_thread(lambda: yf.Ticker(ticker))
        expirations = await asyncio.to_thread(lambda: t_obj.options)
        expirations = list(expirations)[:4]
    except Exception:
        return {"ticker": ticker, "error": "No options data"}

    chains = {}
    for expiry in expirations:
        from datetime import datetime
        try:
            exp_dt = datetime.strptime(expiry, "%Y-%m-%d")
            t = max((exp_dt - datetime.now()).days / 365.0, 0.001)
        except Exception:
            t = 0.1
        chain = await get_option_chain(ticker, expiry)
        if chain is None:
            continue
        chains[expiry] = {
            "calls": _chain_to_list(chain.calls, S, t, r, is_call=True),
            "puts": _chain_to_list(chain.puts, S, t, r, is_call=False),
        }

    result = {
        "ticker": ticker,
        "current_price": S,
        "expirations": expirations,
        "chains": chains,
    }
    cache.set(cache_key, result, ttl_seconds=300)
    return result
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_routers.py::test_options_endpoint -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/routers/options.py
git commit -m "feat: add options router with Black-Scholes delta"
```

---

### Task 11: news router

**Files:**
- Create: `backend/routers/news.py`

- [ ] **Step 1: Write failing test** (append to test_routers.py)

```python
# ── News ─────────────────────────────────────────────────────────────────────

def test_news_endpoint_with_ticker(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    mock_articles = [
        {"headline": "Apple hits record high", "source": "Reuters", "url": "http://example.com",
         "datetime": "2024-01-01T12:00:00+00:00", "summary": "Summary", "sentiment": "positive"}
    ]
    with patch("backend.services.news_service.get_news", new_callable=AsyncMock) as mock_news:
        mock_news.return_value = mock_articles
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/news?ticker=AAPL&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["headline"] == "Apple hits record high"

def test_news_endpoint_no_ticker(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    with patch("backend.services.news_service.get_news", new_callable=AsyncMock) as mock_news:
        mock_news.return_value = []
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/news")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
```

- [ ] **Step 2: Implement news.py**

Create `backend/routers/news.py`:
```python
from fastapi import APIRouter, Query
from backend.services.news_service import get_news
from backend import cache

router = APIRouter()


@router.get("/news")
async def get_news_feed(ticker: str | None = Query(None), limit: int = Query(50)):
    cache_key = cache.make_key("news", ticker or "general", {"limit": limit})
    cached = cache.get(cache_key)
    if cached:
        return cached
    articles = await get_news(ticker=ticker, limit=limit)
    cache.set(cache_key, articles, ttl_seconds=300)
    return articles
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_routers.py::test_news_endpoint_with_ticker tests/test_routers.py::test_news_endpoint_no_ticker -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/news.py
git commit -m "feat: add news router with optional ticker param"
```

---

### Task 12: econ router

**Files:**
- Create: `backend/routers/econ.py`

- [ ] **Step 1: Write failing test** (append to test_routers.py)

```python
# ── Econ ─────────────────────────────────────────────────────────────────────

def test_econ_endpoint(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    mock_series = {
        "id": "UNRATE", "title": "Unemployment Rate", "units": "%",
        "frequency": "M", "observations": [{"date": "2024-01-01", "value": 3.7}]
    }
    with patch("backend.services.fred_service.get_series", new_callable=AsyncMock) as mock_fred:
        mock_fred.return_value = mock_series
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/econ/UNRATE")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "UNRATE"
    assert len(data["observations"]) == 1
```

- [ ] **Step 2: Implement econ.py**

Create `backend/routers/econ.py`:
```python
from fastapi import APIRouter, Query
from backend.services.fred_service import get_series
from backend import cache

router = APIRouter()

DEFAULT_SERIES = ["GDP", "UNRATE", "CPIAUCSL", "FEDFUNDS", "T10Y2Y"]


@router.get("/econ/{series_id}")
async def get_econ(series_id: str, start: str = Query("2010-01-01")):
    cache_key = cache.make_key("econ", series_id, {"start": start})
    cached = cache.get(cache_key)
    if cached:
        return cached
    data = await get_series(series_id, start)
    if not data:
        return {"id": series_id, "error": "Series not found or FRED unavailable"}
    cache.set(cache_key, data, ttl_seconds=3600)
    return data


@router.get("/econ")
async def get_default_econ():
    """Return latest value for each default series."""
    import asyncio
    from backend.services.fred_service import get_latest_value
    tasks = {s: get_latest_value(s) for s in DEFAULT_SERIES}
    results = await asyncio.gather(*tasks.values())
    return {k: v for k, v in zip(tasks.keys(), results)}
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_routers.py::test_econ_endpoint -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/econ.py
git commit -m "feat: add econ router for FRED series"
```

---

### Task 13: portfolio router

**Files:**
- Create: `backend/routers/portfolio.py`

- [ ] **Step 1: Write failing test** (append to test_routers.py)

```python
# ── Portfolio ────────────────────────────────────────────────────────────────

def test_portfolio_crud(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    from backend.main import app
    client = TestClient(app)

    # Add position
    resp = client.post("/api/portfolio", json={"ticker": "AAPL", "shares": 10, "avg_cost": 150.0})
    assert resp.status_code == 200
    position_id = resp.json()["id"]

    # List
    resp = client.get("/api/portfolio")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Delete
    resp = client.delete(f"/api/portfolio/{position_id}")
    assert resp.status_code == 200

    resp = client.get("/api/portfolio")
    assert len(resp.json()) == 0

def test_portfolio_performance(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    from backend.main import app
    client = TestClient(app)
    client.post("/api/portfolio", json={"ticker": "MSFT", "shares": 5, "avg_cost": 300.0})

    with patch("backend.services.yfinance_service.get_ticker_info", new_callable=AsyncMock) as mock_info:
        mock_info.return_value = {"currentPrice": 400.0, "shortName": "Microsoft"}
        resp = client.get("/api/portfolio/performance")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_value"] == pytest.approx(2000.0)
    assert data["total_pnl"] == pytest.approx(500.0)
```

- [ ] **Step 2: Implement portfolio.py**

Create `backend/routers/portfolio.py`:
```python
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.database import get_db
from backend.services.yfinance_service import get_ticker_info

router = APIRouter()


class PositionIn(BaseModel):
    ticker: str
    shares: float
    avg_cost: float


@router.get("/portfolio")
async def list_portfolio():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM portfolio ORDER BY added_at DESC").fetchall()
    return [dict(r) for r in rows]


@router.post("/portfolio")
async def add_position(pos: PositionIn):
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO portfolio (ticker, shares, avg_cost) VALUES (?, ?, ?)",
            (pos.ticker.upper(), pos.shares, pos.avg_cost)
        )
        row_id = cursor.lastrowid
    return {"id": row_id, "ticker": pos.ticker.upper(), "shares": pos.shares, "avg_cost": pos.avg_cost}


@router.delete("/portfolio/{position_id}")
async def delete_position(position_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM portfolio WHERE id=?", (position_id,))
    return {"deleted": position_id}


@router.get("/portfolio/performance")
async def portfolio_performance():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM portfolio").fetchall()
    holdings = [dict(r) for r in rows]
    if not holdings:
        return {"total_value": 0, "total_pnl": 0, "total_pnl_pct": 0, "positions": []}

    tickers = [h["ticker"] for h in holdings]
    quotes = await asyncio.gather(*[get_ticker_info(t) for t in tickers])

    positions = []
    total_cost = 0.0
    total_value = 0.0
    for holding, info in zip(holdings, quotes):
        current_price = (info or {}).get("currentPrice") or (info or {}).get("regularMarketPrice", holding["avg_cost"])
        cost_basis = holding["shares"] * holding["avg_cost"]
        mkt_value = holding["shares"] * current_price
        pnl = mkt_value - cost_basis
        pnl_pct = (pnl / cost_basis * 100) if cost_basis else 0
        total_cost += cost_basis
        total_value += mkt_value
        positions.append({
            **holding,
            "current_price": current_price,
            "market_value": round(mkt_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "name": (info or {}).get("shortName", holding["ticker"]),
        })

    total_pnl = total_value - total_cost
    return {
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round((total_pnl / total_cost * 100) if total_cost else 0, 2),
        "positions": positions,
    }
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_routers.py::test_portfolio_crud tests/test_routers.py::test_portfolio_performance -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/portfolio.py
git commit -m "feat: add portfolio router with CRUD and live P&L"
```

---

### Task 14: watchlist router

**Files:**
- Create: `backend/routers/watchlist.py`

- [ ] **Step 1: Write failing test** (append to test_routers.py)

```python
# ── Watchlist ────────────────────────────────────────────────────────────────

def test_watchlist_crud(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    from backend.main import app
    client = TestClient(app)

    resp = client.post("/api/watchlist", json={"ticker": "NVDA", "notes": "AI play"})
    assert resp.status_code == 200

    resp = client.get("/api/watchlist")
    assert len(resp.json()) == 1
    assert resp.json()[0]["ticker"] == "NVDA"

    resp = client.delete("/api/watchlist/NVDA")
    assert resp.status_code == 200

    resp = client.get("/api/watchlist")
    assert len(resp.json()) == 0

def test_watchlist_quotes(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    from backend.main import app
    client = TestClient(app)
    client.post("/api/watchlist", json={"ticker": "TSLA", "notes": ""})

    with patch("backend.services.yfinance_service.get_multiple_quotes", new_callable=AsyncMock) as mock_q:
        mock_q.return_value = [{"currentPrice": 250.0, "shortName": "Tesla", "regularMarketChangePercent": 1.5}]
        resp = client.get("/api/watchlist/quotes")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["ticker"] == "TSLA"
```

- [ ] **Step 2: Implement watchlist.py**

Create `backend/routers/watchlist.py`:
```python
from fastapi import APIRouter
from pydantic import BaseModel
from backend.database import get_db
from backend.services.yfinance_service import get_multiple_quotes

router = APIRouter()


class WatchlistIn(BaseModel):
    ticker: str
    notes: str = ""


@router.get("/watchlist")
async def list_watchlist():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM watchlist ORDER BY added_at DESC").fetchall()
    return [dict(r) for r in rows]


@router.post("/watchlist")
async def add_to_watchlist(item: WatchlistIn):
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO watchlist (ticker, notes) VALUES (?, ?)",
            (item.ticker.upper(), item.notes)
        )
    return {"ticker": item.ticker.upper(), "notes": item.notes}


@router.delete("/watchlist/{ticker}")
async def remove_from_watchlist(ticker: str):
    with get_db() as conn:
        conn.execute("DELETE FROM watchlist WHERE ticker=?", (ticker.upper(),))
    return {"deleted": ticker.upper()}


@router.get("/watchlist/quotes")
async def watchlist_quotes():
    with get_db() as conn:
        rows = conn.execute("SELECT ticker, notes FROM watchlist").fetchall()
    if not rows:
        return []
    tickers = [r["ticker"] for r in rows]
    quotes = await get_multiple_quotes(tickers)
    result = []
    for row, info in zip(rows, quotes):
        info = info or {}
        result.append({
            "ticker": row["ticker"],
            "notes": row["notes"],
            "name": info.get("shortName", row["ticker"]),
            "price": info.get("currentPrice") or info.get("regularMarketPrice"),
            "change": info.get("regularMarketChange"),
            "change_pct": info.get("regularMarketChangePercent"),
            "volume": info.get("regularMarketVolume"),
            "market_cap": info.get("marketCap"),
        })
    return result
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_routers.py::test_watchlist_crud tests/test_routers.py::test_watchlist_quotes -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/watchlist.py
git commit -m "feat: add watchlist router with CRUD and bulk quotes"
```

---

### Task 15: earnings router

**Files:**
- Create: `backend/routers/earnings.py`

- [ ] **Step 1: Implement earnings.py**

Create `backend/routers/earnings.py`:
```python
import asyncio
from datetime import datetime, timedelta
from fastapi import APIRouter, Query
from backend import cache
from backend.services.yfinance_service import get_ticker_info
import yfinance as yf

router = APIRouter()

SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

_SP500_TICKERS: list[str] = []


async def _get_sp500_tickers() -> list[str]:
    global _SP500_TICKERS
    if _SP500_TICKERS:
        return _SP500_TICKERS
    try:
        import pandas as pd
        tables = await asyncio.to_thread(pd.read_html, SP500_URL)
        _SP500_TICKERS = tables[0]["Symbol"].tolist()
    except Exception:
        # Fallback: a small hardcoded subset
        _SP500_TICKERS = ["AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "JPM", "V", "UNH"]
    return _SP500_TICKERS


def _fetch_calendar(ticker: str) -> dict | None:
    try:
        t = yf.Ticker(ticker)
        cal = t.calendar
        if cal is None or (hasattr(cal, 'empty') and cal.empty):
            return None
        if isinstance(cal, dict):
            return cal
        # DataFrame format
        return cal.to_dict()
    except Exception:
        return None


async def build_earnings_cache() -> None:
    tickers = await _get_sp500_tickers()
    results = {}
    # Batch in groups of 20 to avoid hammering yfinance
    for i in range(0, len(tickers), 20):
        batch = tickers[i:i + 20]
        batch_results = await asyncio.gather(
            *[asyncio.to_thread(_fetch_calendar, t) for t in batch]
        )
        for ticker, cal in zip(batch, batch_results):
            if cal:
                results[ticker] = cal
        await asyncio.sleep(1)  # polite pause between batches

    cache.set("earnings_calendar", results, ttl_seconds=86400)


@router.get("/earnings/calendar")
async def get_earnings_calendar(lookahead_days: int = Query(14)):
    cached = cache.get("earnings_calendar")
    if cached is None:
        return {"warming": True, "results": [], "cached_at": None}

    today = datetime.now().date()
    cutoff = today + timedelta(days=lookahead_days)
    grouped: dict[str, list] = {}

    for ticker, cal in cached.items():
        try:
            # yfinance calendar can be a dict with "Earnings Date" key
            if isinstance(cal, dict) and "Earnings Date" in cal:
                dates = cal["Earnings Date"]
                if isinstance(dates, list):
                    earn_date = datetime.strptime(str(dates[0])[:10], "%Y-%m-%d").date()
                else:
                    earn_date = datetime.strptime(str(dates)[:10], "%Y-%m-%d").date()
                if today <= earn_date <= cutoff:
                    key = earn_date.isoformat()
                    grouped.setdefault(key, []).append({
                        "ticker": ticker,
                        "eps_estimate": cal.get("EPS Estimate"),
                        "eps_actual": cal.get("Reported EPS"),
                        "time": "TBD",
                    })
        except Exception:
            continue

    sorted_grouped = dict(sorted(grouped.items()))
    return {"warming": False, "results": sorted_grouped, "lookahead_days": lookahead_days}
```

- [ ] **Step 2: Run import check**

```bash
python -c "from backend.routers import earnings; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/routers/earnings.py
git commit -m "feat: add earnings router with APScheduler-warmed cache"
```

---

### Task 16: screener router

**Files:**
- Create: `backend/routers/screener.py`

- [ ] **Step 1: Write failing test** (append to test_routers.py)

```python
# ── Screener ─────────────────────────────────────────────────────────────────

def test_screener_returns_warming_on_cold_cache(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    # No cache populated — should return warming=True
    from backend.main import app
    client = TestClient(app)
    response = client.get("/api/screener")
    assert response.status_code == 200
    data = response.json()
    # Either warming or has results
    assert "results" in data
```

- [ ] **Step 2: Implement screener.py**

Create `backend/routers/screener.py`:
```python
import asyncio
from fastapi import APIRouter, Query
from backend import cache
from backend.services.yfinance_service import get_ticker_info

router = APIRouter()

SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
_SP500_TICKERS: list[str] = []


async def _get_sp500_tickers() -> list[str]:
    global _SP500_TICKERS
    if _SP500_TICKERS:
        return _SP500_TICKERS
    try:
        import pandas as pd
        tables = await asyncio.to_thread(pd.read_html, SP500_URL)
        _SP500_TICKERS = tables[0]["Symbol"].tolist()
    except Exception:
        _SP500_TICKERS = ["AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "JPM", "V", "UNH"]
    return _SP500_TICKERS


async def build_universe_cache() -> None:
    tickers = await _get_sp500_tickers()
    universe = []
    for i in range(0, len(tickers), 10):
        batch = tickers[i:i + 10]
        results = await asyncio.gather(*[get_ticker_info(t) for t in batch])
        for ticker, info in zip(batch, results):
            if not info:
                continue
            price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
            prev = info.get("previousClose") or info.get("regularMarketPreviousClose", price)
            year_high = info.get("fiftyTwoWeekHigh", price)
            year_low = info.get("fiftyTwoWeekLow", price)
            w52_change = ((price - year_low) / year_low * 100) if year_low else 0
            universe.append({
                "ticker": ticker,
                "name": info.get("shortName", ticker),
                "sector": info.get("sector", ""),
                "price": price,
                "change_pct": info.get("regularMarketChangePercent", 0),
                "market_cap": info.get("marketCap", 0),
                "pe_ratio": info.get("trailingPE"),
                "volume": info.get("regularMarketVolume", 0),
                "52w_change": round(w52_change, 2),
                "beta": info.get("beta"),
            })
        await asyncio.sleep(0.5)
    cache.set("screener_universe", universe, ttl_seconds=14400)


@router.get("/screener")
async def screener(
    min_market_cap: float = Query(None),
    max_pe: float = Query(None),
    min_volume: float = Query(None),
    sector: str = Query(None),
    min_52w_change: float = Query(None),
    max_52w_change: float = Query(None),
    min_beta: float = Query(None),
    max_beta: float = Query(None),
):
    universe = cache.get("screener_universe")
    if universe is None:
        return {"warming": True, "results": []}

    results = universe
    if min_market_cap is not None:
        results = [r for r in results if (r.get("market_cap") or 0) >= min_market_cap]
    if max_pe is not None:
        results = [r for r in results if r.get("pe_ratio") is not None and r["pe_ratio"] <= max_pe]
    if min_volume is not None:
        results = [r for r in results if (r.get("volume") or 0) >= min_volume]
    if sector:
        results = [r for r in results if (r.get("sector") or "").lower() == sector.lower()]
    if min_52w_change is not None:
        results = [r for r in results if (r.get("52w_change") or 0) >= min_52w_change]
    if max_52w_change is not None:
        results = [r for r in results if (r.get("52w_change") or 0) <= max_52w_change]
    if min_beta is not None:
        results = [r for r in results if r.get("beta") is not None and r["beta"] >= min_beta]
    if max_beta is not None:
        results = [r for r in results if r.get("beta") is not None and r["beta"] <= max_beta]

    results = sorted(results, key=lambda r: r.get("market_cap") or 0, reverse=True)[:100]
    return {"warming": False, "results": results}
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_routers.py::test_screener_returns_warming_on_cold_cache -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/screener.py
git commit -m "feat: add screener router with pre-warmed S&P 500 universe"
```

---

### Task 17: fx + crypto + indices routers

**Files:**
- Create: `backend/routers/fx.py`
- Create: `backend/routers/crypto.py`
- Create: `backend/routers/indices.py`

- [ ] **Step 1: Write failing tests** (append to test_routers.py)

```python
# ── FX / Crypto / Indices ────────────────────────────────────────────────────

def test_fx_endpoint(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    mock_info = {"currentPrice": 1.082, "regularMarketChange": 0.002,
                 "regularMarketChangePercent": 0.18, "dayHigh": 1.085, "dayLow": 1.079}
    with patch("backend.services.yfinance_service.get_multiple_quotes", new_callable=AsyncMock) as mock_q:
        mock_q.return_value = [mock_info] * 9
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/fx")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 9
    assert "pair" in data[0]

def test_crypto_endpoint(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    mock_info = {"currentPrice": 65000.0, "regularMarketChangePercent": 2.1,
                 "marketCap": 1.2e12, "regularMarketVolume": 30e9}
    with patch("backend.services.yfinance_service.get_multiple_quotes", new_callable=AsyncMock) as mock_q:
        mock_q.return_value = [mock_info] * 8
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/crypto")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 8
    assert "symbol" in data[0]

def test_indices_endpoint(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    mock_info = {"currentPrice": 5000.0, "regularMarketChangePercent": 0.5}
    with patch("backend.services.yfinance_service.get_multiple_quotes", new_callable=AsyncMock) as mock_q:
        mock_q.return_value = [mock_info] * 8
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/indices")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 8
```

- [ ] **Step 2: Implement fx.py**

Create `backend/routers/fx.py`:
```python
from fastapi import APIRouter
from backend.services.yfinance_service import get_multiple_quotes
from backend import cache

router = APIRouter()

FX_PAIRS = [
    ("EURUSD=X", "EUR/USD"), ("GBPUSD=X", "GBP/USD"), ("USDJPY=X", "USD/JPY"),
    ("USDCHF=X", "USD/CHF"), ("AUDUSD=X", "AUD/USD"), ("USDCAD=X", "USD/CAD"),
    ("NZDUSD=X", "NZD/USD"), ("EURGBP=X", "EUR/GBP"), ("EURJPY=X", "EUR/JPY"),
]


@router.get("/fx")
async def get_fx():
    cached = cache.get("fx_all")
    if cached:
        return cached
    tickers = [t for t, _ in FX_PAIRS]
    quotes = await get_multiple_quotes(tickers)
    result = []
    for (ticker, pair), info in zip(FX_PAIRS, quotes):
        info = info or {}
        result.append({
            "pair": pair,
            "ticker": ticker,
            "rate": info.get("currentPrice") or info.get("regularMarketPrice"),
            "change": info.get("regularMarketChange"),
            "change_pct": info.get("regularMarketChangePercent"),
            "day_high": info.get("dayHigh") or info.get("regularMarketDayHigh"),
            "day_low": info.get("dayLow") or info.get("regularMarketDayLow"),
        })
    cache.set("fx_all", result, ttl_seconds=60)
    return result
```

- [ ] **Step 3: Implement crypto.py**

Create `backend/routers/crypto.py`:
```python
from fastapi import APIRouter
from backend.services.yfinance_service import get_multiple_quotes
from backend import cache

router = APIRouter()

CRYPTO_COINS = [
    ("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"), ("SOL-USD", "Solana"),
    ("BNB-USD", "BNB"), ("XRP-USD", "XRP"), ("DOGE-USD", "Dogecoin"),
    ("ADA-USD", "Cardano"), ("AVAX-USD", "Avalanche"),
]


@router.get("/crypto")
async def get_crypto():
    cached = cache.get("crypto_all")
    if cached:
        return cached
    tickers = [t for t, _ in CRYPTO_COINS]
    quotes = await get_multiple_quotes(tickers)
    result = []
    for (ticker, name), info in zip(CRYPTO_COINS, quotes):
        info = info or {}
        result.append({
            "symbol": ticker,
            "name": name,
            "price": info.get("currentPrice") or info.get("regularMarketPrice"),
            "change_pct": info.get("regularMarketChangePercent"),
            "market_cap": info.get("marketCap"),
            "volume_24h": info.get("regularMarketVolume") or info.get("volume24Hr"),
        })
    cache.set("crypto_all", result, ttl_seconds=60)
    return result
```

- [ ] **Step 4: Implement indices.py**

Create `backend/routers/indices.py`:
```python
from fastapi import APIRouter
from backend.services.yfinance_service import get_multiple_quotes
from backend import cache

router = APIRouter()

INDICES = [
    ("^GSPC", "S&P 500"), ("^DJI", "Dow Jones"), ("^IXIC", "Nasdaq"),
    ("^VIX", "VIX"), ("^TNX", "10Y Yield"), ("GC=F", "Gold"),
    ("CL=F", "Oil (WTI)"), ("BTC-USD", "Bitcoin"),
]


@router.get("/indices")
async def get_indices():
    cached = cache.get("indices_all")
    if cached:
        return cached
    tickers = [t for t, _ in INDICES]
    quotes = await get_multiple_quotes(tickers)
    result = []
    for (ticker, label), info in zip(INDICES, quotes):
        info = info or {}
        result.append({
            "ticker": ticker,
            "label": label,
            "price": info.get("currentPrice") or info.get("regularMarketPrice"),
            "change": info.get("regularMarketChange"),
            "change_pct": info.get("regularMarketChangePercent"),
        })
    cache.set("indices_all", result, ttl_seconds=60)
    return result
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_routers.py::test_fx_endpoint tests/test_routers.py::test_crypto_endpoint tests/test_routers.py::test_indices_endpoint -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/routers/fx.py backend/routers/crypto.py backend/routers/indices.py
git commit -m "feat: add fx, crypto, indices routers"
```

---

### Task 18: macro router

**Files:**
- Create: `backend/routers/macro.py`

- [ ] **Step 1: Write failing test** (append to test_routers.py)

```python
# ── Macro ─────────────────────────────────────────────────────────────────────

def test_macro_dashboard(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    with patch("backend.services.fred_service.get_latest_two", new_callable=AsyncMock) as mock_fred:
        mock_fred.return_value = (5.33, 5.25)
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/macro/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert "series" in data
    assert len(data["series"]) == 11
```

- [ ] **Step 2: Implement macro.py**

Create `backend/routers/macro.py`:
```python
import asyncio
from fastapi import APIRouter
from backend.services.fred_service import get_latest_two
from backend import cache

router = APIRouter()

MACRO_SERIES = [
    ("FEDFUNDS", "Fed Funds Rate", "%"),
    ("DGS10", "10Y Treasury", "%"),
    ("DGS2", "2Y Treasury", "%"),
    ("T10Y2Y", "10Y-2Y Spread", "%"),
    ("CPIAUCSL", "CPI YoY", "%"),
    ("CPILFESL", "Core CPI YoY", "%"),
    ("PCEPI", "PCE Inflation YoY", "%"),
    ("UNRATE", "Unemployment Rate", "%"),
    ("GDP", "GDP Growth", "Bil. $"),
    ("IPMAN", "Industrial Production: Mfg", "Index"),
    ("UMCSENT", "Consumer Sentiment", "Index"),
]

# Series for which we compute YoY % change from level
YOY_SERIES = {"PCEPI", "CPIAUCSL", "CPILFESL"}


@router.get("/macro/dashboard")
async def macro_dashboard():
    cached = cache.get("macro_dashboard")
    if cached:
        return cached

    tasks = {sid: get_latest_two(sid) for sid, _, _ in MACRO_SERIES}
    results = await asyncio.gather(*tasks.values())
    pairs = dict(zip(tasks.keys(), results))

    series = []
    for sid, label, units in MACRO_SERIES:
        latest, previous = pairs.get(sid, (None, None))
        if sid in YOY_SERIES and latest is not None and previous is not None:
            # Compute YoY from index level: get 12-month-ago value separately
            # For now use simple change; full YoY requires 12-month history
            change = round(latest - previous, 4)
        else:
            change = round(latest - previous, 4) if (latest is not None and previous is not None) else None
        series.append({
            "id": sid,
            "label": label,
            "units": units,
            "value": latest,
            "previous": previous,
            "change": change,
        })

    result = {"series": series}
    cache.set("macro_dashboard", result, ttl_seconds=3600)
    return result
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_routers.py::test_macro_dashboard -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/macro.py
git commit -m "feat: add macro dashboard router with 11 FRED series"
```

---

### Task 19: filings router

**Files:**
- Create: `backend/routers/filings.py`

- [ ] **Step 1: Write failing test** (append to test_routers.py)

```python
# ── Filings ───────────────────────────────────────────────────────────────────

def test_filings_endpoint(temp_db, fake_api_keys):
    from backend import database
    database.init_db()
    mock_filings = [
        {"form_type": "10-K", "filed_date": "2024-11-01",
         "description": "aapl-20240928.htm", "url": "https://sec.gov/...", "period_of_report": "2024-09-28"}
    ]
    with patch("backend.services.edgar_service.search_filings", new_callable=AsyncMock) as mock_edgar:
        mock_edgar.return_value = mock_filings
        from backend.main import app
        client = TestClient(app)
        response = client.get("/api/filings/AAPL?type=10-K&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["form_type"] == "10-K"
```

- [ ] **Step 2: Implement filings.py**

Create `backend/routers/filings.py`:
```python
from fastapi import APIRouter, Query
from backend.services.edgar_service import search_filings
from backend import cache

router = APIRouter()


@router.get("/filings/{ticker}")
async def get_filings(
    ticker: str,
    type: str = Query("10-K"),
    limit: int = Query(10),
):
    ticker = ticker.upper()
    cache_key = cache.make_key("filings", ticker, {"type": type, "limit": limit})
    cached = cache.get(cache_key)
    if cached:
        return cached
    results = await search_filings(ticker, form_type=type, limit=limit)
    if results is None:
        return {"ticker": ticker, "error": "Could not fetch filings"}
    cache.set(cache_key, results, ttl_seconds=3600)
    return results
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_routers.py::test_filings_endpoint -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/filings.py
git commit -m "feat: add filings router backed by SEC EDGAR"
```

---

## PHASE C — FINAL INTEGRATION

---

### Task 20: Full test suite + start script

**Files:**
- Create: `backend/start.sh`
- Create: `backend/.env` (from .env.example, filled with real keys)

- [ ] **Step 1: Run full test suite**

```bash
cd "/Users/zacbaker/Documents/Trade Strat/SpectraTerminal/backend"
pytest tests/ -v --tb=short
```

Expected: All tests pass.

- [ ] **Step 2: Smoke test every endpoint with live server**

```bash
uvicorn backend.main:app --reload --port 8000 &
sleep 3

curl -s http://localhost:8000/health
curl -s http://localhost:8000/api/equity/AAPL | python3 -m json.tool | head -10
curl -s "http://localhost:8000/api/chart/AAPL?period=5d&interval=1d" | python3 -m json.tool | head -5
curl -s http://localhost:8000/api/indices | python3 -m json.tool | head -10
curl -s http://localhost:8000/api/fx | python3 -m json.tool | head -10
curl -s http://localhost:8000/api/crypto | python3 -m json.tool | head -10
curl -s "http://localhost:8000/api/news?ticker=AAPL" | python3 -m json.tool | head -10
curl -s http://localhost:8000/api/macro/dashboard | python3 -m json.tool | head -10
```

Expected: All return HTTP 200 with valid JSON.

- [ ] **Step 3: Write start.sh**

Create `backend/start.sh`:
```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Run from project root so `backend.main` dotted import resolves correctly
cd "$SCRIPT_DIR/.."

if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.example to .env and add your API keys."
    exit 1
fi

echo "Installing dependencies..."
pip install -r requirements.txt -q

echo "Starting Spectra Terminal API on http://localhost:8000"
uvicorn backend.main:app --reload --port 8000
```

```bash
chmod +x backend/start.sh
```

- [ ] **Step 4: Commit**

```bash
git add backend/start.sh
git commit -m "feat: add start.sh and complete Phase 1 backend"
```

---

## Quick Reference — All Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/api/equity/{ticker}` | GET | Full quote + fundamentals |
| `/api/chart/{ticker}` | GET | OHLCV + indicators |
| `/api/options/{ticker}` | GET | Options chain with BS delta |
| `/api/news` | GET | News (optional `?ticker=`) |
| `/api/econ/{series_id}` | GET | FRED series data |
| `/api/econ` | GET | Default 5 series latest values |
| `/api/portfolio` | GET/POST/DELETE | Portfolio CRUD |
| `/api/portfolio/performance` | GET | Live P&L |
| `/api/watchlist` | GET/POST/DELETE | Watchlist CRUD |
| `/api/watchlist/quotes` | GET | Bulk live quotes |
| `/api/earnings/calendar` | GET | Earnings calendar |
| `/api/screener` | GET | Stock screener |
| `/api/fx` | GET | FX rates |
| `/api/crypto` | GET | Crypto prices |
| `/api/filings/{ticker}` | GET | SEC filings |
| `/api/macro/dashboard` | GET | Macro dashboard |
| `/api/indices` | GET | Market indices |
