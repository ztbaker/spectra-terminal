import pytest
import os
import tempfile
import importlib
import sys


@pytest.fixture(autouse=True)
def temp_db(monkeypatch, request):
    """Use a temp SQLite file for every test."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    monkeypatch.setenv("DB_PATH", db_path)
    # Isolate SPECTRA_SHARED_KEY: the auth middleware test module sets it at
    # import time so it leaks into the rest of the suite. For non-auth tests,
    # force the middleware's settings binding to empty so it no-ops.
    if "test_auth_middleware" not in request.node.nodeid:
        monkeypatch.delenv("SPECTRA_SHARED_KEY", raising=False)
        # The middleware module binds to the settings object created at its
        # first import. Mutate that object directly so the middleware sees
        # an empty key and acts as a no-op for non-auth tests.
        try:
            import middleware.auth as _mw
            monkeypatch.setattr(_mw.settings, "SPECTRA_SHARED_KEY", "", raising=False)
        except ImportError:
            pass
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
