from fastapi import APIRouter, Query
from datetime import datetime, timezone
import math
import pandas as pd

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL
from analytics.financials import (
    compute_ratios,
    compute_growth,
    compute_valuation,
)
from models.shared import (
    FAResponse,
    FAPeriod,
    FARatios,
    FAValuation,
    FAGrowth,
    FAOverview,
)

router = APIRouter()

_INCOME_MAP = {
    "Total Revenue": "total_revenue",
    "Cost Of Revenue": "cost_of_revenue",
    "Gross Profit": "gross_profit",
    "Operating Expense": "operating_expense",
    "Operating Income": "operating_income",
    "EBITDA": "ebitda",
    "Interest Expense": "interest_expense",
    "Pretax Income": "pretax_income",
    "Tax Provision": "tax_provision",
    "Net Income": "net_income",
    "Diluted EPS": "diluted_eps",
    "Basic EPS": "basic_eps",
}

_BALANCE_MAP = {
    "Total Assets": "total_assets",
    "Current Assets": "current_assets",
    "Cash And Cash Equivalents": "cash_and_equivalents",
    "Inventory": "inventory",
    "Accounts Receivable": "receivables",
    "Net PPE": "ppe",
    "Goodwill": "goodwill",
    "Total Liabilities Net Minority Interest": "total_liabilities",
    "Current Liabilities": "current_liabilities",
    "Long Term Debt": "long_term_debt",
    "Total Debt": "total_debt",
    "Stockholders Equity": "total_equity",
    "Share Issued": "shares_outstanding",
}

_CASHFLOW_MAP = {
    "Operating Cash Flow": "operating_cash_flow",
    "Investing Cash Flow": "investing_cash_flow",
    "Financing Cash Flow": "financing_cash_flow",
    "Capital Expenditure": "capex",
    "Free Cash Flow": "free_cash_flow",
    "Cash Dividends Paid": "dividends_paid",
    "Repurchase Of Capital Stock": "share_repurchases",
}


def _safe_float(x):
    if x is None:
        return None
    try:
        f = float(x)
        return None if math.isnan(f) or math.isinf(f) else f
    except Exception:
        return None


def _df_to_periods(df: pd.DataFrame | None, field_map: dict[str, str]) -> list[dict]:
    if df is None or df.empty:
        return []
    periods: list[dict] = []
    for col in df.columns:
        period: dict = {
            "date": col.isoformat() if hasattr(col, "isoformat") else str(col)[:10]
        }
        for row_label, field in field_map.items():
            if row_label in df.index:
                period[field] = _safe_float(df.at[row_label, col])
        periods.append(period)
    periods.sort(key=lambda p: p["date"], reverse=True)
    return periods


def _merge_into_fa_periods(
    income: list[dict], balance: list[dict], cashflow: list[dict]
) -> tuple[list[FAPeriod], list[FAPeriod], list[FAPeriod]]:
    return (
        [FAPeriod(**p) for p in income],
        [FAPeriod(**p) for p in balance],
        [FAPeriod(**p) for p in cashflow],
    )


def _empty(ticker: str, period: str) -> FAResponse:
    return FAResponse(
        ticker=ticker,
        period=period,
        currency="USD",
        as_of=datetime.now(timezone.utc).isoformat(),
        overview=FAOverview(),
        income_statement=[],
        balance_sheet=[],
        cash_flow=[],
        ratios=[],
        valuation=FAValuation(),
        growth=FAGrowth(),
    )


@router.get("/fa/{ticker}", response_model=FAResponse)
async def get_fa(
    ticker: str, period: str = Query("annual", pattern="^(annual|quarterly)$")
):
    ticker = ticker.upper()
    cache_key = f"fa_{ticker}_{period}"

    cached = cache_get("financials", cache_key, TTL["financials"])
    if cached:
        cached["cached"] = True
        return FAResponse(**cached)

    provider = get_provider("yfinance")
    if not provider:
        return _empty(ticker, period)

    raw = await provider.get_financials_raw(ticker, period)
    info = raw.get("info") or {}

    income_rows = _df_to_periods(raw.get("income"), _INCOME_MAP)
    balance_rows = _df_to_periods(raw.get("balance"), _BALANCE_MAP)
    cashflow_rows = _df_to_periods(raw.get("cashflow"), _CASHFLOW_MAP)

    limit = 8 if period == "quarterly" else 5
    income_rows = income_rows[:limit]
    balance_rows = balance_rows[:limit]
    cashflow_rows = cashflow_rows[:limit]

    ratios = compute_ratios(income_rows, balance_rows, cashflow_rows)
    growth = compute_growth(income_rows, cashflow_rows)
    latest_period = {
        **(income_rows[0] if income_rows else {}),
        **(balance_rows[0] if balance_rows else {}),
        **(cashflow_rows[0] if cashflow_rows else {}),
    }
    latest_ratios = ratios[0] if ratios else None
    valuation = compute_valuation(info, latest_period, latest_ratios)

    overview = FAOverview(
        company_name=info.get("longName") or info.get("shortName"),
        sector=info.get("sector"),
        industry=info.get("industry"),
        employees=info.get("fullTimeEmployees"),
        description=info.get("longBusinessSummary"),
        exchange=info.get("exchange"),
        shares_outstanding=_safe_float(info.get("sharesOutstanding")),
        beta=_safe_float(info.get("beta")),
        week52_high=_safe_float(info.get("fiftyTwoWeekHigh")),
        week52_low=_safe_float(info.get("fiftyTwoWeekLow")),
        current_price=_safe_float(
            info.get("currentPrice") or info.get("regularMarketPrice")
        ),
    )

    income_stmt, balance_sheet, cash_flow = _merge_into_fa_periods(
        income_rows, balance_rows, cashflow_rows
    )

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
