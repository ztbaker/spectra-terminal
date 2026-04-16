import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import pandas as pd
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

_FAKE_INFO = {
    "longName": "Apple Inc.",
    "shortName": "AAPL",
    "sector": "Technology",
    "industry": "Consumer Electronics",
    "fullTimeEmployees": 164000,
    "longBusinessSummary": "Apple Inc. designs smartphones.",
    "exchange": "NMS",
    "financialCurrency": "USD",
    "sharesOutstanding": 15_728_700_416,
    "beta": 1.29,
    "fiftyTwoWeekHigh": 199.62,
    "fiftyTwoWeekLow": 124.17,
    "currentPrice": 175.50,
    "regularMarketPrice": 175.50,
    "enterpriseValue": 2_800_000_000_000,
    "trailingPE": 28.5,
    "forwardPE": 26.2,
    "pegRatio": 3.0,
    "priceToBook": 45.6,
    "priceToSalesTrailing12Months": 7.5,
    "enterpriseToEbitda": 21.3,
    "enterpriseToRevenue": 7.0,
    "dividendYield": 0.0053,
    "payoutRatio": 0.15,
    "totalRevenue": 385_706_000_000,
}


def _make_income_df(years: int = 5) -> pd.DataFrame:
    dates = sorted(
        pd.date_range(end="2024-12-31", periods=years, freq="YE"), reverse=True
    )
    index = pd.Index(
        [
            "Total Revenue",
            "Cost Of Revenue",
            "Gross Profit",
            "Operating Expense",
            "Operating Income",
            "EBITDA",
            "Interest Expense",
            "Pretax Income",
            "Tax Provision",
            "Net Income",
            "Diluted EPS",
            "Basic EPS",
        ]
    )
    data = [
        [394_328_000_000 - i * 10_000_000_000 for i in range(years)],
        [220_000_000_000 - i * 5_000_000_000 for i in range(years)],
        [174_328_000_000 - i * 5_000_000_000 for i in range(years)],
        [50_000_000_000 - i * 1_000_000_000 for i in range(years)],
        [124_328_000_000 - i * 4_000_000_000 for i in range(years)],
        [140_000_000_000 - i * 3_000_000_000 for i in range(years)],
        [3_000_000_000 for _ in range(years)],
        [121_328_000_000 - i * 4_000_000_000 for i in range(years)],
        [20_000_000_000 - i * 500_000_000 for i in range(years)],
        [100_000_000_000 - i * 3_500_000_000 for i in range(years)],
        [6.40 - i * 0.2 for i in range(years)],
        [6.50 - i * 0.2 for i in range(years)],
    ]
    df = pd.DataFrame(data, index=index, columns=dates)
    return df


def _make_balance_df(years: int = 5) -> pd.DataFrame:
    dates = sorted(
        pd.date_range(end="2024-12-31", periods=years, freq="YE"), reverse=True
    )
    index = pd.Index(
        [
            "Total Assets",
            "Current Assets",
            "Cash And Cash Equivalents",
            "Inventory",
            "Accounts Receivable",
            "Net PPE",
            "Goodwill",
            "Total Liabilities Net Minority Interest",
            "Current Liabilities",
            "Long Term Debt",
            "Total Debt",
            "Stockholders Equity",
            "Share Issued",
        ]
    )
    data = [
        [350_000_000_000 - i * 5_000_000_000 for i in range(years)],
        [120_000_000_000 - i * 2_000_000_000 for i in range(years)],
        [60_000_000_000 - i * 1_000_000_000 for i in range(years)],
        [6_000_000_000 - i * 100_000_000 for i in range(years)],
        [60_000_000_000 - i * 1_000_000_000 for i in range(years)],
        [40_000_000_000 + i * 1_000_000_000 for i in range(years)],
        [0 for _ in range(years)],
        [280_000_000_000 - i * 4_000_000_000 for i in range(years)],
        [120_000_000_000 - i * 2_000_000_000 for i in range(years)],
        [100_000_000_000 - i * 2_000_000_000 for i in range(years)],
        [120_000_000_000 - i * 2_000_000_000 for i in range(years)],
        [70_000_000_000 - i * 1_000_000_000 for i in range(years)],
        [15_700_000_000 for _ in range(years)],
    ]
    df = pd.DataFrame(data, index=index, columns=dates)
    return df


def _make_cashflow_df(years: int = 5) -> pd.DataFrame:
    dates = sorted(
        pd.date_range(end="2024-12-31", periods=years, freq="YE"), reverse=True
    )
    index = pd.Index(
        [
            "Operating Cash Flow",
            "Investing Cash Flow",
            "Financing Cash Flow",
            "Capital Expenditure",
            "Free Cash Flow",
            "Cash Dividends Paid",
            "Repurchase Of Capital Stock",
        ]
    )
    data = [
        [120_000_000_000 - i * 2_000_000_000 for i in range(years)],
        [-50_000_000_000 + i * 1_000_000_000 for i in range(years)],
        [-70_000_000_000 + i * 1_000_000_000 for i in range(years)],
        [-10_000_000_000 for _ in range(years)],
        [110_000_000_000 - i * 2_000_000_000 for i in range(years)],
        [-15_000_000_000 for _ in range(years)],
        [-20_000_000_000 for _ in range(years)],
    ]
    df = pd.DataFrame(data, index=index, columns=dates)
    return df


def _mock_financials_raw(years: int = 5):
    return {
        "income": _make_income_df(years),
        "balance": _make_balance_df(years),
        "cashflow": _make_cashflow_df(years),
        "info": _FAKE_INFO,
    }


def _mock_financials_raw_empty():
    return {
        "income": None,
        "balance": None,
        "cashflow": None,
        "info": {},
    }


def _make_quarterly_income_df() -> pd.DataFrame:
    quarters = sorted(
        pd.date_range(end="2024-12-31", periods=8, freq="QE"), reverse=True
    )
    index = pd.Index(
        [
            "Total Revenue",
            "Cost Of Revenue",
            "Gross Profit",
            "Operating Expense",
            "Operating Income",
            "EBITDA",
            "Interest Expense",
            "Pretax Income",
            "Tax Provision",
            "Net Income",
            "Diluted EPS",
            "Basic EPS",
        ]
    )
    data = [
        [100_000_000_000 - i * 1_000_000_000 for i in range(8)],
        [55_000_000_000 - i * 500_000_000 for i in range(8)],
        [45_000_000_000 - i * 500_000_000 for i in range(8)],
        [15_000_000_000 for _ in range(8)],
        [30_000_000_000 - i * 500_000_000 for i in range(8)],
        [35_000_000_000 - i * 500_000_000 for i in range(8)],
        [800_000_000 for _ in range(8)],
        [29_200_000_000 - i * 500_000_000 for i in range(8)],
        [5_000_000_000 for _ in range(8)],
        [24_200_000_000 - i * 500_000_000 for i in range(8)],
        [1.55 - i * 0.03 for i in range(8)],
        [1.58 - i * 0.03 for i in range(8)],
    ]
    df = pd.DataFrame(data, index=index, columns=quarters)
    return df


def _make_quarterly_balance_df() -> pd.DataFrame:
    quarters = sorted(
        pd.date_range(end="2024-12-31", periods=8, freq="QE"), reverse=True
    )
    index = pd.Index(
        [
            "Total Assets",
            "Current Assets",
            "Cash And Cash Equivalents",
            "Inventory",
            "Accounts Receivable",
            "Net PPE",
            "Goodwill",
            "Total Liabilities Net Minority Interest",
            "Current Liabilities",
            "Long Term Debt",
            "Total Debt",
            "Stockholders Equity",
            "Share Issued",
        ]
    )
    data = [
        [350_000_000_000 for _ in range(8)],
        [120_000_000_000 for _ in range(8)],
        [60_000_000_000 for _ in range(8)],
        [6_000_000_000 for _ in range(8)],
        [60_000_000_000 for _ in range(8)],
        [40_000_000_000 for _ in range(8)],
        [0 for _ in range(8)],
        [280_000_000_000 for _ in range(8)],
        [120_000_000_000 for _ in range(8)],
        [100_000_000_000 for _ in range(8)],
        [120_000_000_000 for _ in range(8)],
        [70_000_000_000 for _ in range(8)],
        [15_700_000_000 for _ in range(8)],
    ]
    df = pd.DataFrame(data, index=index, columns=quarters)
    return df


def _make_quarterly_cashflow_df() -> pd.DataFrame:
    quarters = sorted(
        pd.date_range(end="2024-12-31", periods=8, freq="QE"), reverse=True
    )
    index = pd.Index(
        [
            "Operating Cash Flow",
            "Investing Cash Flow",
            "Financing Cash Flow",
            "Capital Expenditure",
            "Free Cash Flow",
            "Cash Dividends Paid",
            "Repurchase Of Capital Stock",
        ]
    )
    data = [
        [30_000_000_000 for _ in range(8)],
        [-12_000_000_000 for _ in range(8)],
        [-18_000_000_000 for _ in range(8)],
        [-3_000_000_000 for _ in range(8)],
        [27_000_000_000 for _ in range(8)],
        [-4_000_000_000 for _ in range(8)],
        [-5_000_000_000 for _ in range(8)],
    ]
    df = pd.DataFrame(data, index=index, columns=quarters)
    return df


def _mock_financials_raw_quarterly():
    return {
        "income": _make_quarterly_income_df(),
        "balance": _make_quarterly_balance_df(),
        "cashflow": _make_quarterly_cashflow_df(),
        "info": _FAKE_INFO,
    }


@pytest.fixture
def client(temp_db):
    from database import init_db

    init_db(temp_db)
    with TestClient(app) as c:
        yield c


from main import app


def test_fa_aapl_annual_returns_5_periods(client):
    with patch(
        "providers.yfinance_provider.YFinanceProvider.get_financials_raw",
        new=AsyncMock(return_value=_mock_financials_raw(5)),
    ):
        resp = client.get("/api/fa/AAPL")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["income_statement"]) == 5
    assert data["overview"]["company_name"] == "Apple Inc."
    assert data["ticker"] == "AAPL"
    assert data["period"] == "annual"


def test_fa_quarterly_returns_8_periods(client):
    with patch(
        "providers.yfinance_provider.YFinanceProvider.get_financials_raw",
        new=AsyncMock(return_value=_mock_financials_raw_quarterly()),
    ):
        resp = client.get("/api/fa/AAPL?period=quarterly")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["income_statement"]) == 8
    assert data["period"] == "quarterly"


def test_fa_bogus_ticker_returns_200_with_empty_statements(client):
    with patch(
        "providers.yfinance_provider.YFinanceProvider.get_financials_raw",
        new=AsyncMock(return_value=_mock_financials_raw_empty()),
    ):
        resp = client.get("/api/fa/ZZZZ")
    assert resp.status_code == 200
    data = resp.json()
    assert data["overview"]["company_name"] is None
    assert data["income_statement"] == []
    assert data["balance_sheet"] == []
    assert data["cash_flow"] == []


def test_fa_cache_second_call_marked_cached(client):
    with patch(
        "providers.yfinance_provider.YFinanceProvider.get_financials_raw",
        new=AsyncMock(return_value=_mock_financials_raw(5)),
    ):
        resp1 = client.get("/api/fa/AAPL")
        assert resp1.status_code == 200
        assert resp1.json()["cached"] is False

        resp2 = client.get("/api/fa/AAPL")
        assert resp2.status_code == 200
        assert resp2.json()["cached"] is True
