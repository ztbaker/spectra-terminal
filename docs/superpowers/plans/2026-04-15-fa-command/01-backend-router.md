# Agent 1 — Backend Router & Provider Ingestion

**Read `00-shared-contract.md` first. You own the contract's request/response plumbing.**

## Scope

Build the `/api/fa/{ticker}` endpoint end-to-end: provider method(s), data assembly, caching, router wiring. You do NOT implement the ratio/growth math — that's Agent 2's `backend/analytics/financials.py`. Import those functions; do not inline formulas.

## Files

**Create:**
- `backend/routers/fa.py`

**Modify:**
- `backend/providers/yfinance_provider.py` — add financial-statements fetchers if absent
- `backend/main.py` — register the new router

**Do NOT touch:**
- `backend/analytics/financials.py` (Agent 2's file — you only import from it)
- Any frontend file

## Provider Extension (`yfinance_provider.py`)

Add if missing:

```python
async def get_financials_raw(self, ticker: str, period: str) -> dict:
    """
    period: 'annual' or 'quarterly'
    Returns: {
        "income": pd.DataFrame | None,
        "balance": pd.DataFrame | None,
        "cashflow": pd.DataFrame | None,
        "info": dict,
    }
    """
    def _fetch():
        t = yf.Ticker(ticker)
        if period == "quarterly":
            return {
                "income":   t.quarterly_income_stmt,
                "balance":  t.quarterly_balance_sheet,
                "cashflow": t.quarterly_cashflow,
                "info":     t.info or {},
            }
        return {
            "income":   t.income_stmt,
            "balance":  t.balance_sheet,
            "cashflow": t.cashflow,
            "info":     t.info or {},
        }
    try:
        return await self._retry(_fetch)
    except Exception:
        return {"income": None, "balance": None, "cashflow": None, "info": {}}
```

Field mapping (yfinance row label → contract field). Keep a single `_FIELD_MAP` dict; unknown rows are ignored:

```python
_INCOME_MAP = {
    "Total Revenue":          "total_revenue",
    "Cost Of Revenue":        "cost_of_revenue",
    "Gross Profit":           "gross_profit",
    "Operating Expense":      "operating_expense",
    "Operating Income":       "operating_income",
    "EBITDA":                 "ebitda",
    "Interest Expense":       "interest_expense",
    "Pretax Income":          "pretax_income",
    "Tax Provision":          "tax_provision",
    "Net Income":             "net_income",
    "Diluted EPS":            "diluted_eps",
    "Basic EPS":              "basic_eps",
}
_BALANCE_MAP = {
    "Total Assets":                 "total_assets",
    "Current Assets":               "current_assets",
    "Cash And Cash Equivalents":    "cash_and_equivalents",
    "Inventory":                    "inventory",
    "Accounts Receivable":          "receivables",
    "Net PPE":                      "ppe",
    "Goodwill":                     "goodwill",
    "Total Liabilities Net Minority Interest": "total_liabilities",
    "Current Liabilities":          "current_liabilities",
    "Long Term Debt":               "long_term_debt",
    "Total Debt":                   "total_debt",
    "Stockholders Equity":          "total_equity",
    "Share Issued":                 "shares_outstanding",
}
_CASHFLOW_MAP = {
    "Operating Cash Flow":   "operating_cash_flow",
    "Investing Cash Flow":   "investing_cash_flow",
    "Financing Cash Flow":   "financing_cash_flow",
    "Capital Expenditure":   "capex",
    "Free Cash Flow":        "free_cash_flow",
    "Cash Dividends Paid":   "dividends_paid",
    "Repurchase Of Capital Stock": "share_repurchases",
}
```

## Router (`backend/routers/fa.py`)

Skeleton:

```python
from fastapi import APIRouter, Query
from datetime import datetime, timezone
import math
import pandas as pd

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL
from analytics.financials import (
    compute_ratios,      # (income_rows, balance_rows, cashflow_rows) -> list[FARatios]
    compute_growth,      # (income_rows, cashflow_rows)               -> FAGrowth
    compute_valuation,   # (info, latest_period, latest_ratios)       -> FAValuation
)
from models.shared import FAResponse, FAPeriod, FARatios, FAValuation, FAGrowth, FAOverview

router = APIRouter()

def _safe_float(x):
    if x is None: return None
    try:
        f = float(x)
        return None if math.isnan(f) or math.isinf(f) else f
    except Exception:
        return None

def _df_to_periods(df: pd.DataFrame | None, field_map: dict[str, str]) -> list[dict]:
    if df is None or df.empty:
        return []
    periods: list[dict] = []
    for col in df.columns:  # columns are period end dates
        period: dict = {"date": col.isoformat() if hasattr(col, 'isoformat') else str(col)[:10]}
        for row_label, field in field_map.items():
            if row_label in df.index:
                period[field] = _safe_float(df.at[row_label, col])
        periods.append(period)
    # yfinance returns most-recent-first already; ensure that
    periods.sort(key=lambda p: p["date"], reverse=True)
    return periods

def _merge_into_fa_periods(income: list[dict], balance: list[dict], cashflow: list[dict]) -> tuple[list[FAPeriod], list[FAPeriod], list[FAPeriod]]:
    return (
        [FAPeriod(**p) for p in income],
        [FAPeriod(**p) for p in balance],
        [FAPeriod(**p) for p in cashflow],
    )

@router.get("/fa/{ticker}", response_model=FAResponse)
async def get_fa(ticker: str, period: str = Query("annual", regex="^(annual|quarterly)$")):
    ticker = ticker.upper()
    cache_key = f"fa_{ticker}_{period}"

    cached = cache_get("financials", cache_key, TTL["financials"])
    if cached:
        return FAResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        return _empty(ticker, period)

    raw = await provider.get_financials_raw(ticker, period)
    info = raw.get("info") or {}

    income_rows   = _df_to_periods(raw.get("income"),   _INCOME_MAP)
    balance_rows  = _df_to_periods(raw.get("balance"),  _BALANCE_MAP)
    cashflow_rows = _df_to_periods(raw.get("cashflow"), _CASHFLOW_MAP)

    # Truncate: 5 annual or 8 quarterly
    limit = 8 if period == "quarterly" else 5
    income_rows   = income_rows[:limit]
    balance_rows  = balance_rows[:limit]
    cashflow_rows = cashflow_rows[:limit]

    ratios    = compute_ratios(income_rows, balance_rows, cashflow_rows)
    growth    = compute_growth(income_rows, cashflow_rows)
    latest_period = {**(income_rows[0] if income_rows else {}),
                     **(balance_rows[0] if balance_rows else {}),
                     **(cashflow_rows[0] if cashflow_rows else {})}
    latest_ratios = ratios[0] if ratios else None
    valuation = compute_valuation(info, latest_period, latest_ratios)

    overview = FAOverview(
        company_name        = info.get("longName") or info.get("shortName"),
        sector              = info.get("sector"),
        industry            = info.get("industry"),
        employees           = info.get("fullTimeEmployees"),
        description         = info.get("longBusinessSummary"),
        exchange            = info.get("exchange"),
        shares_outstanding  = _safe_float(info.get("sharesOutstanding")),
        beta                = _safe_float(info.get("beta")),
        week52_high         = _safe_float(info.get("fiftyTwoWeekHigh")),
        week52_low          = _safe_float(info.get("fiftyTwoWeekLow")),
        current_price       = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice")),
    )

    income_stmt, balance_sheet, cash_flow = _merge_into_fa_periods(income_rows, balance_rows, cashflow_rows)

    resp = FAResponse(
        ticker=ticker,
        period=period,
        currency=info.get("financialCurrency") or "USD",
        as_of=datetime.now(timezone.utc).isoformat(),
        overview=overview,
        income_statement=income_stmt,
        balance_sheet=balance_sheet,
        cash_flow=cash_flow,
        ratios=ratios,
        valuation=valuation,
        growth=growth,
        cached=False,
    )

    cache_set("financials", cache_key, resp.model_dump())
    return resp
```

`_empty(ticker, period)` returns a fully-populated `FAResponse` with None fields — do not 500.

## Model Registration

Place Pydantic models in `backend/models/shared.py` (already exists — extend it) so analytics module can import them too.

## `main.py` Wiring

Add:
```python
from routers import fa
app.include_router(fa.router, prefix="/api")
```

## Tests

Create `backend/tests/test_fa.py`:
1. `test_fa_aapl_annual_returns_5_periods()` — hit the endpoint with `AAPL`, assert 200 + 5 income periods.
2. `test_fa_quarterly_returns_8_periods()` — same with `period=quarterly`.
3. `test_fa_bogus_ticker_returns_200_with_empty_statements()` — no 500s.
4. `test_fa_cache_second_call_marked_cached()`.

Use `TestClient` and `monkeypatch` to mock `yfinance_provider.get_financials_raw` with a fixture DataFrame — do NOT hit live yfinance in tests.

## Done when

- `curl http://localhost:8000/api/fa/AAPL` returns a full JSON shape matching the contract.
- `curl http://localhost:8000/api/fa/ZZZZ` returns 200 with empty lists.
- `curl http://localhost:8000/api/fa/AAPL?period=quarterly` returns 8 periods.
- All 4 new tests pass.
- No changes to frontend, to `analytics/financials.py`, or to any file outside the scope above.
