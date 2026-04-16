# FA Command — Shared Contract

**All four agents must adhere to this contract. Do not change without coordinating.**

## Command

Bloomberg-style: `AAPL FA` (ticker + screen code), analogous to `AAPL GP`, `AAPL OPT`, `AAPL QUANT`.

Defaults: annual, USD, 5-year lookback.

## Backend Endpoint

```
GET /api/fa/{ticker}?period=annual|quarterly
```

## Response Schema (Pydantic + TS — keep names identical)

```python
class FAPeriod(BaseModel):
    date: str                         # ISO date, most recent first
    # Income
    total_revenue: float | None = None
    cost_of_revenue: float | None = None
    gross_profit: float | None = None
    operating_expense: float | None = None
    operating_income: float | None = None
    ebitda: float | None = None
    interest_expense: float | None = None
    pretax_income: float | None = None
    tax_provision: float | None = None
    net_income: float | None = None
    diluted_eps: float | None = None
    basic_eps: float | None = None
    # Balance
    total_assets: float | None = None
    current_assets: float | None = None
    cash_and_equivalents: float | None = None
    inventory: float | None = None
    receivables: float | None = None
    ppe: float | None = None
    goodwill: float | None = None
    total_liabilities: float | None = None
    current_liabilities: float | None = None
    long_term_debt: float | None = None
    total_debt: float | None = None
    total_equity: float | None = None
    shares_outstanding: float | None = None
    # Cash flow
    operating_cash_flow: float | None = None
    investing_cash_flow: float | None = None
    financing_cash_flow: float | None = None
    capex: float | None = None
    free_cash_flow: float | None = None
    dividends_paid: float | None = None
    share_repurchases: float | None = None

class FARatios(BaseModel):
    date: str
    # Profitability
    gross_margin: float | None = None
    operating_margin: float | None = None
    net_margin: float | None = None
    ebitda_margin: float | None = None
    roe: float | None = None
    roa: float | None = None
    roic: float | None = None
    # Liquidity
    current_ratio: float | None = None
    quick_ratio: float | None = None
    cash_ratio: float | None = None
    # Leverage
    debt_to_equity: float | None = None
    debt_to_assets: float | None = None
    interest_coverage: float | None = None
    # Efficiency
    asset_turnover: float | None = None
    inventory_turnover: float | None = None
    receivables_turnover: float | None = None
    # Cash
    fcf_margin: float | None = None
    fcf_to_net_income: float | None = None

class FAValuation(BaseModel):
    market_cap: float | None = None
    enterprise_value: float | None = None
    pe_ratio: float | None = None
    forward_pe: float | None = None
    peg_ratio: float | None = None
    price_to_book: float | None = None
    price_to_sales: float | None = None
    ev_ebitda: float | None = None
    ev_revenue: float | None = None
    dividend_yield: float | None = None
    payout_ratio: float | None = None
    fcf_yield: float | None = None

class FAGrowth(BaseModel):
    revenue_yoy: float | None = None
    revenue_3y_cagr: float | None = None
    revenue_5y_cagr: float | None = None
    net_income_yoy: float | None = None
    eps_yoy: float | None = None
    fcf_yoy: float | None = None
    operating_income_yoy: float | None = None

class FAOverview(BaseModel):
    company_name: str | None = None
    sector: str | None = None
    industry: str | None = None
    employees: int | None = None
    description: str | None = None
    exchange: str | None = None
    shares_outstanding: float | None = None
    beta: float | None = None
    week52_high: float | None = None
    week52_low: float | None = None
    current_price: float | None = None

class FAResponse(BaseModel):
    ticker: str
    period: str                       # "annual" | "quarterly"
    currency: str = "USD"
    as_of: str                        # ISO datetime
    overview: FAOverview
    income_statement: list[FAPeriod]  # most recent first, max 5 annual / 8 quarterly
    balance_sheet: list[FAPeriod]
    cash_flow: list[FAPeriod]
    ratios: list[FARatios]            # one per income period, same dates
    valuation: FAValuation
    growth: FAGrowth
    cached: bool = False
```

## Cache

`TTL["financials"]` (3600s = 1 hour) via `cache_get("financials", f"fa_{ticker}_{period}")`.

Cache stored as full `FAResponse.model_dump()`.

## Error Behavior

- Never 500. On provider failure, return whatever partial data is available with the rest as `None`.
- If yfinance returns nothing for a ticker, return `FAResponse` with `overview.company_name = None` and empty lists — frontend shows "No data".

## Frontend Command Routing

In `frontend/src/lib/commandParser.ts`, `FA` is a ticker-scoped screen like `GP`, `OPT`. Dispatch: `{ screen: 'FA', ticker }`.

`App.tsx` switch renders `<FAScreen ticker={...} onNavigate={...} />`.

## TypeScript Types

In `frontend/src/types/index.ts`, mirror the Pydantic models verbatim as TS interfaces (`FAPeriod`, `FARatios`, `FAValuation`, `FAGrowth`, `FAOverview`, `FAResponse`). All fields nullable (`number | null`).

## Directory Conventions (do not violate)

- Backend routers → `backend/routers/fa.py`
- Backend analytics → `backend/analytics/financials.py`
- Frontend screen → `frontend/src/components/screens/FAScreen.tsx`
- Frontend sub-components → `frontend/src/components/fa/*.tsx` (new dir)
- Chart rendering must use TradingView Lightweight Charts. No other chart libs.
- Inline styles only — no CSS modules, no CSS-in-JS.
- Use React Query for server state. No Redux/Zustand.
- Colors from `frontend/src/lib/colors` (`C.amber`, `C.green`, `C.red`, etc).
- Font: JetBrains Mono.

## Acceptance (end-to-end)

Running `AAPL FA` in the command bar:
1. Loads within 3s (cold) / <200ms (cached).
2. Displays overview strip (company, sector, mkt cap, price, 52w range, beta).
3. Tabs for Income / Balance / Cash Flow / Ratios / Valuation. Default tab = Income.
4. Period toggle (Annual / Quarterly) re-queries.
5. Each statement table shows 5 (annual) or 8 (quarterly) periods, most recent left-most, amounts in human-readable units (B/M).
6. Ratio rows color-coded: green if improving YoY, red if worsening.
7. Valuation panel shows P/E, EV/EBITDA, FCF yield, etc., each with a single-line interpretation (e.g., "P/E 28.4 — premium to sector").
