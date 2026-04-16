# OpenBB → SpectraTerminal Port Plan

**Goal:** Port every OpenBB capability SpectraTerminal lacks, and replace Spectra subsystems where OpenBB is demonstrably better. Preserve the Bloomberg-authentic amber-on-black UX and the free-data-only constraint.

**Source:** https://github.com/OpenBB-finance/OpenBB (AGPLv3 — any code copy-paste must respect AGPL; prefer reimplementation against public APIs).

**Constraints (inherited from vault CLAUDE.md — do not violate):**
- Free data sources only (yfinance, FRED, Finnhub, SEC EDGAR, ECB, BLS, EIA, USDA, CBOE public, FINRA public).
- Electron + React/TS frontend, FastAPI backend, SQLite cache.
- Never 500 on API failure → return cached + `cached: True`.
- Inline styles only, JetBrains Mono, Bloomberg color system, TradingView Lightweight Charts only.
- React Query for server state, no Redux/Zustand.
- Cache TTLs: price 60s, intraday 5m, daily 1h, news 5m, econ 1h.

---

## Phase 0 — Provider abstraction refactor (foundation)

**Why first:** every later phase depends on being able to swap/stack providers cleanly.

**Tasks**
1. Create `backend/providers/` package with:
   - `base.py` — `BaseProvider` ABC with methods: `get_quote`, `get_historical`, `get_fundamentals`, `get_news`, `get_options_chain`, `search_symbols`. Methods return Pydantic models in `backend/models/`.
   - `yfinance_provider.py`, `finnhub_provider.py`, `fred_provider.py`, `edgar_provider.py` — wrap existing `services/*` code into the new interface.
   - `registry.py` — `get_provider(name)` + `PROVIDER_PRIORITY` fallback chain.
2. Create `backend/models/` with shared Pydantic response models: `Quote`, `OHLCBar`, `Fundamental`, `NewsItem`, `OptionContract`, `EconSeries`, `Filing`, `InstitutionalHolding`, `EconIndicator`, `TreasuryCurvePoint`.
3. Add a `providers/fallback.py` helper: `try_providers(symbol, op)` iterates priority list, catches exceptions, returns first success + `source` label + `cached` bool.
4. Refactor existing routers (`equity.py`, `chart.py`, `options.py`, `news.py`, `econ.py`, `crypto.py`, `fx.py`) to consume providers via registry. **Behavior must be byte-identical on the wire** — add snapshot tests first.
5. Delete `backend/services/` only after all routers migrated and snapshot tests pass.

**Acceptance:** all existing screens work unchanged; `GET /health/providers` returns each provider's status.

---

## Phase 1 — New data providers (free only)

Add providers that unlock OpenBB-parity modules without paid keys.

1. **ECB provider** (`ecb_provider.py`) — ECB SDMX API for reference rates, yield curves, HICP.
2. **BLS provider** (`bls_provider.py`) — CPI, PPI, employment, JOLTS. Free with `BLS_API_KEY` (optional, higher rate limit).
3. **EIA provider** (`eia_provider.py`) — petroleum status, short-term energy outlook, natural gas. Free with `EIA_API_KEY`.
4. **USDA PSD provider** (`usda_provider.py`) — crop production and supply data.
5. **CBOE public provider** (`cboe_provider.py`) — options chains, VIX term structure via public CBOE CSV endpoints.
6. **FINRA provider** (`finra_provider.py`) — short sale volume, ATS data.
7. **Treasury.gov provider** (`treasury_provider.py`) — daily treasury yield curve, TIPS, par yields.
8. **Congress.gov provider** (`congress_provider.py`) — bills, bill text, bill info.
9. **Stooq provider** (`stooq_provider.py`) — free fallback for historical OHLC when yfinance fails.

Each provider: Pydantic-typed, cached via existing `cache.py`, respects rate limits, never raises past the router.

**Acceptance:** `pytest backend/tests/providers/` — one test per provider using VCR cassettes.

---

## Phase 2 — ETF module (new screen + router)

OpenBB gap: Spectra has zero ETF-specific tooling.

**Backend:** `backend/routers/etf.py`
- `GET /etf/search?q=` (yfinance + FMP-free endpoints)
- `GET /etf/{symbol}/info` — expense ratio, AUM, inception, category
- `GET /etf/{symbol}/holdings` — top N holdings with weights (yfinance `.funds_data` or iShares public CSVs)
- `GET /etf/{symbol}/sectors` — sector exposure
- `GET /etf/{symbol}/countries` — geographic exposure
- `GET /etf/{symbol}/performance` — 1D/1W/1M/YTD/1Y/3Y/5Y
- `GET /etf/{symbol}/equity-exposure?ticker=AAPL` — which ETFs hold X
- `GET /etf/{symbol}/historical` — OHLC passthrough

**Frontend:** `ETFScreen.tsx`, command `ETF` or `XLF ETF`
- Top panel: info + performance tiles
- Middle: holdings table (sortable)
- Right: sector donut + country bar (drawn with inline SVG, no extra libs)
- Bottom: chart (reuse chart component)

**Acceptance:** `SPY ETF`, `QQQ ETF`, `XLE ETF` all render holdings + sectors.

---

## Phase 3 — Fixed income module (BOND screen)

**Backend:** `backend/routers/fixedincome.py`
- `GET /fi/treasury/rates` — current curve (1M–30Y) from Treasury.gov
- `GET /fi/treasury/historical?tenor=10Y&start=&end=`
- `GET /fi/tips/yields`
- `GET /fi/effr` — effective fed funds rate (FRED)
- `GET /fi/tcm` — treasury constant maturity
- `GET /fi/bond-indices` — ICE BofA via FRED
- `GET /fi/mortgage` — 30Y fixed, 15Y fixed via FRED

**Frontend:** `BondScreen.tsx`, command `BOND` or `YLD`
- Yield curve plot (Lightweight Charts line series)
- Historical tenor selector
- Curve steepness metrics (2s10s, 3m10y)
- Mortgage rates panel

**Acceptance:** `BOND` renders live curve; `BOND 10Y` shows 10Y historical.

---

## Phase 4 — Derivatives upgrade (OPT v2)

Replace current options engine; keep BS delta but add surface + term structure + unusual activity.

**Backend:** extend `backend/routers/options.py` + new `backend/analytics/options_math.py`
- Reimplement Black-Scholes with full Greeks (delta, gamma, theta, vega, rho, charm, vanna).
- `GET /options/{symbol}/chain` — existing, add all Greeks per contract.
- `GET /options/{symbol}/surface` — returns `{expiries[], strikes[], iv[][]}` for 3D plot.
- `GET /options/{symbol}/term-structure` — ATM IV per expiry.
- `GET /options/{symbol}/unusual` — volume/OI ratio > 3, volume > 5x 20-day avg. Uses yfinance chain polled at cache interval.
- `GET /options/{symbol}/historical-iv?dte=30` — 30-day constant-maturity ATM IV via CBOE or computed from chain history in SQLite.
- Risk-free rate continues to come from FRED `FEDFUNDS`.

**Frontend:** extend `OptionsScreen.tsx`
- New tabs: `CHAIN | SURFACE | TERM | UNUSUAL | FLOW`
- Surface: inline SVG heatmap (expiry × strike, color = IV).
- Term structure: Lightweight Charts line.
- Unusual: sortable table with volume/OI ratio column.

**Acceptance:** `AAPL OPT SURFACE`, `SPY OPT UNUSUAL`, `TSLA OPT TERM` all render.

---

## Phase 5 — Commodity screen (COMD)

**Backend:** `backend/routers/commodity.py`
- `GET /commodity/energy/stocks` — weekly petroleum status (EIA)
- `GET /commodity/energy/outlook` — STEO (EIA)
- `GET /commodity/spot?symbol=WTI|BRENT|NG|HH|GOLD|SILVER`
- `GET /commodity/ag/psd` — USDA PSD report

**Frontend:** `CommodityScreen.tsx`, command `COMD`
- Energy tab: crude + products stocks chart
- Metals tab: spot prices
- Ag tab: PSD supply/demand

---

## Phase 6 — US Congress + Regulators expansion

**Backend:** `backend/routers/congress.py`, extend `filings.py`
- `GET /congress/bills?limit=` (Congress.gov)
- `GET /congress/bill/{id}` — text + metadata
- `GET /filings/institutions/search?q=` — 13F issuer search (EDGAR full-text)
- `GET /filings/13f/{cik}` — latest 13F holdings
- `GET /filings/litigation-rss` — SEC litigation RSS

**Frontend:**
- `CongressScreen.tsx`, command `CONG`
- Extend `FilingsScreen.tsx` with a `13F` tab + `LIT` tab.

---

## Phase 7 — Quantitative + Econometrics analytics

OpenBB `quantitative` and `econometrics` modules fully absent in Baker.

**Backend:** `backend/analytics/`
- `stats.py` — skew, kurtosis, normality (Jarque-Bera), unit root (ADF), summary stats
- `capm.py` — CAPM regression vs SPY/^GSPC
- `econometrics.py` — OLS, cointegration (Engle-Granger), Granger causality, panel OLS (via `linearmodels`), VIF
- `fama_french.py` — pull Ken French library CSVs, compute factor exposures

**Routers:** `backend/routers/analytics.py`
- `POST /analytics/regression` (CAPM, OLS)
- `POST /analytics/cointegration` (pair)
- `POST /analytics/summary` (stats)
- `POST /analytics/fama-french` (portfolio exposure)

**Frontend:** new tab inside `PortfolioScreen.tsx` + new command `QUANT`
- `QUANT <ticker>` → summary stats + rolling vol + drawdown
- `COINT AAPL MSFT` → cointegration result
- `FF <portfolio>` → factor loadings table

**Dependencies:** `statsmodels`, `linearmodels`, `arch`, `scipy`.

---

## Phase 8 — Technical analysis expansion

Current: SMA, EMA, RSI, MACD. Add: ADX, Aroon, Ichimoku, ATR, Demark, Accumulation/Distribution Oscillator, Bollinger, VWAP, OBV, Stochastic.

**Backend:** `backend/analytics/ta.py` — pure pandas/numpy implementations (no TA-Lib). Each indicator is a function `f(df: pd.DataFrame, **params) -> pd.DataFrame`.

**Router:** extend `chart.py`:
- `GET /chart/{symbol}?indicators=ichimoku,adx&interval=1d`

**Frontend:** extend `ChartScreen.tsx` — indicator panel with toggles; indicators rendered as additional Lightweight Charts series / panes.

**Acceptance:** `AAPL GP` with `TOGGLE ICHIMOKU` renders cloud overlay.

---

## Phase 9 — Screener DSL

Replace current screener with a declarative query grammar.

**Backend:** `backend/routers/screener.py`
- Parse query like `pe<15 AND mktcap>1b AND sector="Technology" AND rsi14<30`.
- Evaluate against a nightly-built SQLite snapshot of yfinance fundamentals (`cache/screener_snapshot.db`, rebuilt daily 21:00 ET).
- Return ranked results with requested columns.

**Grammar:** recursive-descent parser (no external dep); fields = any Pydantic model column; operators `< > <= >= = != AND OR`.

**Frontend:** `ScreenerScreen.tsx` — single query input (Bloomberg-style), results table, saved queries in `localStorage`.

**Acceptance:** `SCR pe<15 AND mktcap>10b AND sector="Energy"` returns table in <1s.

---

## Phase 10 — News split + provider routing

- Split `/news` into `/news/company?symbol=` and `/news/world?topic=`.
- Provider chain: Finnhub → yfinance → BizToc RSS → Google News RSS fallback.
- Add sentiment score (simple VADER via `vaderSentiment`).
- Frontend: `NewsScreen.tsx` gets tabs `COMPANY | WORLD | SENTIMENT`.

---

## Phase 11 — Economy expansion

- Replace hardcoded econ series list with `fred_search` live autocomplete.
- Add endpoints: `indicators`, `central-bank-holdings`, `direction-of-trade` (via IMF DOTS public), `house-price-index`, `retail-prices`.
- Frontend: `ECONScreen.tsx` gets a search bar; selecting a series charts it immediately.

---

## Phase 12 — AI command (ASK)

Light AI layer over loaded screen context — not an "agent," just grounded Q&A.

- Backend: `POST /ai/ask` — input `{question, screen_context}`; context is the JSON of whatever screen is active (quote + fundamentals + chain + news). Sent to a local Ollama (`llama3.1:8b`) or Claude via `ANTHROPIC_API_KEY` if set.
- Frontend: command bar recognizes `ASK <question>`; opens overlay with streaming answer.
- No training, no memory — stateless grounded QA only.

---

## Cross-cutting work

- **Tests:** every new router gets pytest + VCR cassettes. Target 80% coverage on `providers/` and `analytics/`.
- **Cache:** extend `cache.py` with per-endpoint TTL table; invalidation on demand via `POST /cache/clear?pattern=`.
- **CLAUDE.md:** update `SpectraTerminal/CLAUDE.md` with new commands, new routers, new env vars (`BLS_API_KEY`, `EIA_API_KEY`).
- **Security:** `security-report.json` re-run after each phase.
- **Package deps to add:** `statsmodels`, `linearmodels`, `arch`, `scipy`, `vaderSentiment`, `python-dateutil` already present.
- **AGPL hygiene:** NO direct code copy from OpenBB repo. Reimplement from public API docs + standard formulas. Document this in `docs/LICENSING.md`.

---

## Execution order (dependency graph)

```
Phase 0 (providers refactor) ✅
   ├── Phase 1 (new providers) ✅
   │      ├── Phase 2 (ETF) ✅
   │      ├── Phase 3 (BOND) ✅
   │      ├── Phase 5 (COMD) ✅
   │      ├── Phase 6 (CONG + 13F) ✅ (congress done, 13F pending)
   │      └── Phase 11 (ECON expansion)
   ├── Phase 4 (OPT v2) ✅ (Greeks + surface + term + unusual)
   ├── Phase 7 (Quant + Econometrics) ✅
   │      └── Phase 9 (Screener DSL)
   ├── Phase 8 (TA expansion) ✅
   ├── Phase 10 (News split)
   └── Phase 12 (ASK)
```

Run Phase 0 strictly first. Phases 1–12 can parallelize after that where the graph allows.

---

## Definition of done (per phase)

1. All new endpoints return Pydantic-typed JSON with `source` + `cached` fields.
2. Frontend screen renders in Bloomberg color system with JetBrains Mono, no new CSS libs.
3. Pytest passes with VCR cassettes checked in.
4. `npm run electron:dev` launches cleanly; new command registered in the command bar parser.
5. README + `CLAUDE.md` updated.
6. No paid-API keys introduced.

---

## Definition of done (project)

- Every OpenBB module in the gap table above is present in Baker, with equal or greater functional coverage for free-data users.
- Provider abstraction lets any router swap data source with one line.
- `pytest` green; `npm run build` green; electron build signs.
- `docs/openbb_port_plan.md` (this file) updated with ✅ per phase.
