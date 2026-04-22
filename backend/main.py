import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from config import settings
from database import init_db
from middleware.auth import SharedKeyMiddleware

from routers import (
    auth,
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
    etf,
    fixedincome,
    commodity,
    congress,
    analytics,
    ai,
    bugreport,
    fa,
    chat,
    truthsocial,
    wsb,
    robinhood,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="SpectraTerminal API",
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

app.add_middleware(
    SharedKeyMiddleware,
    exempt_paths=[
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        # Email-link flows: users click these from their inbox in a browser
        # that has no shared key; the tokens themselves are the auth.
        "/api/auth/verify",
        "/api/auth/reset-password",
    ],
)

app.include_router(auth.router, prefix="/api")
app.include_router(equity.router, prefix="/api")
app.include_router(chart.router, prefix="/api")
app.include_router(options.router, prefix="/api")
app.include_router(news.router, prefix="/api")
app.include_router(econ.router, prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(earnings.router, prefix="/api")
app.include_router(screener.router, prefix="/api")
app.include_router(fx.router, prefix="/api")
app.include_router(crypto.router, prefix="/api")
app.include_router(filings.router, prefix="/api")
app.include_router(macro.router, prefix="/api")
app.include_router(indices.router, prefix="/api")
app.include_router(ecst.router, prefix="/api")
app.include_router(etf.router, prefix="/api")
app.include_router(fixedincome.router, prefix="/api")
app.include_router(commodity.router, prefix="/api")
app.include_router(congress.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(bugreport.router, prefix="/api")
app.include_router(fa.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(truthsocial.router, prefix="/api")
app.include_router(wsb.router, prefix="/api")
app.include_router(robinhood.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/providers")
async def health_providers():
    from providers import get_provider

    provider_names = [
        "yfinance",
        "finnhub",
        "fred",
        "edgar",
        "ecb",
        "bls",
        "eia",
        "usda",
        "cboe",
        "finra",
        "treasury",
        "congress",
        "stooq",
    ]
    providers_status = {}
    for name in provider_names:
        provider = get_provider(name)
        providers_status[name] = "registered" if provider else "missing"
    return {"providers": providers_status}


# ─── Serve built React frontend (Electron / standalone mode) ──────────────────
_DIST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist"
)

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
