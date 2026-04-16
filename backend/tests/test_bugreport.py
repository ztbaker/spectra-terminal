from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _setup_bugreport_env(monkeypatch):
    import middleware.auth as _mw
    import routers.bugreport as _br
    monkeypatch.setattr(_mw.settings, "SPECTRA_SHARED_KEY", "testkey", raising=False)
    monkeypatch.setattr(_br.settings, "GITHUB_TOKEN", "ghp_fake", raising=False)
    monkeypatch.setattr(_br.settings, "GITHUB_REPO",  "owner/spectra-terminal", raising=False)
    yield


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


def test_requires_auth(client):
    r = client.post("/api/bugreport", json={"summary": "abc", "description": "y"})
    assert r.status_code == 401


def test_rejects_missing_summary(client):
    r = client.post(
        "/api/bugreport",
        json={"description": "no summary"},
        headers={"X-Spectra-Key": "testkey"},
    )
    assert r.status_code == 422


@patch("routers.bugreport.httpx.Client")
def test_creates_github_issue(mock_client, client):
    instance = MagicMock()
    instance.__enter__.return_value = instance
    instance.post.return_value.status_code = 201
    instance.post.return_value.json.return_value = {
        "number": 42,
        "html_url": "https://github.com/owner/spectra-terminal/issues/42",
    }
    mock_client.return_value = instance

    payload = {
        "summary": "Equity screen blank on AAPL",
        "description": "Typed AAPL, screen stays blank.",
        "reporter": "friend-a",
        "app_version": "0.1.0",
        "os": "darwin",
        "screen": "EQUI",
        "last_error": "TypeError: x is undefined",
    }
    r = client.post(
        "/api/bugreport",
        json=payload,
        headers={"X-Spectra-Key": "testkey"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["issue_number"] == 42
    assert "github.com" in body["issue_url"]

    instance.post.assert_called_once()
    kwargs = instance.post.call_args.kwargs
    sent = kwargs["json"]
    assert sent["title"] == "[beta-bug] Equity screen blank on AAPL"
    assert "friend-a" in sent["body"]
    assert "0.1.0"    in sent["body"]
    assert "EQUI"     in sent["body"]
    assert "beta-bug" in sent["labels"]


def test_returns_503_when_not_configured(client, monkeypatch):
    import routers.bugreport as _br
    monkeypatch.setattr(_br.settings, "GITHUB_TOKEN", "", raising=False)
    r = client.post(
        "/api/bugreport",
        json={"summary": "abc", "description": "def"},
        headers={"X-Spectra-Key": "testkey"},
    )
    assert r.status_code == 503
