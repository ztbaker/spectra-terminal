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
- 4 new fields added to existing `/api/equity/{ticker}` endpoint (`short_ratio`, `address`, `phone`, `ceo`)
- New `/api/equity/{ticker}/financials` backend endpoint
- App.tsx routing for `screen: 'des'`
- Tab navigation between DES 1 (Overview) and DES 2 (Financials)

### Out of Scope
- Bloomberg DES Pages 3–5 (shareholders, officers, capital structure)
- Fields unavailable from free APIs (ISIN, SEDOL, CUSIP, institutional ownership %, analyst consensus) — omitted entirely, no placeholder cells
- Command bar changes — existing parser already handles `NVDA DES` and `NVDA US Equity DES`

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
│   Founded    1993            │   Short Ratio   1.2              │
│   Address    Santa Clara, CA │                                  │
│   Website    nvidia.com      │                                  │
│   Phone      408-486-2000    │                                  │
└──────────────────────────────┴──────────────────────────────────┘
```

**Sections (left column):**
1. **SECURITY IDENTIFIERS** — Exchange, Currency, Country of domicile
2. **CLASSIFICATION** — GICS Sector, Industry, Sub-Industry (from yfinance `sector`, `industry`, `industryDisp`)
3. **COMPANY DESCRIPTION** — `longBusinessSummary`, truncated to 4 lines with `[SHOW MORE]` toggle
4. **CORPORATE INFO** — CEO name, full-time employees, founded year (if available), concatenated address, website (clickable), phone

**Sections (right column):**
1. **PRICE & TRADING** — Last price, 52-week high/low, volume, avg volume, beta
2. **VALUATION** — Market cap, P/E TTM, forward P/E, P/Book, EV/EBITDA, dividend yield
3. **SHARES & FLOAT** — Shares outstanding, float shares, short ratio

Fields with null values from yfinance are omitted from render (not shown as `—`).

---

## Layout: DES 2 (Financials)

Single-column key metrics grid, two columns of label/value pairs:

```
┌─────────────────────────────────────────────────────────────────┐
│ NVDA US Equity          NVIDIA Corp             [DES 1] [DES 2] │
├────────────────────────────────────────────────────────────────-┤
│ INCOME STATEMENT (TTM)           BALANCE SHEET & RETURNS        │
│   Revenue        60.9B             Debt/Equity     0.42x        │
│   Net Income     29.8B             Current Ratio   4.17x        │
│   EPS            1.21              Return on Eq    123.8%       │
│   Gross Margin   74.6%             Return on As    55.3%        │
│   Oper. Margin   61.1%                                          │
│                                  GROWTH                         │
│                                    Revenue Gr.     122%         │
│                                    Earnings Gr.    581%         │
└─────────────────────────────────────────────────────────────────┘
```

Tab 2 data is fetched lazily — React Query `enabled: activeTab === 2` to avoid unnecessary API calls.

---

## Backend Changes

### 1. Extend `/api/equity/{ticker}`

Add to the existing equity router response (sourced from `yfinance.Ticker.info`):

| Field | yfinance key | Notes |
|-------|-------------|-------|
| `ceo` | `companyOfficers[0].name` where title contains "CEO" | Skip if not found |
| `address` | `address1 + city + state` concatenated | Skip nulls |
| `phone` | `phone` | Direct mapping |
| `short_ratio` | `shortRatio` | Direct mapping |

These fields are already fetched during the existing `get_ticker_info()` call — just expose them in the response.

### 2. New endpoint: `GET /api/equity/{ticker}/financials`

**Router:** `backend/routers/equity.py` (add route to existing file)

**Cache TTL:** 3600s (financials cache table, existing)

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

All fields from `yfinance.Ticker(ticker).info`. Fields absent in yfinance response are returned as `null`.

**yfinance key mapping:**
- `revenue_ttm` → `totalRevenue`
- `net_income_ttm` → `netIncomeToCommon`
- `eps_ttm` → `trailingEps`
- `gross_margin` → `grossMargins`
- `operating_margin` → `operatingMargins`
- `debt_to_equity` → `debtToEquity`
- `current_ratio` → `currentRatio`
- `return_on_equity` → `returnOnEquity`
- `return_on_assets` → `returnOnAssets`
- `revenue_growth` → `revenueGrowth`
- `earnings_growth` → `earningsGrowth`

---

## Frontend Changes

### New type: `FinancialsData`
Add to `frontend/src/types/index.ts`.

### New API function: `fetchFinancials(ticker)`
Add to `frontend/src/lib/api.ts` — calls `GET /api/equity/{ticker}/financials`.

### New component: `DESScreen.tsx`
Location: `frontend/src/components/screens/DESScreen.tsx`

**Props:**
```typescript
interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}
```

**Queries:**
```typescript
// Page 1 — shared cache with EquityScreen
useQuery(['equity', ticker], () => fetchEquity(ticker))

// Page 2 — lazy, only when tab 2 active
useQuery(['financials', ticker], () => fetchFinancials(ticker), {
  enabled: activeTab === 2
})
```

**Tab state:** `useState(1)` for active tab (1-indexed, matches Bloomberg convention).

**Description expand:** `useState(false)` for `showFullDescription`.

### App.tsx routing
Add `case 'des'` to the screen switch:
```typescript
case 'des':
  return <DESScreen ticker={activeCommand.ticker} onNavigate={handleNavigate} />
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
- Active tab: amber border `#ff9900`, text `#ff9900`
- Inactive tab: `#2a2a2a` border, `#554400` text
- Section dividers: `1px solid #2a2a2a`
- Font: `JetBrains Mono, IBM Plex Mono, Courier New, monospace`, `12px`
- Positive values (gains): `#00ff41`
- Negative values (losses): `#ff3333`

---

## Error & Loading States

- **Loading (Page 1):** `LoadingBar` component across panel top + `LOADING SECURITY DATA...` dim text centered
- **Error (Page 1):** `SECURITY UNAVAILABLE — {TICKER} NOT FOUND` in `#ff3333`, centered
- **Empty ticker:** Falls through to HomeScreen (no DES rendered)
- **Loading (Page 2):** Same LoadingBar pattern, only shown when tab 2 is active
- **Financials error:** `FINANCIAL DATA UNAVAILABLE` centered in tab 2 panel area

---

## Files Changed

| File | Change |
|------|--------|
| `backend/routers/equity.py` | Add 4 fields to existing response + new `/financials` route |
| `frontend/src/types/index.ts` | Add `FinancialsData` type + 4 fields to `EquityData` |
| `frontend/src/lib/api.ts` | Add `fetchFinancials()` function |
| `frontend/src/components/screens/DESScreen.tsx` | New component (create) |
| `frontend/src/App.tsx` | Add `case 'des'` to screen router |
