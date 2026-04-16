import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app
from database import init_db
from routers.fx import FX_PAIRS


FAKE_QUOTE = {"price": 1.0832, "prev_close": 1.0800}


@pytest.fixture
def client(temp_db):
    init_db(temp_db)
    with TestClient(app) as c:
        yield c


def test_fx_rates_returns_correct_shape(client):
    """GET /api/fx/rates returns a rates dict and fetched_at timestamp."""
    with patch("providers.yfinance_provider.YFinanceProvider.get_fast_quote_raw", new=AsyncMock(return_value=FAKE_QUOTE)):
        resp = client.get("/api/fx/rates")
    assert resp.status_code == 200
    data = resp.json()
    assert "rates" in data
    assert "fetched_at" in data
    assert isinstance(data["rates"], dict)
    assert "EURUSD=X" in data["rates"]


def test_fx_rates_values_are_floats_or_null(client):
    """Rate values are floats (or null) — never strings or missing keys."""
    with patch("providers.yfinance_provider.YFinanceProvider.get_fast_quote_raw", new=AsyncMock(return_value=FAKE_QUOTE)):
        resp = client.get("/api/fx/rates")
    rates = resp.json()["rates"]
    for key, val in rates.items():
        assert val is None or isinstance(val, float), f"{key} = {val!r}"


def test_fx_rates_uses_cache_on_second_call(client):
    """Second call within 15s TTL does not call get_fast_quote again."""
    with patch("providers.yfinance_provider.YFinanceProvider.get_fast_quote_raw", new=AsyncMock(return_value=FAKE_QUOTE)) as mock:
        client.get("/api/fx/rates")
        client.get("/api/fx/rates")
    # Each pair fetched once, not twice
    assert mock.call_count == len(FX_PAIRS)


def test_fx_rates_handles_null_price_gracefully(client):
    """If get_fast_quote returns no price, the rate is null — no 500 error."""
    with patch("providers.yfinance_provider.YFinanceProvider.get_fast_quote_raw", new=AsyncMock(return_value={})):
        resp = client.get("/api/fx/rates")
    assert resp.status_code == 200
    rates = resp.json()["rates"]
    for val in rates.values():
        assert val is None
