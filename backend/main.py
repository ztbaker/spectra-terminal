import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from config import settings
from database import init_db

from routers import (
    equity,
    chart,
    options,
    news,
    econ,
    portfolio,
    watchlist,
    earnings,
    screener,
    fx,
    crypto,
    filings,
    macro,
    indices,
    ecst,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="BakerTerminal API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(equity.router,    prefix="/api")
app.include_router(chart.router,     prefix="/api")
app.include_router(options.router,   prefix="/api")
app.include_router(news.router,      prefix="/api")
app.include_router(econ.router,      prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(earnings.router,  prefix="/api")
app.include_router(screener.router,  prefix="/api")
app.include_router(fx.router,        prefix="/api")
app.include_router(crypto.router,    prefix="/api")
app.include_router(filings.router,   prefix="/api")
app.include_router(macro.router,     prefix="/api")
app.include_router(indices.router,   prefix="/api")
app.include_router(ecst.router,      prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}


# ─── Serve built React frontend (Electron / standalone mode) ──────────────────
_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")

if os.path.isdir(_DIST):
    _ASSETS = os.path.join(_DIST, "assets")
    if os.path.isdir(_ASSETS):
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve specific root-level files (favicon, etc.) if they exist
        candidate = os.path.join(_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_DIST, "index.html"))
