# Spectra Terminal — Phase 1 Backend Design

**Date:** 2026-03-19
**Scope:** Phase 1 only — Python/FastAPI backend
**Status:** Approved

---

## Overview

Spectra Terminal is a personal Bloomberg Terminal emulator using entirely free data sources. This spec covers Phase 1: the complete backend API that will serve all 14 screens in the eventual React frontend.

- **Backend:** Python 3.11+, FastAPI, SQLite
- **Deployment:** Local only (`localhost:8000`)
- **Data sources:** yfinance, FRED API, Finnhub, SEC EDGAR, Yahoo RSS
- **API keys required:** `FRED_API_KEY`, `FINNHUB_API_KEY` (both free)

---

## Project Structure

```
SpectraTerminal/
└── backend/
    ├── main.py
    ├── config.py
    ├── database.py
    ├── cache.py
    ├── requirements.txt
    ├── .env
    ├── .env.example
    ├── routers/
    │   ├── equity.py
    │   ├── chart.py
    │   ├── options.py
    │   ├── news.py
    │   ├── econ.py
    │   ├── portfolio.py
    │   ├── watchlist.py
    │   ├── earnings.py
    │   ├── screener.py
    │   ├── fx.py
    │   ├── crypto.py
    │   ├── filings.py
    │   ├── macro.py
    │   └── indices.py
    └── services/
        ├── yfinance_service.py
        ├── fred_service.py
        ├── finnhub_service.py
        ├── edgar_service.py
        └── news_service.py
```

---

## Build Strategy

**Option B — Foundation first, then parallel routers.**

The foundation layer is built sequentially (each layer depends on the previous):

```
config.py → database.py → cache.py → services/ → main.py
```

Once services are in place, all 14 routers are built in parallel via subagents. Routers are independent of each other — they only depend on the shared service layer.

---

## Foundation Layer

### `config.py`
Loads `.env` via `python-dotenv`. Exports `FRED_API_KEY`, `FINNHUB_API_KEY`, and any other settings as module-level constants. Raises a clear error on startup if required keys are missing.

### `database.py`
Creates and manages a SQLite database (`spectra_terminal.db`) with these tables:

| Table | Columns | TTL |
|---|---|---|
| `watchlist` | id, ticker, added_at, notes | — |
| `portfolio` | id, ticker, shares, avg_cost, added_at | — |
| `price_cache` | ticker, data_json, cached_at | 60s |
| `news_cache` | ticker, data_json, cached_at | 5min |
| `chart_cache` | cache_key, data_json, cached_at | 1hr (daily), 5min (intraday) |
| `options_cache` | cache_key, data_json, cached_at | 5min |
| `econ_cache` | series_id, data_json, cached_at | 1hr |
Provides `get_db()` context manager for all database access.

Command history is stored in `localStorage` on the frontend only — no SQLite table needed for a single-user local app.

### `cache.py`
Single module wrapping SQLite cache tables. Interface:
- `cache.get(key: str) -> dict | None` — returns parsed JSON or None if missing/expired
- `cache.set(key: str, data: dict, ttl_seconds: int)` — stores serialized JSON with timestamp
- `cache.invalidate(key: str)` — deletes a cache entry

Cache key format: `f"{endpoint}_{ticker}_{params_hash}"` where params_hash is an MD5 of sorted query params.

### `main.py`
FastAPI application with:
- CORS enabled for `http://localhost:5173` (Vite dev server)
- All 14 routers registered with `/api` prefix
- `/health` endpoint returning `{"status": "ok"}`
- Lifespan handler that calls `database.init_db()` on startup and triggers screener universe pre-warm as a background task
- APScheduler `AsyncIOScheduler` configured to refresh the screener universe every 4 hours

---

## Service Layer

All services return `None` on failure (never raise). Callers check for `None` and return partial data with an `error` flag.

### `yfinance_service.py`
- Wraps all yfinance calls with `asyncio.to_thread(func, *args)` since yfinance is synchronous (Python 3.9+ idiom; `get_event_loop().run_in_executor` is deprecated and broken in 3.12+)
- Retry logic: 3 attempts with exponential backoff (0.5s, 1s, 2s)
- Key methods: `get_ticker_info(ticker)`, `get_history(ticker, period, interval)`, `get_options(ticker, expiry)`, `get_multiple_quotes(tickers: list)`

### `fred_service.py`
- Async HTTP via httpx directly against the FRED REST API (`https://api.stlouisfed.org/fred/series/observations`) — no `fredapi` library
- Rate limit: 120 req/min (no throttling needed at typical usage)
- Key methods: `get_series(series_id, start_date)`, `get_latest_value(series_id)`

### `finnhub_service.py`
- Async HTTP via httpx
- Token bucket rate limiter: 60 req/min
- Key methods: `get_company_news(ticker, from_date, to_date)`, `get_company_profile(ticker)`

### `edgar_service.py`
- Async HTTP via httpx
- Polite rate: max 10 req/sec (simple asyncio.sleep between calls)
- Two-step lookup: (1) resolve ticker → CIK via `https://efts.sec.gov/LATEST/search-index?q=%22{ticker}%22&forms={form_type}` or `https://www.sec.gov/cgi-bin/browse-edgar?CIK={ticker}&action=getcompany&output=atom`; (2) fetch filings list from `https://data.sec.gov/submissions/CIK{cik_10digit}.json`
- Key methods: `get_cik(ticker) -> str`, `search_filings(ticker, form_type, limit)`

### `news_service.py`
- Aggregates Finnhub company news + Yahoo Finance RSS feed
- Deduplicates by headline (fuzzy match: >85% similarity = duplicate)
- Returns unified format: `{headline, source, url, datetime, summary, sentiment}`
- Sentiment: simple keyword scoring (positive/negative/neutral), not ML

---

## Routers

### `GET /api/equity/{ticker}`
Returns full quote + fundamentals from yfinance:
`price, change, change_pct, volume, market_cap, pe_ratio, eps, 52w_high, 52w_low, avg_volume, beta, dividend_yield, sector, industry, description, exchange, currency, shares_outstanding, float_shares`

### `GET /api/chart/{ticker}?period=1y&interval=1d`
- period: `1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max`
- interval: `1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo`
- Returns OHLCV array formatted for lightweight-charts: `[{time, open, high, low, close, volume}]`
- Technical indicators computed server-side with pandas/numpy (no TA libraries):
  - SMA20, SMA50, SMA200 — rolling mean
  - RSI(14) — Wilder's smoothing method
  - MACD — 12/26 EMA diff + 9 EMA signal line
  - Bollinger Bands — 20-period SMA ± 2 std dev

### `GET /api/options/{ticker}`
- Returns nearest 4 expiration dates
- Per expiry: full calls chain + puts chain
- Per contract: `strike, lastPrice, bid, ask, volume, openInterest, impliedVolatility, delta, inTheMoney, expiration`
- Delta computed server-side via Black-Scholes:
  - `d1 = (ln(S/K) + (r + σ²/2)t) / (σ√t)`
  - `delta_call = N(d1)`, `delta_put = N(d1) - 1`
  - Risk-free rate sourced from FRED FEDFUNDS (latest value, cached 1hr)

### `GET /api/news?ticker={ticker}&limit=50`
`ticker` is optional. Without it, returns general market news from Yahoo Finance RSS. With it, aggregates Finnhub company news + Yahoo RSS filtered to the ticker. Both paths use `news_service`. Returns `[{headline, source, url, datetime, summary, sentiment}]`.

### `GET /api/econ/{series_id}?start=2010-01-01`
FRED series fetch. Default series loaded on first visit: `GDP, UNRATE, CPIAUCSL, FEDFUNDS, T10Y2Y`. Returns series metadata + `[{date, value}]`.

### `GET/POST/DELETE /api/portfolio` + `GET /api/portfolio/performance`
SQLite CRUD. `/performance` fetches live prices for all holdings in parallel via `asyncio.gather`, computes total value, P&L, and % gain per position.

### `GET/POST/DELETE /api/watchlist` + `GET /api/watchlist/quotes`
SQLite CRUD. `/quotes` fetches live prices for all watchlist tickers in parallel via `asyncio.gather`.

### `GET /api/earnings/calendar?lookahead_days=14`
yfinance earnings calendar for S&P 500 components + current watchlist tickers. Returns grouped by date with BMO/AMC flag.

**Performance strategy:** Fetching 503 tickers individually would take 30–120 seconds. Instead, a background task pre-warms the earnings cache on startup and refreshes it once daily via APScheduler. The endpoint always returns from cache (with a `cached_at` timestamp); if the cache is cold it returns an empty result with `"warming": true`.

### `GET /api/screener`
Query params: `min_market_cap, max_pe, min_volume, sector, min_52w_change, max_52w_change, min_beta, max_beta`. Pre-cached S&P 500 universe refreshed every 4 hours by APScheduler. On cold start, the lifespan handler triggers an initial cache warm as a fire-and-forget background task; until the cache is populated the endpoint returns `{"results": [], "warming": true}`. Returns max 100 results sorted by market cap.

### `GET /api/fx`
9 major pairs via yfinance: `EURUSD=X, GBPUSD=X, USDJPY=X, USDCHF=X, AUDUSD=X, USDCAD=X, NZDUSD=X, EURGBP=X, EURJPY=X`. Returns rate, change, change_pct, day_high, day_low.

### `GET /api/crypto`
8 coins via yfinance: `BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD, DOGE-USD, ADA-USD, AVAX-USD`. Returns price, change, change_pct, market_cap, volume_24h.

### `GET /api/filings/{ticker}?type=10-K&limit=10`
SEC EDGAR full-text search API. Returns `[{form_type, filed_date, description, url, period_of_report}]`.

### `GET /api/macro/dashboard`
11 FRED series, latest values + change from prior reading:
`FEDFUNDS, DGS10, DGS2, T10Y2Y, CPIAUCSL, CPILFESL, PCEPI, UNRATE, GDP, IPMAN, UMCSENT`

Notes:
- `PCEPI` (PCE Price Index) is used instead of `PCE` (which is a dollar level, not an inflation rate); the service computes YoY % change before returning
- `IPMAN` (Industrial Production: Manufacturing) is used for the "ISM Mfg" card since ISM PMI is not freely available via FRED

### `GET /api/indices`
8 tickers for the frontend status bar:
`^GSPC, ^DJI, ^IXIC, ^VIX, ^TNX, GC=F, CL=F, BTC-USD`

---

## Caching Strategy

| Endpoint type | TTL |
|---|---|
| Price / equity quotes | 60 seconds |
| Options chains | 5 minutes |
| Intraday charts (1m–1h intervals) | 5 minutes |
| Daily+ charts | 1 hour |
| News | 5 minutes |
| Econ / macro (FRED) | 1 hour |
| Screener universe | 4 hours |
| Earnings calendar | 24 hours |
| Options delta risk-free rate | 1 hour |

All endpoints: check cache first → return immediately on hit. On miss: fetch → store → return.

---

## Error Handling

- All services return `None` on external API failure (never raise)
- All routers return partial data + `"error": "<message>"` field when upstream fails
- Cached stale data is served with `"stale": true` flag rather than returning an error
- Never return HTTP 500 for data fetch failures — always return 200 with error info in body

---

## Dependencies (`requirements.txt`)

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
```

---

## What Phase 1 Does NOT Include

- Frontend (Phase 2+)
- Authentication
- Multi-user support
- Deployment beyond localhost
