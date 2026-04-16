# Agent 2 — Analytics Module (Ratios, Growth, Valuation)

**Read `00-shared-contract.md` first.**

## Scope

Pure Python math module. No I/O, no provider access, no FastAPI. Three public functions that Agent 1's router consumes. 100% unit-testable.

## Files

**Create:**
- `backend/analytics/financials.py`
- `backend/tests/test_financials.py`

**Do NOT touch:** anything else. You work in isolation.

## Public API

```python
from models.shared import FAPeriod, FARatios, FAValuation, FAGrowth

def compute_ratios(
    income: list[dict],        # list of income-period dicts, most recent first
    balance: list[dict],
    cashflow: list[dict],
) -> list[FARatios]: ...

def compute_growth(
    income: list[dict],
    cashflow: list[dict],
) -> FAGrowth: ...

def compute_valuation(
    info: dict,                # raw yfinance info dict
    latest_period: dict,       # merged latest income+balance+cashflow
    latest_ratios: FARatios | None,
) -> FAValuation: ...
```

## Ratio Formulas (exact — match these)

All division guards against zero/None → return None.

**Profitability**
- `gross_margin       = gross_profit / total_revenue`
- `operating_margin   = operating_income / total_revenue`
- `net_margin         = net_income / total_revenue`
- `ebitda_margin      = ebitda / total_revenue`
- `roe                = net_income / avg(total_equity_t, total_equity_{t-1})` (single-period → use current)
- `roa                = net_income / avg(total_assets)`
- `roic               = (operating_income * (1 - tax_rate)) / (total_debt + total_equity)`
  where `tax_rate = tax_provision / pretax_income`, clipped to [0, 0.5], fallback 0.21.

**Liquidity**
- `current_ratio      = current_assets / current_liabilities`
- `quick_ratio        = (current_assets - inventory) / current_liabilities`
- `cash_ratio         = cash_and_equivalents / current_liabilities`

**Leverage**
- `debt_to_equity     = total_debt / total_equity`
- `debt_to_assets     = total_debt / total_assets`
- `interest_coverage  = operating_income / abs(interest_expense)`

**Efficiency**
- `asset_turnover        = total_revenue / avg(total_assets)`
- `inventory_turnover    = cost_of_revenue / avg(inventory)`
- `receivables_turnover  = total_revenue / avg(receivables)`

**Cash**
- `fcf_margin         = free_cash_flow / total_revenue`
- `fcf_to_net_income  = free_cash_flow / net_income`

For `avg()` helpers, use `(current + prior) / 2` if both present else the current.

## Growth Formulas

```
revenue_yoy         = (rev[0] - rev[1]) / rev[1]
revenue_3y_cagr     = (rev[0] / rev[3]) ** (1/3) - 1
revenue_5y_cagr     = (rev[0] / rev[4]) ** (1/4) - 1   # 4 intervals between 5 points
net_income_yoy      = (ni[0] - ni[1]) / ni[1]
eps_yoy             = (eps[0] - eps[1]) / eps[1]
fcf_yoy             = (fcf[0] - fcf[1]) / fcf[1]
operating_income_yoy= (oi[0] - oi[1]) / oi[1]
```

If denominator ≤ 0 or missing, field is None. Guard CAGRs against negative base.

## Valuation Formulas

Prefer `info` dict values when present; compute fallback from `latest_period` otherwise.

```
market_cap        = info.marketCap
enterprise_value  = info.enterpriseValue  (fallback: market_cap + total_debt - cash_and_equivalents)
pe_ratio          = info.trailingPE       (fallback: price / diluted_eps)
forward_pe        = info.forwardPE
peg_ratio         = info.pegRatio
price_to_book     = info.priceToBook
price_to_sales    = info.priceToSalesTrailing12Months
ev_ebitda         = enterprise_value / ebitda
ev_revenue        = enterprise_value / total_revenue
dividend_yield    = info.dividendYield
payout_ratio      = info.payoutRatio
fcf_yield         = free_cash_flow / market_cap
```

## Tests (`test_financials.py`)

Write these with pytest, fixtures for sample periods:

1. `test_compute_ratios_happy_path` — AAPL-like fixture, assert all ratio fields present and in expected ranges.
2. `test_compute_ratios_zero_revenue_returns_none_margins`.
3. `test_compute_ratios_missing_balance_returns_none_liquidity`.
4. `test_compute_growth_yoy_positive`.
5. `test_compute_growth_insufficient_history_returns_none_cagr`.
6. `test_compute_valuation_uses_info_first_falls_back_to_computed`.
7. `test_compute_valuation_all_none_when_inputs_missing`.
8. Division-by-zero sweep across every ratio — must return None, never raise.

Use only stdlib + pytest. No pandas, no yfinance.

## Done when

- All 3 public functions implemented and typed.
- All 8 tests pass (`pytest backend/tests/test_financials.py`).
- Zero imports from `providers/`, `routers/`, `cache`, `database`. (Verify with `grep`.)
- Every ratio division guards against None / zero. Functions never raise on bad input.
