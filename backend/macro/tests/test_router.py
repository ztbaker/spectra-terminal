"""Tests for MACRO router and scheduler."""

import sqlite3
import importlib
import os
import sys
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import database
import config
import macro.router
import macro.scheduler


@pytest.fixture
def db(tmp_path):
    db_path = str(tmp_path / "test.db")
    os.environ["DB_PATH"] = db_path
    importlib.reload(config)
    importlib.reload(database)
    importlib.reload(macro.router)
    importlib.reload(macro.scheduler)
    database.init_db()
    yield db_path
    os.environ.pop("DB_PATH", None)
    importlib.reload(config)
    importlib.reload(database)


@pytest.fixture
def client(db):
    from fastapi.testclient import TestClient
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(macro.router.router, prefix="/api")
    return TestClient(app)


class TestDashboardEmptyState:
    def test_dashboard_returns_valid_empty_state(self, client):
        resp = client.get("/api/macro/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["regime"]["regime"] == "mixed_no_edge"
        assert data["stale"] is True
        assert isinstance(data["asset_scores"], dict)
        assert isinstance(data["catalysts"], list)
        assert isinstance(data["trade_ideas"], list)

    def test_regime_returns_default_when_empty(self, client):
        resp = client.get("/api/macro/regime")
        assert resp.status_code == 200
        data = resp.json()
        assert data["regime"] == "mixed_no_edge"
        assert data["conviction"] == "low"

    def test_catalysts_returns_empty_list(self, client):
        resp = client.get("/api/macro/catalysts")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_ideas_returns_empty_list(self, client):
        resp = client.get("/api/macro/ideas")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_narrative_returns_none_when_empty(self, client):
        resp = client.get("/api/macro/narrative")
        assert resp.status_code == 200
        assert resp.json() is None


class TestDashboardWithData:
    def test_dashboard_with_regime_data(self, client, db):
        today = date.today().isoformat()
        with database.get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (today, "disinflation_risk_on", "high", 5, 0.85),
            )

        resp = client.get("/api/macro/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["regime"]["regime"] == "disinflation_risk_on"
        assert data["stale"] is False

    def test_regime_endpoint_returns_latest(self, client, db):
        today = date.today().isoformat()
        with database.get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (today, "reflation", "medium", 10, 0.7),
            )

        resp = client.get("/api/macro/regime")
        assert resp.status_code == 200
        data = resp.json()
        assert data["regime"] == "reflation"
        assert data["conviction"] == "medium"

    def test_catalysts_returns_stored_events(self, client, db):
        today = date.today().isoformat()
        with database.get_conn() as conn:
            conn.execute(
                """INSERT INTO macro_catalysts (event_date, event_time, event_type, event_label,
                     assets_impacted, consensus_value, prior_value, surprise_weight)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (today, "08:30", "CPI", "CPI MoM (May)", '["SPY","GLD"]', None, None, 1.5),
            )

        resp = client.get("/api/macro/catalysts")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["event_type"] == "CPI"

    def test_ideas_returns_stored_ideas(self, client, db):
        today = date.today().isoformat()
        with database.get_conn() as conn:
            conn.execute(
                """INSERT INTO macro_trade_ideas (generated_date, asset, direction, dte_min, dte_max,
                     structure, entry_condition, invalidation, conviction, iv_rank_context)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (today, "GLD", "long", 14, 21, "ATM call", "Enter on breakout", "Real rates rise", "high", "IV Rank 25% (cheap)"),
            )

        resp = client.get("/api/macro/ideas")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["asset"] == "GLD"

    def test_narrative_returns_stored_narrative(self, client, db):
        today = date.today().isoformat()
        with database.get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_narratives (date, stage, content, model_used) VALUES (?, ?, ?, ?)",
                (today, 1, "Regime narrative text", "gpt-4o"),
            )
            conn.execute(
                "INSERT INTO macro_narratives (date, stage, content, model_used) VALUES (?, ?, ?, ?)",
                (today, 2, "Trade narrative text", "gpt-4o"),
            )

        resp = client.get("/api/macro/narrative")
        assert resp.status_code == 200
        data = resp.json()
        assert data["regime_narrative"] == "Regime narrative text"
        assert data["trade_narrative"] == "Trade narrative text"


class TestStaleness:
    def test_stale_when_regime_date_is_not_today(self, client, db):
        yesterday = date(year=2020, month=1, day=1).isoformat()
        with database.get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (yesterday, "reflation", "medium", 10, 0.7),
            )

        resp = client.get("/api/macro/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["stale"] is True

    def test_not_stale_when_regime_date_is_today(self, client, db):
        today = date.today().isoformat()
        with database.get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (today, "reflation", "medium", 10, 0.7),
            )

        resp = client.get("/api/macro/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["stale"] is False


class TestRefresh:
    def test_refresh_returns_ok(self, client, db):
        with patch("macro.router.run_macro_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = {"status": "ok", "regime": "reflation", "ideas": 2, "date": "2025-01-01"}
            resp = client.post("/api/macro/refresh")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "ok"

    def test_refresh_handles_error(self, client, db):
        with patch("macro.router.run_macro_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.side_effect = RuntimeError("FRED_API_KEY not set")
            resp = client.post("/api/macro/refresh")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "error"


class TestSchedulerSetup:
    def test_scheduler_registers_jobs(self):
        with patch("macro.scheduler.AsyncIOScheduler") as MockScheduler:
            mock_instance = MagicMock()
            MockScheduler.return_value = mock_instance
            macro.scheduler.setup_scheduler(app=None)
            mock_instance.add_job.assert_called_once()
            call_args = mock_instance.add_job.call_args
            assert call_args[1]["id"] == "macro_daily"
            mock_instance.start.assert_called_once()