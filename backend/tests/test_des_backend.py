import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
import pytest
from database import init_db


def test_financials_cache_table_exists(temp_db):
    """financials_cache table is created by init_db."""
    init_db(temp_db)
    with sqlite3.connect(temp_db) as conn:
        tables = [
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
    assert "financials_cache" in tables


def test_financials_cache_columns(temp_db):
    """financials_cache has the right schema."""
    init_db(temp_db)
    with sqlite3.connect(temp_db) as conn:
        cols = [
            r[1] for r in conn.execute(
                "PRAGMA table_info(financials_cache)"
            ).fetchall()
        ]
    assert "ticker" in cols
    assert "data_json" in cols
    assert "cached_at" in cols


def test_financials_cache_set_and_get(temp_db):
    """cache_set/cache_get round-trip works for the 'financials' key."""
    init_db(temp_db)
    from cache import cache_set, cache_get, TTL
    payload = {"revenue_ttm": 385_706_000_000.0, "eps_ttm": 6.13}
    cache_set("financials", "AAPL", payload)
    result = cache_get("financials", "AAPL", TTL["financials"])
    assert result == payload


def test_financials_cache_miss_returns_none(temp_db):
    """cache_get returns None when key is not present."""
    init_db(temp_db)
    from cache import cache_get, TTL
    result = cache_get("financials", "MISSING", TTL["financials"])
    assert result is None


from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app

# Re-use this in both equity and financials tests
FAKE_INFO = {
    "longName": "Apple Inc.",
    "currentPrice": 175.50,
    "previousClose": 172.00,
    "volume": 55_000_000,
    "averageVolume": 48_000_000,
    "marketCap": 2_700_000_000_000,
    "trailingPE": 28.5,
    "forwardPE": 26.2,
    "trailingEps": 6.13,
    "fiftyTwoWeekHigh": 199.62,
    "fiftyTwoWeekLow": 124.17,
    "beta": 1.29,
    "dividendYield": 0.0053,
    "sector": "Technology",
    "industry": "Consumer Electronics",
    "industryDisp": "Consumer Electronics Devices",
    "longBusinessSummary": "Apple Inc. designs smartphones.",
    "exchange": "NMS",
    "currency": "USD",
    "country": "United States",
    "sharesOutstanding": 15_728_700_416,
    "floatShares": 15_706_000_000,
    "bid": 175.48,
    "ask": 175.52,
    "dayHigh": 176.10,
    "dayLow": 174.20,
    "open": 174.50,
    "companyOfficers": [
        {"name": "Tim Cook", "title": "Chief Executive Officer"},
        {"name": "Luca Maestri", "title": "Chief Financial Officer"},
    ],
    "address1": "One Apple Park Way",
    "city": "Cupertino",
    "state": "CA",
    "phone": "408-996-1010",
    "shortRatio": 1.47,
    "enterpriseToEbitda": 21.3,
    "priceToBook": 45.6,
    "fullTimeEmployees": 164_000,
    "website": "https://www.apple.com",
    "totalRevenue": 385_706_000_000,
    "netIncomeToCommon": 96_995_000_000,
    "grossMargins": 0.4431,
    "operatingMargins": 0.2994,
    "debtToEquity": 181.47,
    "currentRatio": 0.988,
    "returnOnEquity": 1.601,
    "returnOnAssets": 0.2217,
    "revenueGrowth": 0.0204,
    "earningsGrowth": 0.132,
}


@pytest.fixture
def client(temp_db):
    """TestClient with a fresh in-memory DB."""
    from database import init_db
    init_db(temp_db)
    with TestClient(app) as c:
        yield c


def test_equity_new_fields_present(client):
    """GET /api/equity/AAPL returns all new DES fields when yfinance has them."""
    with patch("providers.yfinance_provider.YFinanceProvider.get_ticker_info_raw", new=AsyncMock(return_value=FAKE_INFO)):
        resp = client.get("/api/equity/AAPL")
    assert resp.status_code == 200
    data = resp.json()
    assert data["country"] == "United States"
    assert data["sub_industry"] == "Consumer Electronics Devices"
    assert data["ceo"] == "Tim Cook"
    assert data["address"] == "One Apple Park Way, Cupertino, CA"
    assert data["phone"] == "408-996-1010"
    assert data["short_ratio"] == pytest.approx(1.47)
    assert data["forward_pe"] == pytest.approx(26.2)
    assert data["ev_ebitda"] == pytest.approx(21.3)
    assert data["price_to_book"] == pytest.approx(45.6)
    assert data["employees"] == 164_000
    assert data["website"] == "https://www.apple.com"


def test_equity_new_fields_null_when_missing(client):
    """New DES fields are null (not error) when yfinance doesn't have them."""
    sparse_info = {
        "longName": "Sparse Corp",
        "currentPrice": 10.0,
        "previousClose": 9.5,
    }
    with patch("providers.yfinance_provider.YFinanceProvider.get_ticker_info_raw", new=AsyncMock(return_value=sparse_info)):
        resp = client.get("/api/equity/SPARSE")
    assert resp.status_code == 200
    data = resp.json()
    assert data["country"] is None
    assert data["ceo"] is None
    assert data["address"] is None
    assert data["forward_pe"] is None


def test_equity_ceo_no_match_returns_none(client):
    """ceo field is None when companyOfficers has no CEO entry."""
    info = dict(FAKE_INFO, companyOfficers=[
        {"name": "Someone", "title": "Chief Financial Officer"}
    ])
    with patch("providers.yfinance_provider.YFinanceProvider.get_ticker_info_raw", new=AsyncMock(return_value=info)):
        resp = client.get("/api/equity/AAPL")
    assert resp.status_code == 200
    assert resp.json()["ceo"] is None


def test_equity_address_partial(client):
    """address field skips null address parts."""
    info = dict(FAKE_INFO, address1=None, city="Cupertino", state="CA")
    with patch("providers.yfinance_provider.YFinanceProvider.get_ticker_info_raw", new=AsyncMock(return_value=info)):
        resp = client.get("/api/equity/AAPL")
    assert resp.json()["address"] == "Cupertino, CA"


def test_financials_endpoint_returns_data(client):
    """GET /api/equity/AAPL/financials returns all financial fields."""
    with patch("providers.yfinance_provider.YFinanceProvider.get_ticker_info_raw", new=AsyncMock(return_value=FAKE_INFO)):
        resp = client.get("/api/equity/AAPL/financials")
    assert resp.status_code == 200
    data = resp.json()
    assert data["revenue_ttm"] == pytest.approx(385_706_000_000.0)
    assert data["net_income_ttm"] == pytest.approx(96_995_000_000.0)
    assert data["eps_ttm"] == pytest.approx(6.13)
    assert data["gross_margin"] == pytest.approx(0.4431)
    assert data["operating_margin"] == pytest.approx(0.2994)
    assert data["debt_to_equity"] == pytest.approx(181.47)
    assert data["current_ratio"] == pytest.approx(0.988)
    assert data["return_on_equity"] == pytest.approx(1.601)
    assert data["return_on_assets"] == pytest.approx(0.2217)
    assert data["revenue_growth"] == pytest.approx(0.0204)
    assert data["earnings_growth"] == pytest.approx(0.132)


def test_financials_endpoint_null_fields(client):
    """Financials fields are null (not omitted) when yfinance doesn't have them."""
    sparse_info = {"longName": "Sparse Corp", "currentPrice": 10.0}
    with patch("providers.yfinance_provider.YFinanceProvider.get_ticker_info_raw", new=AsyncMock(return_value=sparse_info)):
        resp = client.get("/api/equity/SPARSE/financials")
    assert resp.status_code == 200
    data = resp.json()
    assert data["revenue_ttm"] is None
    assert data["gross_margin"] is None


def test_financials_endpoint_uses_cache(client):
    """Second call to /financials does not call get_ticker_info again (cache hit)."""
    with patch("providers.yfinance_provider.YFinanceProvider.get_ticker_info_raw", new=AsyncMock(return_value=FAKE_INFO)) as mock:
        resp1 = client.get("/api/equity/AAPL/financials")
        resp2 = client.get("/api/equity/AAPL/financials")
    assert mock.call_count == 1
    assert resp2.json() == resp1.json()


def test_financials_endpoint_404_on_empty_info(client):
    """Returns 404 when yfinance returns empty info."""
    with patch("providers.yfinance_provider.YFinanceProvider.get_ticker_info_raw", new=AsyncMock(return_value={})):
        resp = client.get("/api/equity/FAKE/financials")
    assert resp.status_code == 404


def test_financials_endpoint_502_on_service_error(client):
    """Returns 502 when yfinance raises an exception."""
    with patch("providers.yfinance_provider.YFinanceProvider.get_ticker_info_raw", new=AsyncMock(side_effect=RuntimeError("timeout"))):
        resp = client.get("/api/equity/AAPL/financials")
    assert resp.status_code == 502
