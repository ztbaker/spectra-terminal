import pytest
import os
import tempfile
import importlib
import sys

@pytest.fixture(autouse=True)
def temp_db(monkeypatch):
    """Use a temp SQLite file for every test."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    monkeypatch.setenv("DB_PATH", db_path)
    # Reload modules in dependency order so they pick up the new DB_PATH
    import config, database, cache
    importlib.reload(config)
    importlib.reload(database)
    importlib.reload(cache)
    yield db_path
    os.unlink(db_path)

@pytest.fixture(autouse=True)
def fake_api_keys(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "test_fred_key")
    monkeypatch.setenv("FINNHUB_API_KEY", "test_finnhub_key")
