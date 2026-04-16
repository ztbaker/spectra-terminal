# Spec: N Command, ECST, and FXC Screens

**Date:** 2026-03-23
**Status:** Approved

---

## Overview

Three features:
1. **N** — rename the `NEWS` ticker suffix command to `N` (keep `NEWS` as alias)
2. **ECST** — new Economic Statistics screen mirroring Bloomberg's ECST function
3. **FXC** — new Cross Currency Matrix screen with live rate updates

---

## 1. N Command (NEWS rename)

### Changes

**`frontend/src/lib/commandParser.ts`**
- Add `N: 'news'` to `TICKER_SUFFIXES` (keep `NEWS: 'news'` as alias)

**`frontend/src/App.tsx`**
- Update `FKEY_COMMANDS`: F5 `'NEWS'` → `'N'`
- Update `HomeScreen` quick link: cmd `'NEWS'` → `'N'`, desc updated

### Behavior (unchanged)
- `N` alone → market news (no ticker)
- `AAPL N` → news for AAPL
- `N` in `TICKER_SUFFIXES` takes priority over bare ticker lookup, so single-token `N` hits the news screen rather than treating `N` as a ticker symbol
- **Intentional tradeoff:** Single-token `N` will never route to an equity screen for a ticker named `N`. Users who want the `N` equity (e.g., a listing with that symbol) must use `N EQUITY` (Bloomberg-style) to bypass the shortcut.

---

## 2. ECST — Economic Statistics

### Command
`ECST` → standalone screen, no ticker required.
Added to `STANDALONE_COMMANDS` → new `ScreenType` value `'ecst'`.

### Backend — `backend/routers/ecst.py`

New FastAPI router mounted at `/ecst`.

**Series catalog (~25 series, 6 categories):**

| Category | FRED Series ID | Label |
|---|---|---|
| Growth | GDP | GDP (Quarterly) |
| Growth | GDPC1 | Real GDP |
| Growth | INDPRO | Industrial Production |
| Growth | RSXFS | Retail Sales (Adv. Est.) |
| Inflation | CPIAUCSL | CPI YoY |
| Inflation | CPILFESL | Core CPI |
| Inflation | PCEPI | PCE Inflation |
| Inflation | PCEPILFE | Core PCE |
| Labor | UNRATE | Unemployment Rate |
| Labor | PAYEMS | Nonfarm Payrolls |
| Labor | ICSA | Initial Jobless Claims |
| Labor | U6RATE | U-6 Unemployment |
| Housing | HOUST | Housing Starts |
| Housing | CSUSHPISA | Case-Shiller HPI |
| Housing | MORTGAGE30US | 30Y Mortgage Rate |
| Trade & Finance | FEDFUNDS | Fed Funds Rate |
| Trade & Finance | DGS10 | 10Y Treasury |
| Trade & Finance | DGS2 | 2Y Treasury |
| Trade & Finance | T10Y2Y | 10Y-2Y Spread |
| Sentiment | UMCSENT | Consumer Sentiment |
| Labor | MANEMP | Mfg Employment |

**Pydantic models:**
```python
class ECSTEntry(BaseModel):
    series_id: str
    category: str
    label: str
    value: float | None
    prior: float | None
    change: float | None
    units: str
    frequency: str
    next_release_date: str | None   # ISO date string or None
    sparkline: list[float]          # last 12 observations

class ECSTResponse(BaseModel):
    entries: list[ECSTEntry]
    cached: bool = False
```

**Next release date:** `fredapi`'s `Fred` class does not expose a release calendar method. Use `httpx.AsyncClient` to call the FRED REST API directly:
1. `GET https://api.stlouisfed.org/fred/series?series_id={id}&api_key={key}&file_type=json` → extract `release_id`
2. `GET https://api.stlouisfed.org/fred/release/dates?release_id={rid}&realtime_start={today}&sort_order=asc&limit=1&api_key={key}&file_type=json` → extract the first date

Both calls are made concurrently per series using `asyncio.gather`. Gracefully return `None` for any series where release date lookup fails.

**Caching:** Use the existing `"econ"` cache bucket (table: `econ_cache`, key column: `series_id`). Key: `"ecst_all"`. TTL of 900 seconds is passed to `cache_get`: `cache_get("econ", "ecst_all", 900)`. `cache_set` takes no TTL argument — the 900s window is enforced only at read time. This matches how `macro.py` uses `cache_get("econ", "macro_dashboard", TTL["econ"])` with the same bucket.

**Endpoint:** `GET /ecst`

### Frontend — `frontend/src/components/screens/ECSTScreen.tsx`

**Layout:** Full-width table with grouped category sections.

**Columns:** `INDICATOR | LATEST | PRIOR | CHG | FREQ | NEXT RELEASE`

**Color logic:**
- Change positive → `#00ff41` (green) for most indicators
- Exceptions (inverted — lower is better): UNRATE, ICSA, U6RATE, MORTGAGE30US → red when rising, green when falling
- Zero change → `#554400` (dim amber)

**Interactivity:**
- Click a row → inline expanded area below the row showing an SVG line chart (reuse `EconLineChart` pattern from `MacroScreen.tsx`, fetches via existing `fetchEcon` with `start='2018-01-01'` to avoid excessive data points for high-frequency series like ICSA)
- No auto-refresh (data is release-schedule-driven)
- Manual refresh button in header

**Types:** Add `ECSTEntry` and `ECSTResponse` to `frontend/src/types/index.ts`.

**API client:** Add `fetchECST(): Promise<ECSTResponse>` to `frontend/src/lib/api.ts`.

---

## 3. FXC — Cross Currency Matrix

### Command
`FXC` → standalone screen, no ticker required.
Added to `STANDALONE_COMMANDS` → new `ScreenType` value `'fxc'`. Neither `'ecst'` nor `'fxc'` should be added to `TICKER_SCREENS` in `App.tsx` — both are standalone screens that do not inherit the last-used ticker.

### Backend — new endpoint in `backend/routers/fx.py`

Add `GET /fx/rates` — lightweight endpoint returning only current mid rates (no sparkline/chart data).

**Cache:** Use existing `"price"` bucket. Key: `"fx_rates_live"`. TTL of 15 seconds passed to `cache_get`: `cache_get("price", "fx_rates_live", 15)`. Add `FXRates` Pydantic model to existing `fx.py` below the existing `FXResponse` class — no new file needed.

**Response model:**
```python
class FXRates(BaseModel):
    rates: dict[str, float | None]  # e.g. {"EURUSD=X": 1.0832, "USDJPY=X": 149.23, ...}
    fetched_at: float               # unix timestamp
```

**Pairs fetched:** Same 9 pairs as `/fx` (EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD, EURGBP, EURJPY). Uses `get_fast_quote` concurrently via `asyncio.gather`.

### Frontend — `frontend/src/components/screens/FXCScreen.tsx`

**Currencies in matrix:** `USD, EUR, GBP, JPY, CHF, AUD, CAD, NZD` (8×8 = 64 cells)

**Cross rate derivation logic:**

All yfinance pairs are anchored to USD. Normalize to a `rates` map of `CCY → USD value` (i.e., how many USD per 1 unit of CCY):
- `EUR→USD`: from `EURUSD=X` directly
- `GBP→USD`: from `GBPUSD=X` directly
- `JPY→USD`: `1 / USDJPY=X`
- `CHF→USD`: `1 / USDCHF=X`
- `AUD→USD`: from `AUDUSD=X` directly
- `CAD→USD`: `1 / USDCAD=X`
- `NZD→USD`: from `NZDUSD=X` directly
- `USD→USD`: `1.0`

Cross rate `BASE/QUOTE = (BASE→USD) / (QUOTE→USD)`

**Decimal places:**
- JPY as quote currency: 2 decimal places
- All others: 4 decimal places

**Layout:**
- 8×8 grid with sticky header row and label column
- Row = base currency, Column = quote currency
- Diagonal cells: `—` (dim color)
- Header cells: currency code in `#ff9900`
- Data cells: rate value in `#e0e0e0`
- On rate update: cell flashes `#ff9900` background for 800ms, then fades back

**Polling:** `usePolling(refetch, 15_000)` — 15-second interval.

**Footer:** `LIVE · REFRESHED {n}s AGO` counter ticking every second.

**Types:** Add `FXRatesResponse` to `frontend/src/types/index.ts`. Note naming: backend Pydantic model is `FXRates`; frontend TypeScript interface is `FXRatesResponse` (consistent with existing convention: `FXResponse`, `CryptoResponse`, etc.).

**API client:** Add `fetchFXRates(): Promise<FXRatesResponse>` to `frontend/src/lib/api.ts`.

---

## Files Touched

### Backend
- `backend/routers/ecst.py` — new file
- `backend/routers/fx.py` — add `/fx/rates` endpoint
- `backend/main.py` — register `ecst` router

### Frontend
- `frontend/src/types/index.ts` — add `ECSTEntry`, `ECSTResponse`, `FXRatesResponse`, `'ecst'`, `'fxc'` to `ScreenType`
- `frontend/src/lib/api.ts` — add `fetchECST`, `fetchFXRates`
- `frontend/src/lib/commandParser.ts` — add `N`, `ECST`, `FXC`
- `frontend/src/App.tsx` — add `case 'ecst'` and `case 'fxc'` to `renderScreen`, update F5 binding, update HomeScreen quick link for news (`'NEWS'` → `'N'`), add quick link entries for `ECST` and `FXC`
- `frontend/src/components/screens/ECSTScreen.tsx` — new file
- `frontend/src/components/screens/FXCScreen.tsx` — new file
