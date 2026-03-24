import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app
from database import init_db


@pytest.fixture
def client(temp_db):
    init_db(temp_db)
    with TestClient(app) as c:
        yield c


def _fake_series(series_id, **kwargs):
    return {
        "series_id": series_id,
        "title": f"Fake {series_id}",
        "units": "%",
        "frequency": "M",
        "observations": [
            {"date": "2024-01-01", "value": 3.5},
            {"date": "2024-02-01", "value": 3.6},
            {"date": "2024-03-01", "value": 3.7},
        ],
    }


def test_ecst_returns_correct_shape(client):
    """GET /api/ecst returns entries list with required fields."""
    with patch("routers.ecst.get_series", new=AsyncMock(side_effect=_fake_series)), \
         patch("routers.ecst._get_release_date", new=AsyncMock(return_value="2024-04-05")):
        resp = client.get("/api/ecst")
    assert resp.status_code == 200
    data = resp.json()
    assert "entries" in data
    assert len(data["entries"]) > 0
    entry = data["entries"][0]
    for field in ("series_id", "category", "label", "value", "prior", "change",
                  "units", "frequency", "next_release_date", "sparkline"):
        assert field in entry, f"missing field: {field}"


def test_ecst_change_is_latest_minus_prior(client):
    """change == value - prior for a normal series."""
    with patch("routers.ecst.get_series", new=AsyncMock(side_effect=_fake_series)), \
         patch("routers.ecst._get_release_date", new=AsyncMock(return_value=None)):
        resp = client.get("/api/ecst")
    entry = resp.json()["entries"][0]
    assert entry["value"] == pytest.approx(3.7)
    assert entry["prior"] == pytest.approx(3.6)
    assert entry["change"] == pytest.approx(0.1)


def test_ecst_release_date_null_on_failure(client):
    """next_release_date is null when the FRED API call fails — no 500."""
    with patch("routers.ecst.get_series", new=AsyncMock(side_effect=_fake_series)), \
         patch("routers.ecst._get_release_date", new=AsyncMock(return_value=None)):
        resp = client.get("/api/ecst")
    assert resp.status_code == 200
    for entry in resp.json()["entries"]:
        assert entry["next_release_date"] is None


def test_ecst_uses_cache_on_second_call(client):
    """Second call within 900s TTL does not call get_series again."""
    with patch("routers.ecst.get_series", new=AsyncMock(side_effect=_fake_series)) as mock_series, \
         patch("routers.ecst._get_release_date", new=AsyncMock(return_value=None)):
        client.get("/api/ecst")
        first_call_count = mock_series.call_count
    assert first_call_count > 0
    # Second request should use cache — no new calls to get_series
    with patch("routers.ecst.get_series", new=AsyncMock(side_effect=_fake_series)) as mock2, \
         patch("routers.ecst._get_release_date", new=AsyncMock(return_value=None)):
        client.get("/api/ecst")
    assert mock2.call_count == 0


def test_ecst_entry_error_yields_null_values(client):
    """If get_series raises, the entry has null value/prior/change but still appears."""
    def side_effect(series_id, **kwargs):
        if series_id == "GDP":
            raise RuntimeError("FRED timeout")
        return _fake_series(series_id)

    with patch("routers.ecst.get_series", new=AsyncMock(side_effect=side_effect)), \
         patch("routers.ecst._get_release_date", new=AsyncMock(return_value=None)):
        resp = client.get("/api/ecst")
    assert resp.status_code == 200
    gdp = next((e for e in resp.json()["entries"] if e["series_id"] == "GDP"), None)
    assert gdp is not None
    assert gdp["value"] is None
    assert gdp["change"] is None
