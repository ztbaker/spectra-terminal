# DES Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Bloomberg's DES Security Description screen — a two-tab panel showing a faithful Bloomberg DES Page 1 replica (company overview) and key financial metrics (Tab 2).

**Architecture:** Backend extends the existing `/api/equity/{ticker}` endpoint with 11 new fields and adds a new `/api/equity/{ticker}/financials` endpoint backed by a new `financials_cache` SQLite table. Frontend adds `DESScreen.tsx` consuming both via React Query (Tab 2 lazy-loaded), with `DES` registered in the command parser and `'des'` added to the `ScreenType` union.

**Tech Stack:** Python 3.11 / FastAPI / yfinance / SQLite / pytest; React 18 / TypeScript / @tanstack/react-query v5 / Vite (no frontend test framework — verification is `npm run build`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/database.py` | Modify | Add `financials_cache` table DDL |
| `backend/cache.py` | Modify | Register `"financials"` in `_TABLE_MAP` and `TTL` |
| `backend/routers/equity.py` | Modify | Add 11 new fields to equity response; add `/financials` route + model |
| `backend/tests/test_des_backend.py` | Create | Tests for cache infra, new equity fields, financials endpoint |
| `frontend/src/types/index.ts` | Modify | Add `'des'` to `ScreenType`; extend `EquityData`; add `FinancialsData` |
| `frontend/src/lib/commandParser.ts` | Modify | Register `'DES'` in `TICKER_SUFFIXES`; add long-form multi-token check |
| `frontend/src/lib/api.ts` | Modify | Add `fetchFinancials()` |
| `frontend/src/components/screens/DESScreen.tsx` | Create | Two-tab DES component (Overview + Financials) |
| `frontend/src/App.tsx` | Modify | Import `DESScreen`; add `case 'des'` to screen router |

---

### Task 1: Backend — cache infrastructure

**Files:**
- Modify: `backend/database.py`
- Modify: `backend/cache.py`
- Create: `backend/tests/test_des_backend.py`

All `pytest` commands are run from the `backend/` directory with the virtualenv active:
```bash
cd /path/to/SpectraTerminal/backend
source .venv/bin/activate
```

- [ ] **Step 1: Write the failing test for cache infrastructure**

Create `backend/tests/test_des_backend.py`:

```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
import pytest
from database import init_db


def test_financials_cache_table_exists(temp_db):
    """financials_cache table is created by init_db."""
    init_db(temp_db)
    with sqlite3.connect(temp_db) as conn:
        tables = [
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
    assert "financials_cache" in tables


def test_financials_cache_columns(temp_db):
    """financials_cache has the right schema."""
    init_db(temp_db)
    with sqlite3.connect(temp_db) as conn:
        cols = [
            r[1] for r in conn.execute(
                "PRAGMA table_info(financials_cache)"
            ).fetchall()
        ]
    assert "ticker" in cols
    assert "data_json" in cols
    assert "cached_at" in cols


def test_financials_cache_set_and_get(temp_db):
    """cache_set/cache_get round-trip works for the 'financials' key."""
    init_db(temp_db)
    from cache import cache_set, cache_get, TTL
    payload = {"revenue_ttm": 385_706_000_000.0, "eps_ttm": 6.13}
    cache_set("financials", "AAPL", payload)
    result = cache_get("financials", "AAPL", TTL["financials"])
    assert result == payload


def test_financials_cache_miss_returns_none(temp_db):
    """cache_get returns None when key is not present."""
    init_db(temp_db)
    from cache import cache_get, TTL
    result = cache_get("financials", "MISSING", TTL["financials"])
    assert result is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_des_backend.py::test_financials_cache_table_exists \
       tests/test_des_backend.py::test_financials_cache_columns \
       tests/test_des_backend.py::test_financials_cache_set_and_get \
       tests/test_des_backend.py::test_financials_cache_miss_returns_none -v
```

Expected: 4 FAILs — `table financials_cache not found` / `KeyError: 'financials'`

- [ ] **Step 3: Add `financials_cache` table to `database.py`**

In `backend/database.py`, add this block to the `executescript` string in `init_db()`, after the last `CREATE TABLE` statement and before the closing `"""`):

```sql
            CREATE TABLE IF NOT EXISTS financials_cache (
                ticker     TEXT PRIMARY KEY,
                data_json  TEXT NOT NULL,
                cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
```

- [ ] **Step 4: Add `financials` to `cache.py`**

In `backend/cache.py`, add to both dicts:

```python
TTL = {
    "price":      60,
    "intraday":   300,
    "daily":      3600,
    "news":       300,
    "econ":       3600,
    "options":    300,
    "screener":   3600,
    "financials": 3600,   # ← add this line
}

_TABLE_MAP = {
    "price":      ("price_cache",      "ticker"),
    "news":       ("news_cache",       "ticker"),
    "chart":      ("chart_cache",      "cache_key"),
    "econ":       ("econ_cache",       "series_id"),
    "financials": ("financials_cache", "ticker"),   # ← add this line
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_des_backend.py::test_financials_cache_table_exists \
       tests/test_des_backend.py::test_financials_cache_columns \
       tests/test_des_backend.py::test_financials_cache_set_and_get \
       tests/test_des_backend.py::test_financials_cache_miss_returns_none -v
```

Expected: 4 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/database.py backend/cache.py backend/tests/test_des_backend.py
git commit -m "feat: add financials_cache table and cache registry entry"
```

---

### Task 2: Backend — extend equity endpoint with DES fields

**Files:**
- Modify: `backend/routers/equity.py`
- Modify: `backend/tests/test_des_backend.py`

- [ ] **Step 1: Write failing tests for new equity fields**

Append to `backend/tests/test_des_backend.py`:

```python
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app

# Re-use this in both equity and financials tests
FAKE_INFO = {
    "longName": "Apple Inc.",
    "currentPrice": 175.50,
    "previousClose": 172.00,
    "volume": 55_000_000,
    "averageVolume": 48_000_000,
    "marketCap": 2_700_000_000_000,
    "trailingPE": 28.5,
    "forwardPE": 26.2,
    "trailingEps": 6.13,
    "fiftyTwoWeekHigh": 199.62,
    "fiftyTwoWeekLow": 124.17,
    "beta": 1.29,
    "dividendYield": 0.0053,
    "sector": "Technology",
    "industry": "Consumer Electronics",
    "industryDisp": "Consumer Electronics Devices",
    "longBusinessSummary": "Apple Inc. designs smartphones.",
    "exchange": "NMS",
    "currency": "USD",
    "country": "United States",
    "sharesOutstanding": 15_728_700_416,
    "floatShares": 15_706_000_000,
    "bid": 175.48,
    "ask": 175.52,
    "dayHigh": 176.10,
    "dayLow": 174.20,
    "open": 174.50,
    "previousClose": 172.00,
    "companyOfficers": [
        {"name": "Tim Cook", "title": "Chief Executive Officer"},
        {"name": "Luca Maestri", "title": "Chief Financial Officer"},
    ],
    "address1": "One Apple Park Way",
    "city": "Cupertino",
    "state": "CA",
    "phone": "408-996-1010",
    "shortRatio": 1.47,
    "enterpriseToEbitda": 21.3,
    "priceToBook": 45.6,
    "fullTimeEmployees": 164_000,
    "website": "https://www.apple.com",
    "totalRevenue": 385_706_000_000,
    "netIncomeToCommon": 96_995_000_000,
    "grossMargins": 0.4431,
    "operatingMargins": 0.2994,
    "debtToEquity": 181.47,
    "currentRatio": 0.988,
    "returnOnEquity": 1.601,
    "returnOnAssets": 0.2217,
    "revenueGrowth": 0.0204,
    "earningsGrowth": 0.132,
}


@pytest.fixture
def client(temp_db):
    """TestClient with a fresh in-memory DB."""
    from database import init_db
    init_db(temp_db)
    with TestClient(app) as c:
        yield c


def test_equity_new_fields_present(client):
    """GET /api/equity/AAPL returns all new DES fields when yfinance has them."""
    with patch("routers.equity.get_ticker_info", new=AsyncMock(return_value=FAKE_INFO)):
        resp = client.get("/api/equity/AAPL")
    assert resp.status_code == 200
    data = resp.json()
    assert data["country"] == "United States"
    assert data["sub_industry"] == "Consumer Electronics Devices"
    assert data["ceo"] == "Tim Cook"
    assert data["address"] == "One Apple Park Way, Cupertino, CA"
    assert data["phone"] == "408-996-1010"
    assert data["short_ratio"] == pytest.approx(1.47)
    assert data["forward_pe"] == pytest.approx(26.2)
    assert data["ev_ebitda"] == pytest.approx(21.3)
    assert data["price_to_book"] == pytest.approx(45.6)
    assert data["employees"] == 164_000
    assert data["website"] == "https://www.apple.com"


def test_equity_new_fields_null_when_missing(client):
    """New DES fields are null (not error) when yfinance doesn't have them."""
    sparse_info = {
        "longName": "Sparse Corp",
        "currentPrice": 10.0,
        "previousClose": 9.5,
    }
    with patch("routers.equity.get_ticker_info", new=AsyncMock(return_value=sparse_info)):
        resp = client.get("/api/equity/SPARSE")
    assert resp.status_code == 200
    data = resp.json()
    assert data["country"] is None
    assert data["ceo"] is None
    assert data["address"] is None
    assert data["forward_pe"] is None


def test_equity_ceo_no_match_returns_none(client):
    """ceo field is None when companyOfficers has no CEO entry."""
    info = dict(FAKE_INFO, companyOfficers=[
        {"name": "Someone", "title": "Chief Financial Officer"}
    ])
    with patch("routers.equity.get_ticker_info", new=AsyncMock(return_value=info)):
        resp = client.get("/api/equity/AAPL")
    assert resp.status_code == 200
    assert resp.json()["ceo"] is None


def test_equity_address_partial(client):
    """address field skips null address parts."""
    info = dict(FAKE_INFO, address1=None, city="Cupertino", state="CA")
    with patch("routers.equity.get_ticker_info", new=AsyncMock(return_value=info)):
        resp = client.get("/api/equity/AAPL")
    assert resp.json()["address"] == "Cupertino, CA"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_des_backend.py::test_equity_new_fields_present \
       tests/test_des_backend.py::test_equity_new_fields_null_when_missing \
       tests/test_des_backend.py::test_equity_ceo_no_match_returns_none \
       tests/test_des_backend.py::test_equity_address_partial -v
```

Expected: 4 FAILs — fields not in response / `KeyError`

- [ ] **Step 3: Extend `EquityResponse` in `equity.py`**

In `backend/routers/equity.py`, add these fields to `EquityResponse` (after `prev_close: float | None`):

```python
    # DES fields
    country: str | None = None
    sub_industry: str | None = None
    ceo: str | None = None
    address: str | None = None
    phone: str | None = None
    short_ratio: float | None = None
    forward_pe: float | None = None
    ev_ebitda: float | None = None
    price_to_book: float | None = None
    employees: int | None = None
    website: str | None = None
```

- [ ] **Step 4: Extend `_parse_equity` in `equity.py`**

Add to the returned dict in `_parse_equity()` (after the `"prev_close": prev_close` line):

```python
        # DES fields
        "country":      info.get("country"),
        "sub_industry": info.get("industryDisp"),
        "ceo":          _extract_ceo(info),
        "address":      _build_address(info),
        "phone":        info.get("phone"),
        "short_ratio":  info.get("shortRatio"),
        "forward_pe":   info.get("forwardPE"),
        "ev_ebitda":    info.get("enterpriseToEbitda"),
        "price_to_book": info.get("priceToBook"),
        "employees":    info.get("fullTimeEmployees"),
        "website":      info.get("website"),
```

Add these two helper functions to `equity.py` (before `_parse_equity`):

```python
def _extract_ceo(info: dict) -> str | None:
    """Return the name of the first officer whose title contains 'ceo'."""
    officers = info.get("companyOfficers") or []
    for officer in officers:
        if "ceo" in (officer.get("title") or "").lower():
            return officer.get("name")
    return None


def _build_address(info: dict) -> str | None:
    """Concatenate address parts, skipping nulls. Returns None if all parts null."""
    parts = [info.get("address1"), info.get("city"), info.get("state")]
    joined = ", ".join(p for p in parts if p)
    return joined or None
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_des_backend.py::test_equity_new_fields_present \
       tests/test_des_backend.py::test_equity_new_fields_null_when_missing \
       tests/test_des_backend.py::test_equity_ceo_no_match_returns_none \
       tests/test_des_backend.py::test_equity_address_partial -v
```

Expected: 4 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/equity.py backend/tests/test_des_backend.py
git commit -m "feat: add DES fields to equity endpoint (country, ceo, address, financials)"
```

---

### Task 3: Backend — financials endpoint

**Files:**
- Modify: `backend/routers/equity.py`
- Modify: `backend/tests/test_des_backend.py`

- [ ] **Step 1: Write failing tests for the financials endpoint**

Append to `backend/tests/test_des_backend.py`:

```python
def test_financials_endpoint_returns_data(client):
    """GET /api/equity/AAPL/financials returns all financial fields."""
    with patch("routers.equity.get_ticker_info", new=AsyncMock(return_value=FAKE_INFO)):
        resp = client.get("/api/equity/AAPL/financials")
    assert resp.status_code == 200
    data = resp.json()
    assert data["revenue_ttm"] == pytest.approx(385_706_000_000.0)
    assert data["net_income_ttm"] == pytest.approx(96_995_000_000.0)
    assert data["eps_ttm"] == pytest.approx(6.13)
    assert data["gross_margin"] == pytest.approx(0.4431)
    assert data["operating_margin"] == pytest.approx(0.2994)
    assert data["debt_to_equity"] == pytest.approx(181.47)
    assert data["current_ratio"] == pytest.approx(0.988)
    assert data["return_on_equity"] == pytest.approx(1.601)
    assert data["return_on_assets"] == pytest.approx(0.2217)
    assert data["revenue_growth"] == pytest.approx(0.0204)
    assert data["earnings_growth"] == pytest.approx(0.132)


def test_financials_endpoint_null_fields(client):
    """Financials fields are null (not omitted) when yfinance doesn't have them."""
    sparse_info = {"longName": "Sparse Corp", "currentPrice": 10.0}
    with patch("routers.equity.get_ticker_info", new=AsyncMock(return_value=sparse_info)):
        resp = client.get("/api/equity/SPARSE/financials")
    assert resp.status_code == 200
    data = resp.json()
    assert data["revenue_ttm"] is None
    assert data["gross_margin"] is None


def test_financials_endpoint_uses_cache(client):
    """Second call to /financials does not call get_ticker_info again (cache hit)."""
    with patch("routers.equity.get_ticker_info", new=AsyncMock(return_value=FAKE_INFO)) as mock:
        client.get("/api/equity/AAPL/financials")
        client.get("/api/equity/AAPL/financials")
    assert mock.call_count == 1


def test_financials_endpoint_404_on_empty_info(client):
    """Returns 404 when yfinance returns empty info."""
    with patch("routers.equity.get_ticker_info", new=AsyncMock(return_value={})):
        resp = client.get("/api/equity/FAKE/financials")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_des_backend.py::test_financials_endpoint_returns_data \
       tests/test_des_backend.py::test_financials_endpoint_null_fields \
       tests/test_des_backend.py::test_financials_endpoint_uses_cache \
       tests/test_des_backend.py::test_financials_endpoint_404_on_empty_info -v
```

Expected: 4 FAILs — route does not exist (404)

- [ ] **Step 3: Add `FinancialsData` model and route to `equity.py`**

In `backend/routers/equity.py`, add the Pydantic model (before the existing `EquityResponse` class):

```python
class FinancialsData(BaseModel):
    revenue_ttm: float | None = None
    net_income_ttm: float | None = None
    eps_ttm: float | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    debt_to_equity: float | None = None
    current_ratio: float | None = None
    return_on_equity: float | None = None
    return_on_assets: float | None = None
    revenue_growth: float | None = None
    earnings_growth: float | None = None
```

Add the route to `equity.py` **before** the existing `@router.get("/equity/{ticker}")` route (order matters — FastAPI matches routes top-to-bottom):

```python
@router.get("/equity/{ticker}/financials", response_model=FinancialsData)
async def get_financials(ticker: str):
    ticker = ticker.upper()

    cached = cache_get("financials", ticker, TTL["financials"])
    if cached:
        return FinancialsData(**cached)

    try:
        info = await get_ticker_info(ticker)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}")

    if not info:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    data = {
        "revenue_ttm":     info.get("totalRevenue"),
        "net_income_ttm":  info.get("netIncomeToCommon"),
        "eps_ttm":         info.get("trailingEps"),
        "gross_margin":    info.get("grossMargins"),
        "operating_margin": info.get("operatingMargins"),
        "debt_to_equity":  info.get("debtToEquity"),
        "current_ratio":   info.get("currentRatio"),
        "return_on_equity": info.get("returnOnEquity"),
        "return_on_assets": info.get("returnOnAssets"),
        "revenue_growth":  info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
    }
    cache_set("financials", ticker, data)
    return FinancialsData(**data)
```

Also add `TTL` to the import line at the top of `equity.py` if not already there:
```python
from cache import cache_get, cache_set, TTL
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_des_backend.py -v
```

Expected: all tests PASS (including tasks 1, 2, and 3)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/equity.py backend/tests/test_des_backend.py
git commit -m "feat: add /equity/{ticker}/financials endpoint"
```

---

### Task 4: Frontend — types and command parser

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/commandParser.ts`

No frontend test framework is installed. Verification is `npm run build` from the `frontend/` directory.

- [ ] **Step 1: Extend `EquityData` in `types/index.ts`**

Add these optional fields after `cached?: boolean` in the `EquityData` interface:

```typescript
  // DES fields
  country?: string | null
  sub_industry?: string | null
  ceo?: string | null
  address?: string | null
  phone?: string | null
  short_ratio?: number | null
  forward_pe?: number | null
  ev_ebitda?: number | null
  price_to_book?: number | null
  employees?: number | null
  website?: string | null
```

- [ ] **Step 2: Add `'des'` to `ScreenType` in `types/index.ts`**

Change:
```typescript
export type ScreenType =
  | 'equity' | 'chart' | 'options' | 'news' | 'filings'
  | 'portfolio' | 'watchlist' | 'econ' | 'earnings'
  | 'screener' | 'fx' | 'crypto' | 'macro' | 'home'
```

To:
```typescript
export type ScreenType =
  | 'equity' | 'chart' | 'options' | 'news' | 'filings'
  | 'portfolio' | 'watchlist' | 'econ' | 'earnings'
  | 'screener' | 'fx' | 'crypto' | 'macro' | 'home' | 'des'
```

- [ ] **Step 3: Add `FinancialsData` interface to `types/index.ts`**

Add after the `FilingsResponse` interface:

```typescript
// ─── DES Financials ───────────────────────────────────────────────────────────
export interface FinancialsData {
  revenue_ttm: number | null
  net_income_ttm: number | null
  eps_ttm: number | null
  gross_margin: number | null
  operating_margin: number | null
  debt_to_equity: number | null
  current_ratio: number | null
  return_on_equity: number | null
  return_on_assets: number | null
  revenue_growth: number | null
  earnings_growth: number | null
}
```

- [ ] **Step 4: Update `commandParser.ts` to handle `DES`**

In `TICKER_SUFFIXES`, add `DES`:
```typescript
const TICKER_SUFFIXES: Record<string, ScreenType> = {
  GP:       'chart',
  CHART:    'chart',
  OPT:      'options',
  OPTIONS:  'options',
  NEWS:     'news',
  FILINGS:  'filings',
  EQUITY:   'equity',
  DES:      'des',      // ← add this line
}
```

In `parseCommand`, inside the `if (parts.length >= 2)` block, add the long-form check **before** the existing `const [first, second] = parts` line:

```typescript
  if (parts.length >= 2) {
    // Long-form Bloomberg commands: "NVDA US EQUITY DES" → check last token as suffix
    if (parts.length > 2) {
      const lastToken = parts[parts.length - 1]
      const longFormScreen = TICKER_SUFFIXES[lastToken]
      if (longFormScreen) {
        return { screen: longFormScreen, ticker: parts[0], raw }
      }
    }

    const [first, second] = parts
    // ... rest of existing code unchanged
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /path/to/SpectraTerminal/frontend
npm run build
```

Expected: `✓ built in ...ms` with no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/commandParser.ts
git commit -m "feat: add FinancialsData type, DES to ScreenType, DES command parser"
```

---

### Task 5: Frontend — API client

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add `fetchFinancials` to `api.ts`**

Add after the last existing export function in `api.ts`:

```typescript
export async function fetchFinancials(ticker: string): Promise<FinancialsData> {
  const { data } = await api.get<FinancialsData>(`/equity/${ticker}/financials`)
  return data
}
```

Add `FinancialsData` to the import from `'../types'` at the top of `api.ts`:
```typescript
import type { ..., FinancialsData } from '../types'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add fetchFinancials API client function"
```

---

### Task 6: Frontend — DESScreen component

**Files:**
- Create: `frontend/src/components/screens/DESScreen.tsx`

This task builds the full two-tab DES component. The file is ~300 lines. Build it all in one step.

- [ ] **Step 1: Create `DESScreen.tsx`**

Create `frontend/src/components/screens/DESScreen.tsx`:

```tsx
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEquity, fetchFinancials } from '../../lib/api'
import type { EquityData, FinancialsData } from '../../types'
import Panel from '../Terminal/Panel'
import LoadingBar from '../shared/LoadingBar'
import TickerBadge from '../shared/TickerBadge'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatLarge(n: number | null): string {
  if (n === null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9)  return (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6)  return (n / 1e6).toFixed(1) + 'M'
  if (abs >= 1e3)  return (n / 1e3).toFixed(1) + 'K'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPrice(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPct(n: number | null): string {
  // yfinance returns margins/yields as 0–1 decimals
  if (n === null) return '—'
  return (n * 100).toFixed(2) + '%'
}

function formatMultiple(n: number | null): string {
  if (n === null) return '—'
  return n.toFixed(2) + 'x'
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  value: string | number | null | undefined
  color?: string
}

const Field: React.FC<FieldProps> = ({ label, value, color = '#e0e0e0' }) => {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
      <span style={{ color: '#554400', minWidth: '90px', flexShrink: 0 }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <div style={{ marginBottom: '12px' }}>
    <div
      style={{
        color: '#cc7700',
        fontSize: '10px',
        letterSpacing: '0.08em',
        marginBottom: '4px',
        borderBottom: '1px solid #2a2a2a',
        paddingBottom: '2px',
      }}
    >
      {title}
    </div>
    {children}
  </div>
)

// ─── Tab 1: Overview ─────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ data: EquityData }> = ({ data }) => {
  const [showFull, setShowFull] = useState(false)

  const desc = data.description ?? ''
  const descTruncated = desc.length > 300 && !showFull ? desc.slice(0, 300) + '…' : desc

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0 16px',
        padding: '8px',
        fontSize: '12px',
        overflowY: 'auto',
      }}
    >
      {/* ── Left column ── */}
      <div>
        <Section title="SECURITY IDENTIFIERS">
          <Field label="Exchange" value={data.exchange} />
          <Field label="Currency" value={data.currency} />
          <Field label="Country"  value={data.country} />
        </Section>

        <Section title="CLASSIFICATION">
          <Field label="Sector"    value={data.sector} />
          <Field label="Industry"  value={data.industry} />
          <Field label="Sub-Ind."  value={data.sub_industry} />
        </Section>

        <Section title="COMPANY DESCRIPTION">
          <div style={{ color: '#e0e0e0', lineHeight: '1.5', marginBottom: '4px' }}>
            {descTruncated}
          </div>
          {desc.length > 300 && (
            <span
              style={{ color: '#ff9900', cursor: 'pointer', fontSize: '11px' }}
              onClick={() => setShowFull(f => !f)}
            >
              {showFull ? '[SHOW LESS]' : '[SHOW MORE]'}
            </span>
          )}
        </Section>

        <Section title="CORPORATE INFO">
          <Field label="CEO"       value={data.ceo} />
          <Field label="Employees" value={data.employees?.toLocaleString('en-US') ?? null} />
          <Field label="Address"   value={data.address} />
          <Field label="Website"   value={data.website} />
          <Field label="Phone"     value={data.phone} />
        </Section>
      </div>

      {/* ── Right column ── */}
      <div>
        <Section title="PRICE &amp; TRADING">
          <Field label="Last Price" value={formatPrice(data.price)} />
          <Field label="52Wk High"  value={formatPrice(data.high_52w)} />
          <Field label="52Wk Low"   value={formatPrice(data.low_52w)} />
          <Field label="Volume"     value={formatLarge(data.volume)} />
          <Field label="Avg Volume" value={formatLarge(data.avg_volume)} />
          <Field label="Beta"       value={data.beta?.toFixed(2) ?? null} />
        </Section>

        <Section title="VALUATION">
          <Field label="Market Cap" value={formatLarge(data.market_cap)} />
          <Field label="P/E (TTM)"  value={data.pe_ratio ? data.pe_ratio.toFixed(1) + 'x' : null} />
          <Field label="Fwd P/E"    value={data.forward_pe ? data.forward_pe.toFixed(1) + 'x' : null} />
          <Field label="P/Book"     value={data.price_to_book ? data.price_to_book.toFixed(1) + 'x' : null} />
          <Field label="EV/EBITDA"  value={data.ev_ebitda ? data.ev_ebitda.toFixed(1) + 'x' : null} />
          <Field label="Div Yield"  value={formatPct(data.dividend_yield)} />
        </Section>

        <Section title="SHARES &amp; FLOAT">
          <Field label="Shares Out" value={formatLarge(data.shares_outstanding)} />
          <Field label="Float"      value={formatLarge(data.float_shares)} />
          <Field label="Short Ratio" value={data.short_ratio?.toFixed(1) ?? null} />
        </Section>
      </div>
    </div>
  )
}

// ─── Tab 2: Financials ────────────────────────────────────────────────────────

const FinancialsTab: React.FC<{
  fins: FinancialsData | undefined
  isLoading: boolean
  isError: boolean
}> = ({ fins, isLoading, isError }) => {
  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#554400' }}>
        LOADING FINANCIAL DATA...
      </div>
    )
  }
  if (isError || !fins) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#ff3333' }}>
        FINANCIAL DATA UNAVAILABLE
      </div>
    )
  }

  const pctColor = (v: number | null) =>
    v === null ? '#e0e0e0' : v >= 0 ? '#00ff41' : '#ff3333'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0 16px',
        padding: '8px',
        fontSize: '12px',
      }}
    >
      {/* Left: Income Statement */}
      <div>
        <Section title="INCOME STATEMENT (TTM)">
          <Field label="Revenue"      value={formatLarge(fins.revenue_ttm)} />
          <Field label="Net Income"   value={formatLarge(fins.net_income_ttm)} />
          <Field label="EPS"          value={fins.eps_ttm?.toFixed(2) ?? null} />
          <Field label="Gross Margin" value={formatPct(fins.gross_margin)} />
          <Field label="Oper. Margin" value={formatPct(fins.operating_margin)} />
        </Section>
      </div>

      {/* Right: Balance Sheet + Growth */}
      <div>
        <Section title="BALANCE SHEET &amp; RETURNS">
          <Field label="Debt/Equity"   value={formatMultiple(fins.debt_to_equity)} />
          <Field label="Current Ratio" value={formatMultiple(fins.current_ratio)} />
          <Field label="Return on Eq"  value={formatPct(fins.return_on_equity)} />
          <Field label="Return on As"  value={formatPct(fins.return_on_assets)} />
        </Section>

        <Section title="GROWTH">
          {fins.revenue_growth !== null && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
              <span style={{ color: '#554400', minWidth: '90px' }}>Revenue Gr.</span>
              <span style={{ color: pctColor(fins.revenue_growth) }}>
                {fins.revenue_growth >= 0 ? '+' : ''}{formatPct(fins.revenue_growth)}
              </span>
            </div>
          )}
          {fins.earnings_growth !== null && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
              <span style={{ color: '#554400', minWidth: '90px' }}>Earnings Gr.</span>
              <span style={{ color: pctColor(fins.earnings_growth) }}>
                {fins.earnings_growth >= 0 ? '+' : ''}{formatPct(fins.earnings_growth)}
              </span>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

const DESScreen: React.FC<Props> = ({ ticker, onNavigate }) => {
  const [activeTab, setActiveTab] = useState(1)

  const { data, isLoading, isError, isFetching } = useQuery<EquityData>({
    queryKey: ['equity', ticker],
    queryFn: () => fetchEquity(ticker),
    staleTime: 60_000,
  })

  const {
    data: fins,
    isLoading: finsLoading,
    isError: finsError,
  } = useQuery<FinancialsData>({
    queryKey: ['financials', ticker],
    queryFn: () => fetchFinancials(ticker),
    enabled: activeTab === 2,
    staleTime: 3_600_000,
  })

  const tabStyle = (tab: number): React.CSSProperties => ({
    padding: '0 8px',
    fontSize: '11px',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    border: activeTab === tab ? '1px solid #ff9900' : '1px solid #2a2a2a',
    color: activeTab === tab ? '#ff9900' : '#554400',
    background: 'transparent',
    fontFamily: 'inherit',
    marginLeft: '4px',
  })

  const panelActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span className="bb-label" style={{ fontSize: '10px' }}>
        {isFetching && !isLoading ? 'REFRESHING...' : ''}
      </span>
      <button style={tabStyle(1)} onClick={() => setActiveTab(1)}>DES 1</button>
      <button style={tabStyle(2)} onClick={() => setActiveTab(2)}>DES 2</button>
    </div>
  )

  const pageHeader = data && (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '16px',
        padding: '4px 8px',
        borderBottom: '1px solid #2a2a2a',
        fontSize: '12px',
      }}
    >
      <span style={{ color: '#ff9900', fontWeight: 'bold' }}>
        {ticker} US Equity
      </span>
      <span style={{ color: '#cccccc' }}>{data.company_name}</span>
    </div>
  )

  return (
    <Panel title="DES — SECURITY DESCRIPTION" actions={panelActions}>
      <LoadingBar loading={isLoading || isFetching} />

      {isError ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#ff3333', fontSize: '12px' }}>
          SECURITY UNAVAILABLE — {ticker} NOT FOUND
        </div>
      ) : isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#554400', fontSize: '12px' }}>
          LOADING SECURITY DATA...
        </div>
      ) : data ? (
        <>
          {pageHeader}
          {activeTab === 1 && <OverviewTab data={data} />}
          {activeTab === 2 && (
            <FinancialsTab fins={fins} isLoading={finsLoading} isError={finsError} />
          )}
        </>
      ) : null}
    </Panel>
  )
}

export default DESScreen
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /path/to/SpectraTerminal/frontend
npm run build
```

Expected: `✓ built in ...ms` with no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/screens/DESScreen.tsx
git commit -m "feat: add DESScreen component with Overview and Financials tabs"
```

---

### Task 7: Frontend — App routing

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add `DESScreen` import and route to `App.tsx`**

Add the import near the other screen imports at the top of `App.tsx`:
```typescript
import DESScreen from './components/screens/DESScreen'
```

In the screen router switch statement, add a `case 'des'` alongside the other cases. The `activeCommand.ticker` may be undefined if somehow a `des` command is issued without a ticker — guard against it:
```typescript
case 'des':
  return activeCommand.ticker
    ? <DESScreen ticker={activeCommand.ticker} onNavigate={handleNavigate} />
    : null
```

- [ ] **Step 2: Verify final build is clean**

```bash
cd /path/to/SpectraTerminal/frontend
npm run build
```

Expected: `✓ built in ...ms`, zero TypeScript errors

- [ ] **Step 3: Run all backend tests one final time**

```bash
cd /path/to/SpectraTerminal/backend
source .venv/bin/activate
pytest tests/test_des_backend.py -v
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire DESScreen into App router for 'des' screen type"
```

---

## Manual Smoke Test

After all tasks complete, start the app and verify end-to-end:

```bash
# Terminal 1 — backend
cd /path/to/SpectraTerminal/backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd /path/to/SpectraTerminal/frontend
npm run dev
```

Open http://localhost:5173, then:

1. Type `AAPL DES` → should navigate to DES screen showing AAPL overview
2. Verify two-column layout: left (Identifiers, Classification, Description, Corporate), right (Price, Valuation, Shares)
3. Click `[DES 2]` → Financials tab loads (spinner briefly), shows Income Statement + Balance Sheet
4. Click `[DES 1]` → returns to Overview (no re-fetch)
5. Type `NVDA US EQUITY DES` → should route to NVDA DES screen
6. Type `INVALID_TICKER DES` → should show `SECURITY UNAVAILABLE` error state
7. Verify description `[SHOW MORE]` toggle works for long descriptions (try `AAPL` or `NVDA`)
