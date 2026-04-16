# OpenBB Port — Follow-up Tasks

Outstanding work after the initial OpenBB → SpectraTerminal port pass. Verified 2026-04-08; all tests pass (42/42), frontend builds, backend imports cleanly. These items remain.

---

## 1. Finish Phase 0 — migrate remaining routers to provider interface

Phase 0 acceptance was "all routers consume providers via registry" — 5 routers still import from the legacy `backend/services/` package.

**Routers still on legacy `services/`:**
- `backend/routers/crypto.py`
- `backend/routers/etf.py`
- `backend/routers/options.py`
- `backend/routers/screener.py`
- `backend/routers/watchlist.py`

**Tasks:**
1. For each router, replace `from services.yfinance_service import ...` with `get_provider("yfinance")` + the new `get_*_raw` methods on `YFinanceProvider`.
2. Add any missing methods to `providers/yfinance_provider.py` that the router needs (mirror the method used in the legacy service).
3. Run `pytest backend/tests/` — must stay green.
4. Delete `backend/services/yfinance_service.py` once no router references it.
5. Delete `backend/services/` entirely once empty.
6. Update `SpectraTerminal/CLAUDE.md` to remove `services/` references.

**Acceptance:** `grep -r "from services" backend/routers/` returns zero matches; `pytest` green; app launches.

---

## 2. Phase 6 — 13F institutional search

Phase 6 marked "congress done, 13F pending" in the plan.

**Tasks:**
1. Extend `backend/providers/edgar_provider.py` with `search_institutions(q)` and `get_13f(cik)` using SEC EDGAR full-text search + 13F-HR XML parsing.
2. Extend `backend/routers/filings.py` with:
   - `GET /filings/institutions/search?q=`
   - `GET /filings/13f/{cik}`
3. Add a `13F` tab to `frontend/src/components/screens/FilingsScreen.tsx`.
4. Add an `LIT` tab for SEC litigation RSS (`https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=LITIGATION`).

---

## 3. Phase 9 — Screener DSL

Replace the current screener with a declarative query grammar per plan §Phase 9.

**Tasks:**
1. Build `backend/analytics/screener_parser.py` — recursive-descent parser supporting `<, >, <=, >=, =, !=, AND, OR, parentheses`, quoted strings.
2. Nightly job (`backend/jobs/screener_snapshot.py`, run via cron or FastAPI `@repeat_every`) that builds `cache/screener_snapshot.db` from yfinance fundamentals for the S&P 500 + Russell 1000.
3. Rewrite `backend/routers/screener.py` to parse DSL and execute against the SQLite snapshot.
4. Frontend `ScreenerScreen.tsx`: single query input, results table, `localStorage` saved queries.

**Acceptance:** `SCR pe<15 AND mktcap>10b AND sector="Energy"` returns ranked table in <1s.

---

## 4. Phase 10 — News split + sentiment

**Tasks:**
1. Split `/news` → `/news/company?symbol=` and `/news/world?topic=`.
2. Provider chain: Finnhub → yfinance → BizToc RSS → Google News RSS.
3. Add VADER sentiment score per headline (`vaderSentiment` — already in deps list).
4. Frontend `NewsScreen.tsx`: tabs `COMPANY | WORLD | SENTIMENT`.

---

## 5. Phase 11 — Economy expansion

**Tasks:**
1. Replace hardcoded econ series list with `fred_search` live autocomplete (`GET /econ/search?q=`).
2. Add endpoints for OpenBB parity: `indicators`, `central-bank-holdings`, `direction-of-trade` (IMF DOTS public), `house-price-index`, `retail-prices`.
3. Frontend `ECONScreen.tsx`: add search bar; selecting a series charts it immediately.

---

## 6. Phase 12 — `ASK` grounded-QA command

**Tasks:**
1. `POST /ai/ask` — takes `{question, screen_context}`; context = JSON of current screen state.
2. Route to local Ollama (`llama3.1:8b`) if available, else Claude via `ANTHROPIC_API_KEY`.
3. Command bar parser recognizes `ASK <question>`; streaming answer overlay.
4. Stateless — no memory, no training, grounded in supplied context only.

---

## 7. Housekeeping

- **Vite bundle size:** current build emits one 602 KB chunk. Add `build.rolldownOptions.output.manualChunks` to code-split by screen. Non-blocking.
- **Legacy test cleanup:** `tests/test_des_backend.py`, `test_ecst.py`, `test_fx_rates.py` were retargeted at provider class methods in the verification pass. If the provider methods are renamed later, these tests break — consider adding a `tests/conftest.py` fixture `mock_provider(name)` that encapsulates the patch target.
- **`docs/LICENSING.md`:** Phase 0 plan calls for an AGPL-hygiene doc. Not yet created. Add a one-pager confirming no code was copied from the OpenBB repo; everything is reimplemented against public API docs.
- **`security-report.json`:** should be re-run after Phases 9–12 land.

---

## Dependency order

```
(1) Finish Phase 0 migration  ─┐
(2) 13F                        │
(3) Screener DSL               ├── can parallelize after (1)
(4) News split                 │
(5) Economy expansion          │
(6) ASK                        ┘
(7) Housekeeping               ── anytime
```

Phase 0 completion (#1) is the only hard prerequisite — it unblocks deleting `services/` and guarantees the provider interface is the single source of truth for all data access.