# Agent 4 — Frontend Presentational Components

**Read `00-shared-contract.md` first. Agent 3 wires you up; you don't fetch or route.**

## Scope

Six purely presentational components that render financial data passed in as props. No data fetching. No React Query. No command routing. Assume you receive a valid `FAResponse` (or a slice of it) and render Bloomberg/TradingView-quality tables and panels.

## Files

**Create (all under new dir `frontend/src/components/fa/`):**
- `OverviewStrip.tsx`
- `IncomeTable.tsx`
- `BalanceTable.tsx`
- `CashFlowTable.tsx`
- `RatiosPanel.tsx`
- `ValuationPanel.tsx`

**Do NOT touch:**
- `FAScreen.tsx` (Agent 3 owns it)
- Backend, types, api.ts, commandParser, App.tsx

## Shared Utilities

At the top of each file (or in a new `frontend/src/components/fa/_format.ts`):

```ts
// $1.23B, $456.7M, $12.3K, $0.12, or — if null
export function fmtCurrency(n: number | null): string { ... }

// 24.5%, -3.2%, or — if null
export function fmtPct(n: number | null): string { ... }

// 1.23x, 12.4x, or — if null (for multiples / turnover)
export function fmtMultiple(n: number | null): string { ... }

// green if positive, red if negative, dim if null/zero
export function colorForDelta(n: number | null): string { ... }
```

Use `C.green`, `C.red`, `C.whiteDim` from `../../lib/colors`.

## OverviewStrip

Props: `{ overview: FAOverview, ticker: string }`

Single horizontal row (flex), above the tab bar. Cells separated by `1px solid ${C.border0}`, padded 8px. Each cell shows label (tiny uppercase, `C.amberMute`) + value (larger, `C.white`).

Cells in order:
1. Company name (spans 2×) + sector / industry stacked small
2. Current price + 52w range ( `low — high` with a tiny position dot)
3. Market cap
4. Employees
5. Beta
6. Exchange

If a field is null, render `—` in `C.border1`.

## IncomeTable

Props: `{ data: FAResponse }`

Use `frontend/src/components/shared/DataTable.tsx`. Rows are metrics, columns are periods.

Transpose: leftmost column = metric label, remaining columns = period dates (YYYY-MM-DD, most recent left).

Rows in this order:
1. Total Revenue
2. Cost of Revenue
3. **Gross Profit** (bold)
4. Operating Expense
5. **Operating Income** (bold)
6. EBITDA
7. Interest Expense
8. Pretax Income
9. Tax Provision
10. **Net Income** (bold, amber)
11. Diluted EPS  (4-decimal format)
12. Basic EPS    (4-decimal format)

Values formatted via `fmtCurrency` except EPS which uses `n.toFixed(2)`.

Below the table, a QoQ/YoY row strip: for each period pair, show `Revenue Δ%`, `NI Δ%`, `EPS Δ%`, color-coded with `colorForDelta`.

## BalanceTable

Same pattern. Rows:
1. Total Assets (bold)
2.   Current Assets
3.   Cash & Equivalents
4.   Receivables
5.   Inventory
6.   PPE (Net)
7.   Goodwill
8. **Total Liabilities** (bold)
9.   Current Liabilities
10.  Long-Term Debt
11.  Total Debt
12. **Total Equity** (bold, amber)
13. Shares Outstanding

Indent child rows with 12px left padding. Use `formatCurrency` for all except shares (use `fmtMultiple` style `n.toLocaleString()` + "shs").

## CashFlowTable

Rows:
1. Operating Cash Flow (bold)
2. Capex
3. **Free Cash Flow** (bold, amber)
4. Investing Cash Flow
5. Financing Cash Flow
6. Dividends Paid
7. Share Repurchases

## RatiosPanel

Props: `{ data: FAResponse }`

Grouped layout. Four sections in a 2×2 CSS grid (≥1024px) or stacked (<1024px):

**Profitability** · **Liquidity** · **Leverage** · **Efficiency**

Each section is a small table: metric label, value (latest), sparkline (historical, uses Lightweight Charts or the existing `frontend/src/components/shared/Sparkline.tsx`), delta chip (vs. previous period).

Metrics per section:
- Profitability: Gross Margin, Operating Margin, Net Margin, EBITDA Margin, ROE, ROA, ROIC
- Liquidity: Current, Quick, Cash
- Leverage: D/E, D/A, Interest Coverage
- Efficiency: Asset Turnover, Inventory Turnover, Receivables Turnover

Sparklines: 5-point line (or however many ratios periods exist). Color amber.

Delta chip: `▲ +2.3pp` (green) / `▼ -1.1pp` (red) / `— flat`. For ratios measured as %, delta in percentage points; for multiples, in "x".

## ValuationPanel

Props: `{ data: FAResponse }`

Two columns:

**Left** — a labelled grid of 12 metrics (from `FAValuation`) each with one-line plain-language interpretation. Thresholds:
- P/E < 15 → "attractive" (green) · 15–25 "fair" (amber) · >25 "premium" (red)
- EV/EBITDA < 10 → "cheap" · 10–18 "fair" · >18 "rich"
- FCF yield > 5% → "strong" · 2–5% "moderate" · <2% "weak"
- Dividend yield > 3% "income" · 1–3% "modest" · <1% or null "minimal"

**Right** — a compact "quick take" card: 3 bullet points synthesized from the valuation + growth combo (e.g., "Revenue growing 12% YoY with P/S 4.2 → growth-adjusted fair", "FCF margin 22%, FCF yield 4.8% → healthy cash returns", "D/E 1.8 → leverage above sector median").

## Visual / Aesthetic Rules

- Use `JetBrains Mono` (inherited from global).
- Numbers right-aligned in tables.
- 11px metric labels, 12–14px numeric values.
- Alternating row shading: `C.surface0` / `C.surface1`.
- Section headers: uppercase 10px `C.amberMute`, `letter-spacing: 0.08em`, thin amber underline.
- Always use color tokens from `../../lib/colors`. No raw hex.
- NO emojis.
- Motion: subtle cell flash on mount (fade-in from `rgba(255,153,0,0.15)` to transparent over 400ms) — only on initial render, not on tab switch.

## Accessibility

All tables must use proper `<thead>` / `<tbody>`. Tab bar (Agent 3) handles ARIA; you just render content.

## Done when

- All six components render correctly given realistic `FAResponse` fixtures.
- No network calls, no query hooks, no command parsing logic inside these files.
- No TS errors (`npm run build`).
- Visual check: each component looks like a Bloomberg/TradingView-grade widget — dense, monospace, amber-accented, zero fluff.
- Can be unit-tested in isolation with mocked `FAResponse` data.
