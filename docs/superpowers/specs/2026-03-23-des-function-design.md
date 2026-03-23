# DES Function — Security Description Screen

**Date:** 2026-03-23
**Project:** ZacTerminal (Bloomberg Terminal Emulator)
**Status:** Approved

---

## Overview

Implement Bloomberg's DES (Security Description) function as a faithful replica of Bloomberg DES Page 1, plus a supplemental Financials tab (DES 2). The screen is triggered by typing a Bloomberg-style command (`NVDA DES`, `NVDA US Equity DES`) into the existing command bar and displays a full-panel, two-column layout styled to match Bloomberg Terminal aesthetics.

---

## Scope

### In Scope
- `DESScreen.tsx` component — two-tab panel with Bloomberg DES Page 1 layout
- 8 new fields added to existing `/api/equity/{ticker}` endpoint (`country`, `sub_industry`, `ceo`, `address`, `phone`, `short_ratio`, `forward_pe`, `ev_ebitda`)
- New `/api/equity/{ticker}/financials` backend endpoint
- New `financials_cache` table in `backend/database.py`
- New `financials` entry in `backend/cache.py` (`_TABLE_MAP` + `TTL`)
- App.tsx routing for `screen: 'des'`
- Tab navigation between DES 1 (Overview) and DES 2 (Financials)
- `'des'` added to `ScreenType` union in `types/index.ts`
- `DES` command registered in `commandParser.ts` (both `NVDA DES` and `NVDA US Equity DES` forms)

### Out of Scope
- Bloomberg DES Pages 3–5 (shareholders, officers, capital structure)
- Fields unavailable from free APIs (ISIN, SEDOL, CUSIP, institutional ownership %, analyst consensus) — omitted entirely, no placeholder cells

---

## Layout: DES 1 (Overview)

```
┌─────────────────────────────────────────────────────────────────┐
│ NVDA US Equity          NVIDIA Corp             [DES 1] [DES 2] │
├──────────────────────────────┬──────────────────────────────────┤
│ SECURITY IDENTIFIERS         │ PRICE & TRADING                  │
│   Exchange   NASDAQ          │   Last Price    875.39           │
│   Currency   USD             │   52Wk High     974.00           │
│   Country    US              │   52Wk Low      455.72           │
│                              │   Volume        42.3M            │
│ CLASSIFICATION               │   Avg Volume    38.1M            │
│   Sector     Technology      │   Beta          1.68             │
│   Industry   Semiconductors  │                                  │
│   Sub-Ind.   Semicon. Equip  │ VALUATION                        │
│                              │   Market Cap    2.15T            │
│ COMPANY DESCRIPTION          │   P/E (TTM)     58.2x            │
│   NVIDIA designs and         │   Fwd P/E       35.1x            │
│   manufactures graphics      │   P/Book        42.3x            │
│   processing units…          │   EV/EBITDA     48.1x            │
│   [SHOW MORE]                │   Div Yield     0.03%            │
│                              │                                  │
│ CORPORATE INFO               │ SHARES & FLOAT                   │
│   CEO        Jensen Huang    │   Shares Out    24.4B            │
│   Employees  29,600          │   Float         24.3B            │
│   Address    Santa Clara, CA │   Short Ratio   1.2              │
│   Website    nvidia.com      │                                  │
│   Phone      408-486-2000    │                                  │
└──────────────────────────────┴──────────────────────────────────┘
```

**Sections (left column):**
1. **SECURITY IDENTIFIERS** — Exchange (`exchange`), Currency (`currency`), Country (`country`) — each row rendered only if non-null
2. **CLASSIFICATION** — Sector (`sector`), Industry (`industry`), Sub-Industry (`sub_industry`) — each row rendered only if non-null
3. **COMPANY DESCRIPTION** — `description` field, truncated to 4 lines with `[SHOW MORE]` toggle (expand to full text on click, `[SHOW LESS]` to collapse)
4. **CORPORATE INFO** — CEO (`ceo`), Employees (`employees` — already `fullTimeEmployees` in yfinance), Address (`address`), Website (`website` — already in yfinance as `website`), Phone (`phone`) — each row rendered only if non-null

**Sections (right column):**
1. **PRICE & TRADING** — Last price (`price`), 52Wk High (`high_52w`), 52Wk Low (`low_52w`), Volume (`volume`), Avg Volume (`avg_volume`), Beta (`beta`)
2. **VALUATION** — Market Cap (`market_cap`), P/E TTM (`pe_ratio`), Fwd P/E (`forward_pe`), P/Book (`price_to_book` — see note below), EV/EBITDA (`ev_ebitda`), Div Yield (`dividend_yield`)
3. **SHARES & FLOAT** — Shares Out (`shares_outstanding`), Float (`float_shares`), Short Ratio (`short_ratio`)

> **Note on P/Book:** `priceToBook` is already fetched via yfinance `info.get("priceToBook")` but not currently exposed in `EquityResponse`. Add `price_to_book: float | None` as a 9th new field alongside the others listed in scope.

Fields with null values from yfinance are omitted from render entirely (not shown as `—`).

**CEO sourcing:** `info.get('companyOfficers', [])` returns a list on some tickers. Search for the first entry whose `title` field (lowercased) contains `"ceo"` and use its `name`. If the list is absent or no CEO entry found, omit the CEO row. This field will be null for many tickers — that is expected behavior.

---

## Layout: DES 2 (Financials)

Two-column key metrics grid:

```
┌─────────────────────────────────────────────────────────────────┐
│ NVDA US Equity          NVIDIA Corp             [DES 1] [DES 2] │
├─────────────────────────────────────────────────────────────────┤
│ INCOME STATEMENT (TTM)           BALANCE SHEET & RETURNS        │
│   Revenue        60.9B             Debt/Equity     0.42x        │
│   Net Income     29.8B             Current Ratio   4.17x        │
│   EPS            1.21              Return on Eq    123.8%       │
│   Gross Margin   74.6%             Return on As    55.3%        │
│   Oper. Margin   61.1%                                          │
│                                  GROWTH                         │
│                                    Revenue Gr.     +122%        │
│                                    Earnings Gr.    +581%        │
└─────────────────────────────────────────────────────────────────┘
```

Tab 2 data is fetched lazily — React Query `enabled: activeTab === 2` to avoid unnecessary API calls.

---

## Backend Changes

### 1. Add `financials` cache table

**`backend/database.py`** — add to the `executescript` in `init_db()`:
```sql
CREATE TABLE IF NOT EXISTS financials_cache (
    ticker     TEXT PRIMARY KEY,
    data_json  TEXT NOT NULL,
    cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`backend/cache.py`** — add entries to both `TTL` and `_TABLE_MAP`:
```python
TTL = {
    # existing entries...
    "financials": 3600,  # 1 hr
}

_TABLE_MAP = {
    # existing entries...
    "financials": ("financials_cache", "ticker"),
}
```

### 2. Extend `/api/equity/{ticker}`

Add 9 new fields to `_parse_equity()` and to `EquityResponse`. All are sourced from the already-fetched `info` dict — no additional yfinance calls needed:

| Field | Python expression | Type |
|-------|-------------------|------|
| `country` | `info.get("country")` | `str \| None` |
| `sub_industry` | `info.get("industryDisp")` | `str \| None` |
| `ceo` | See CEO sourcing note above | `str \| None` |
| `address` | `", ".join(p for p in [info.get("address1"), info.get("city"), info.get("state")] if p) or None` | `str \| None` |
| `phone` | `info.get("phone")` | `str \| None` |
| `short_ratio` | `info.get("shortRatio")` | `float \| None` |
| `forward_pe` | `info.get("forwardPE")` | `float \| None` |
| `ev_ebitda` | `info.get("enterpriseToEbitda")` | `float \| None` |
| `price_to_book` | `info.get("priceToBook")` | `float \| None` |

> **Note:** The existing `pe_ratio` field uses `trailingPE or forwardPE` as a fallback. Do NOT change this — it is used by other screens. DES renders `pe_ratio` as "P/E (TTM)" and the new `forward_pe` field as "Fwd P/E" separately.

> **Note on `employees`:** `fullTimeEmployees` is already fetched but not currently exposed in `EquityResponse`. Also add `employees: int | None` mapped to `info.get("fullTimeEmployees")` and `website: str | None` mapped to `info.get("website")` as the 10th and 11th new fields, since DES Corporate Info requires them. (Check if they are already present before adding — if they exist, skip.)

### 3. New endpoint: `GET /api/equity/{ticker}/financials`

**Router:** Add to `backend/routers/equity.py`. Place this route BEFORE the existing `@router.get("/equity/{ticker}")` route to avoid path conflicts.

**Cache:** `cache_get('financials', ticker, TTL['financials'])` / `cache_set('financials', ticker, data)`

**Response model:**
```python
class FinancialsData(BaseModel):
    revenue_ttm: float | None
    net_income_ttm: float | None
    eps_ttm: float | None
    gross_margin: float | None
    operating_margin: float | None
    debt_to_equity: float | None
    current_ratio: float | None
    return_on_equity: float | None
    return_on_assets: float | None
    revenue_growth: float | None
    earnings_growth: float | None
```

**yfinance key mapping** (all from `info` dict, same `get_ticker_info()` call):
| Response field | yfinance key |
|---------------|-------------|
| `revenue_ttm` | `totalRevenue` |
| `net_income_ttm` | `netIncomeToCommon` |
| `eps_ttm` | `trailingEps` |
| `gross_margin` | `grossMargins` |
| `operating_margin` | `operatingMargins` |
| `debt_to_equity` | `debtToEquity` |
| `current_ratio` | `currentRatio` |
| `return_on_equity` | `returnOnEquity` |
| `return_on_assets` | `returnOnAssets` |
| `revenue_growth` | `revenueGrowth` |
| `earnings_growth` | `earningsGrowth` |

Fields absent in yfinance response are returned as `null` (not omitted).

---

## Frontend Changes

### `frontend/src/lib/commandParser.ts`

Two changes:
1. Add `'DES': 'des'` to `TICKER_SUFFIXES`.
2. In the `parts.length >= 2` block, add a check for 3+ token long-form commands BEFORE the existing `second` token check:
```typescript
// Handle long-form Bloomberg commands: e.g. "NVDA US EQUITY DES"
// Last token is the function suffix, first token is the ticker
if (parts.length > 2) {
  const lastToken = parts[parts.length - 1]
  const longFormScreen = TICKER_SUFFIXES[lastToken]
  if (longFormScreen) {
    return { screen: longFormScreen, ticker: parts[0], raw }
  }
}
```
This allows `NVDA US EQUITY DES` → `{ screen: 'des', ticker: 'NVDA' }`.

### `frontend/src/types/index.ts`

Three additions:

**1. Add `'des'` to `ScreenType`:**
```typescript
export type ScreenType =
  | 'equity' | 'chart' | 'options' | 'news' | 'filings'
  | 'portfolio' | 'watchlist' | 'econ' | 'earnings'
  | 'screener' | 'fx' | 'crypto' | 'macro' | 'home' | 'des'
```

**2. Add new optional fields to `EquityData`** (after the existing fields):
```typescript
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

**3. Add `FinancialsData` interface:**
```typescript
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

### `frontend/src/lib/api.ts`

Add:
```typescript
export async function fetchFinancials(ticker: string): Promise<FinancialsData> {
  const { data } = await api.get<FinancialsData>(`/equity/${ticker}/financials`)
  return data
}
```

### `frontend/src/components/screens/DESScreen.tsx` (new file)

**Props:**
```typescript
interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}
```

**State:**
- `activeTab: number` — `useState(1)`, 1-indexed
- `showFullDescription: boolean` — `useState(false)`

**Queries:**
```typescript
// Page 1 — shared cache key with EquityScreen
const { data, isLoading, isError } = useQuery({
  queryKey: ['equity', ticker],
  queryFn: () => fetchEquity(ticker),
})

// Page 2 — lazy fetch, only when tab 2 is active
const { data: fins, isLoading: finsLoading, isError: finsError } = useQuery({
  queryKey: ['financials', ticker],
  queryFn: () => fetchFinancials(ticker),
  enabled: activeTab === 2,
})
```

**Page header** (rendered on both tabs, above the two-column body):
- Left: `{ticker} US Equity` in `#ff9900` bold
- Center: `data?.company_name` in `#cccccc`
- Right: tab buttons `[DES 1]` `[DES 2]`

**Tab 1 layout:** two equal-width columns using CSS `display: grid; grid-template-columns: 1fr 1fr`. Sections stack vertically within each column as described above.

**Tab 2 layout:** two-column grid as shown in the layout section above. Growth values colored `#00ff41` for positive, `#ff3333` for negative.

**Number formatting helpers** (local to `DESScreen.tsx`):
- Large numbers (market cap, revenue, shares): same `formatLarge` pattern as `PortfolioScreen.tsx` (T/B/M/K suffixes)
- Percentage fields from yfinance (`gross_margin`, `operating_margin`, `return_on_equity`, `return_on_assets`, `revenue_growth`, `earnings_growth`, `dividend_yield`): multiply by 100 and append `%` (yfinance returns these as 0–1 decimals)
- Price values: `toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
- Ratio/multiple values: append `x` suffix (P/E, P/Book, EV/EBITDA, debt-to-equity, current-ratio)

### `frontend/src/App.tsx`

Add import:
```typescript
import DESScreen from './components/screens/DESScreen'
```

Add to screen switch statement:
```typescript
case 'des':
  return <DESScreen ticker={activeCommand.ticker ?? ''} onNavigate={handleNavigate} />
```

---

## Visual Style

Matches existing Bloomberg aesthetic throughout:
- Background: `#000000` / `#0a0a0a`
- Section headers: `#cc7700` uppercase, `10px`, letter-spacing `0.08em`
- Field labels: `#554400`
- Field values: `#e0e0e0`
- Ticker in page header: `#ff9900` bold
- Company name: `#cccccc`
- Active tab: border `1px solid #ff9900`, text `#ff9900`
- Inactive tab: border `1px solid #2a2a2a`, text `#554400`
- Section dividers: `1px solid #2a2a2a`
- Font: `JetBrains Mono, IBM Plex Mono, Courier New, monospace`, `12px`
- Positive values (gains, positive growth): `#00ff41`
- Negative values (losses, negative growth): `#ff3333`
- `[SHOW MORE]` / `[SHOW LESS]` text: `#ff9900`, cursor pointer

---

## Error & Loading States

- **Loading (Page 1):** `LoadingBar` component across panel top + `LOADING SECURITY DATA...` in `#554400` centered
- **Error (Page 1):** `SECURITY UNAVAILABLE — {TICKER} NOT FOUND` in `#ff3333` centered
- **Loading (Page 2):** `LoadingBar` + `LOADING FINANCIAL DATA...` in `#554400` centered — only shown when tab 2 is active
- **Financials error:** `FINANCIAL DATA UNAVAILABLE` in `#ff3333` centered in tab 2 body

---

## Files Changed

| File | Change |
|------|--------|
| `backend/database.py` | Add `financials_cache` table DDL to `init_db()` |
| `backend/cache.py` | Add `"financials"` to `TTL` dict and `_TABLE_MAP` as `("financials_cache", "ticker")` |
| `backend/routers/equity.py` | Add 9+ fields to `_parse_equity` + `EquityResponse`; add `/equity/{ticker}/financials` route with `FinancialsData` model |
| `frontend/src/lib/commandParser.ts` | Add `'DES': 'des'` to `TICKER_SUFFIXES`; add long-form multi-token suffix check |
| `frontend/src/types/index.ts` | Add `'des'` to `ScreenType`; add new fields to `EquityData`; add `FinancialsData` interface |
| `frontend/src/lib/api.ts` | Add `fetchFinancials()` function |
| `frontend/src/components/screens/DESScreen.tsx` | New component (create) |
| `frontend/src/App.tsx` | Import `DESScreen`; add `case 'des'` to screen router |
