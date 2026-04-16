import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from analytics.financials import compute_ratios, compute_growth, compute_valuation
from models.shared import FARatios, FAGrowth, FAValuation


def _aapl_income():
    return [
        {
            "date": "2024-09-28",
            "total_revenue": 391000000000,
            "cost_of_revenue": 210000000000,
            "gross_profit": 181000000000,
            "operating_expense": 60000000000,
            "operating_income": 121000000000,
            "ebitda": 135000000000,
            "interest_expense": 4000000000,
            "pretax_income": 117000000000,
            "tax_provision": 19500000000,
            "net_income": 97500000000,
            "diluted_eps": 6.14,
            "basic_eps": 6.22,
        },
        {
            "date": "2023-09-30",
            "total_revenue": 383000000000,
            "cost_of_revenue": 215000000000,
            "gross_profit": 168000000000,
            "operating_expense": 55000000000,
            "operating_income": 113000000000,
            "ebitda": 125000000000,
            "interest_expense": 3900000000,
            "pretax_income": 109000000000,
            "tax_provision": 16500000000,
            "net_income": 97000000000,
            "diluted_eps": 6.13,
            "basic_eps": 6.20,
        },
    ]


def _aapl_balance():
    return [
        {
            "date": "2024-09-28",
            "total_assets": 365000000000,
            "current_assets": 135000000000,
            "cash_and_equivalents": 30000000000,
            "inventory": 7000000000,
            "receivables": 66000000000,
            "ppe": 45000000000,
            "goodwill": 0,
            "total_liabilities": 270000000000,
            "current_liabilities": 120000000000,
            "long_term_debt": 100000000000,
            "total_debt": 110000000000,
            "total_equity": 95000000000,
            "shares_outstanding": 15500000000,
        },
        {
            "date": "2023-09-30",
            "total_assets": 352000000000,
            "current_assets": 128000000000,
            "cash_and_equivalents": 29500000000,
            "inventory": 6500000000,
            "receivables": 61000000000,
            "ppe": 43700000000,
            "goodwill": 0,
            "total_liabilities": 260000000000,
            "current_liabilities": 115000000000,
            "long_term_debt": 98000000000,
            "total_debt": 108000000000,
            "total_equity": 92000000000,
            "shares_outstanding": 15700000000,
        },
    ]


def _aapl_cashflow():
    return [
        {
            "date": "2024-09-28",
            "operating_cash_flow": 125000000000,
            "investing_cash_flow": -25000000000,
            "financing_cash_flow": -90000000000,
            "capex": -11000000000,
            "free_cash_flow": 114000000000,
            "dividends_paid": -15000000000,
            "share_repurchases": -70000000000,
        },
        {
            "date": "2023-09-30",
            "operating_cash_flow": 110000000000,
            "investing_cash_flow": -22000000000,
            "financing_cash_flow": -85000000000,
            "capex": -10500000000,
            "free_cash_flow": 99500000000,
            "dividends_paid": -14800000000,
            "share_repurchases": -60000000000,
        },
    ]


def test_compute_ratios_happy_path():
    ratios = compute_ratios(_aapl_income(), _aapl_balance(), _aapl_cashflow())
    assert len(ratios) == 2
    r0 = ratios[0]
    assert isinstance(r0, FARatios)
    assert r0.date == "2024-09-28"
    assert r0.gross_margin is not None and 0.4 < r0.gross_margin < 0.5
    assert r0.operating_margin is not None and 0.2 < r0.operating_margin < 0.4
    assert r0.net_margin is not None and 0.2 < r0.net_margin < 0.3
    assert r0.ebitda_margin is not None and 0.3 < r0.ebitda_margin < 0.4
    assert r0.roe is not None and 0.9 < r0.roe < 1.2
    assert r0.roa is not None and 0.2 < r0.roa < 0.4
    assert r0.roic is not None and 0.3 < r0.roic < 0.8
    assert r0.current_ratio is not None and 1.0 < r0.current_ratio < 1.2
    assert r0.quick_ratio is not None and r0.quick_ratio < r0.current_ratio
    assert r0.cash_ratio is not None and 0.2 < r0.cash_ratio < 0.3
    assert r0.debt_to_equity is not None and 1.0 < r0.debt_to_equity < 1.5
    assert r0.debt_to_assets is not None and 0.2 < r0.debt_to_assets < 0.4
    assert r0.interest_coverage is not None and r0.interest_coverage > 10
    assert r0.asset_turnover is not None and 1.0 < r0.asset_turnover < 1.2
    assert r0.fcf_margin is not None and 0.2 < r0.fcf_margin < 0.4
    assert r0.fcf_to_net_income is not None and 0.9 < r0.fcf_to_net_income < 1.3


def test_compute_ratios_zero_revenue_returns_none_margins():
    income = [
        {
            "date": "2024",
            "total_revenue": 0,
            "gross_profit": 100,
            "operating_income": 50,
            "net_income": 30,
            "ebitda": 60,
            "interest_expense": 5,
            "pretax_income": 45,
            "tax_provision": 10,
            "diluted_eps": 1.0,
            "basic_eps": 1.0,
            "cost_of_revenue": 50,
        }
    ]
    balance = [
        {
            "date": "2024",
            "total_assets": 500,
            "current_assets": 200,
            "cash_and_equivalents": 50,
            "inventory": 20,
            "receivables": 80,
            "current_liabilities": 100,
            "total_debt": 150,
            "total_equity": 350,
        }
    ]
    cashflow = [{"date": "2024", "free_cash_flow": 25}]
    ratios = compute_ratios(income, balance, cashflow)
    assert len(ratios) == 1
    r = ratios[0]
    assert r.gross_margin is None
    assert r.operating_margin is None
    assert r.net_margin is None
    assert r.ebitda_margin is None
    assert r.fcf_margin is None
    assert r.asset_turnover == 0.0
    assert r.inventory_turnover is not None
    assert r.receivables_turnover == 0.0


def test_compute_ratios_missing_balance_returns_none_liquidity():
    income = [
        {
            "date": "2024",
            "total_revenue": 1000,
            "gross_profit": 400,
            "operating_income": 200,
            "net_income": 150,
            "ebitda": 250,
            "interest_expense": 10,
            "pretax_income": 190,
            "tax_provision": 40,
            "diluted_eps": 1.5,
            "basic_eps": 1.6,
            "cost_of_revenue": 600,
        }
    ]
    cashflow = [{"date": "2024", "free_cash_flow": 120}]
    ratios = compute_ratios(income, [], cashflow)
    r = ratios[0]
    assert r.current_ratio is None
    assert r.quick_ratio is None
    assert r.cash_ratio is None
    assert r.debt_to_equity is None
    assert r.debt_to_assets is None
    assert r.roe is None
    assert r.roa is None
    assert r.gross_margin is not None
    assert r.net_margin is not None


def test_compute_growth_yoy_positive():
    income = [
        {
            "date": "2024",
            "total_revenue": 391,
            "net_income": 97.5,
            "diluted_eps": 6.14,
            "operating_income": 121,
        },
        {
            "date": "2023",
            "total_revenue": 383,
            "net_income": 97.0,
            "diluted_eps": 6.13,
            "operating_income": 113,
        },
    ]
    cashflow = [
        {"date": "2024", "free_cash_flow": 114},
        {"date": "2023", "free_cash_flow": 99.5},
    ]
    growth = compute_growth(income, cashflow)
    assert isinstance(growth, FAGrowth)
    assert growth.revenue_yoy is not None and growth.revenue_yoy > 0
    assert growth.net_income_yoy is not None
    assert growth.eps_yoy is not None
    assert growth.fcf_yoy is not None and growth.fcf_yoy > 0
    assert growth.operating_income_yoy is not None and growth.operating_income_yoy > 0


def test_compute_growth_insufficient_history_returns_none_cagr():
    income = [
        {
            "date": "2024",
            "total_revenue": 391,
            "net_income": 97.5,
            "diluted_eps": 6.14,
            "operating_income": 121,
        },
        {
            "date": "2023",
            "total_revenue": 383,
            "net_income": 97.0,
            "diluted_eps": 6.13,
            "operating_income": 113,
        },
    ]
    cashflow = [
        {"date": "2024", "free_cash_flow": 114},
        {"date": "2023", "free_cash_flow": 99.5},
    ]
    growth = compute_growth(income, cashflow)
    assert growth.revenue_3y_cagr is None
    assert growth.revenue_5y_cagr is None


def test_compute_valuation_uses_info_first_falls_back_to_computed():
    info = {
        "marketCap": 3000000000000,
        "enterpriseValue": 3200000000000,
        "trailingPE": 30.8,
        "forwardPE": 28.0,
        "pegRatio": 2.5,
        "priceToBook": 55.0,
        "priceToSalesTrailing12Months": 7.7,
        "dividendYield": 0.005,
        "payoutRatio": 0.15,
    }
    latest_period = {
        "total_debt": 110000000000,
        "cash_and_equivalents": 30000000000,
        "ebitda": 135000000000,
        "total_revenue": 391000000000,
        "diluted_eps": 6.14,
        "free_cash_flow": 114000000000,
    }
    val = compute_valuation(info, latest_period, None)
    assert isinstance(val, FAValuation)
    assert val.market_cap == 3000000000000
    assert val.enterprise_value == 3200000000000
    assert val.pe_ratio == 30.8
    assert val.forward_pe == 28.0
    assert val.peg_ratio == 2.5
    assert val.price_to_book == 55.0
    assert val.price_to_sales == 7.7
    assert val.dividend_yield == 0.005
    assert val.payout_ratio == 0.15
    assert val.ev_ebitda is not None
    assert val.ev_revenue is not None
    assert val.fcf_yield is not None


def test_compute_valuation_all_none_when_inputs_missing():
    val = compute_valuation({}, {}, None)
    assert isinstance(val, FAValuation)
    assert val.market_cap is None
    assert val.enterprise_value is None
    assert val.pe_ratio is None
    assert val.forward_pe is None
    assert val.peg_ratio is None
    assert val.price_to_book is None
    assert val.price_to_sales is None
    assert val.ev_ebitda is None
    assert val.ev_revenue is None
    assert val.dividend_yield is None
    assert val.payout_ratio is None
    assert val.fcf_yield is None


@pytest.mark.parametrize(
    "field,current_vals,zero_denom_key,zero_denom_val",
    [
        ("gross_margin", {"total_revenue": 0, "gross_profit": 40}, "total_revenue", 0),
        (
            "operating_margin",
            {"total_revenue": 0, "operating_income": 20},
            "total_revenue",
            0,
        ),
        ("net_margin", {"total_revenue": 0, "net_income": 15}, "total_revenue", 0),
        (
            "current_ratio",
            {"current_assets": 200, "current_liabilities": 0},
            "current_liabilities",
            0,
        ),
        (
            "quick_ratio",
            {"current_assets": 200, "inventory": 20, "current_liabilities": 0},
            "current_liabilities",
            0,
        ),
        (
            "cash_ratio",
            {"cash_and_equivalents": 50, "current_liabilities": 0},
            "current_liabilities",
            0,
        ),
        ("debt_to_equity", {"total_debt": 100, "total_equity": 0}, "total_equity", 0),
        ("debt_to_assets", {"total_debt": 100, "total_assets": 0}, "total_assets", 0),
    ],
)
def test_division_by_zero_sweep(field, current_vals, zero_denom_key, zero_denom_val):
    bal_keys = {
        "total_debt",
        "total_equity",
        "total_assets",
        "current_assets",
        "current_liabilities",
        "cash_and_equivalents",
        "inventory",
    }
    income_dict = {
        "date": "2024",
        **{k: v for k, v in current_vals.items() if k not in bal_keys},
    }
    balance_dict = {
        "date": "2024",
        **{k: v for k, v in current_vals.items() if k in bal_keys},
    }
    cashflow = [{}]
    ratios = compute_ratios([income_dict], [balance_dict], cashflow)
    assert getattr(ratios[0], field) is None


def test_roic_division_by_zero():
    income = [
        {
            "date": "2024",
            "operating_income": 50,
            "total_revenue": 200,
            "pretax_income": 60,
            "tax_provision": 12,
            "interest_expense": 5,
            "net_income": 48,
            "diluted_eps": 1.0,
            "basic_eps": 1.0,
            "gross_profit": 80,
            "cost_of_revenue": 120,
            "ebitda": 60,
        }
    ]
    balance = [
        {
            "date": "2024",
            "total_debt": 0,
            "total_equity": 0,
            "total_assets": 500,
            "current_assets": 200,
            "current_liabilities": 100,
            "cash_and_equivalents": 50,
            "inventory": 20,
            "receivables": 50,
        }
    ]
    cashflow = [{"date": "2024", "free_cash_flow": 30}]
    ratios = compute_ratios(income, balance, cashflow)
    assert ratios[0].roic is None


def test_growth_zero_denominator():
    income = [
        {
            "date": "2024",
            "total_revenue": 100,
            "net_income": 50,
            "diluted_eps": 2.0,
            "operating_income": 60,
        },
        {
            "date": "2023",
            "total_revenue": 0,
            "net_income": 0,
            "diluted_eps": 0,
            "operating_income": 0,
        },
    ]
    cashflow = [
        {"date": "2024", "free_cash_flow": 40},
        {"date": "2023", "free_cash_flow": 0},
    ]
    growth = compute_growth(income, cashflow)
    assert growth.revenue_yoy is None
    assert growth.net_income_yoy is None
    assert growth.eps_yoy is None
    assert growth.fcf_yoy is None
    assert growth.operating_income_yoy is None


def test_valuation_fallback_ev_and_pe():
    info = {"marketCap": 3000, "currentPrice": 150}
    latest_period = {
        "total_debt": 1100,
        "cash_and_equivalents": 300,
        "ebitda": 1350,
        "total_revenue": 3910,
        "diluted_eps": 6.14,
        "free_cash_flow": 1140,
    }
    val = compute_valuation(info, latest_period, None)
    assert val.enterprise_value == 3800
    assert val.pe_ratio is not None
    assert abs(val.pe_ratio - 150 / 6.14) < 0.01
