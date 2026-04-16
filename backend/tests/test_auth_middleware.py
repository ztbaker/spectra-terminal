import os
os.environ["SPECTRA_SHARED_KEY"] = "testkey"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from middleware.auth import SharedKeyMiddleware


def _app():
    app = FastAPI()
    app.add_middleware(SharedKeyMiddleware, exempt_paths=["/health"])

    @app.get("/api/ping")
    def ping():
        return {"pong": True}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


def test_rejects_missing_header():
    client = TestClient(_app())
    r = client.get("/api/ping")
    assert r.status_code == 401


def test_rejects_wrong_header():
    client = TestClient(_app())
    r = client.get("/api/ping", headers={"X-Spectra-Key": "wrong"})
    assert r.status_code == 401


def test_accepts_correct_header():
    client = TestClient(_app())
    r = client.get("/api/ping", headers={"X-Spectra-Key": "testkey"})
    assert r.status_code == 200
    assert r.json() == {"pong": True}


def test_exempts_health():
    client = TestClient(_app())
    r = client.get("/health")
    assert r.status_code == 200
