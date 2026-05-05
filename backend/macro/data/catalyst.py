"""Catalyst calendar builder — FRED releases, EIA schedule, OPEC, earnings."""

import json
import logging
import os
from datetime import date, datetime, timedelta, timezone

import httpx

from cache import cache_get, cache_set
from database import get_conn
from macro.models import CatalystEvent
from macro.types import AssetSymbol

logger = logging.getLogger(__name__)

CACHE_KEY = "macro_catalyst_calendar"
CACHE_TTL = 6 * 3600  # 6 hours

FRED_RELEASES_URL = "https://api.stlouisfed.org/fred/releases/dates"

FRED_RELEASE_MAP: dict[str, dict] = {
    "Consumer Price Index": {
        "event_type": "CPI",
        "assets_impacted": [AssetSymbol.SPY, AssetSymbol.VIX, AssetSymbol.GLD, AssetSymbol.DXY],
        "surprise_weight": 1.5,
        "event_time": "08:30",
        "label_template": "CPI MoM ({month})",
        "prior_series": "CPIAUCSL",
    },
    "Producer Price Index": {
        "event_type": "PPI",
        "assets_impacted": [AssetSymbol.SPY, AssetSymbol.WTI, AssetSymbol.BRENT],
        "surprise_weight": 1.0,
        "event_time": "08:30",
        "label_template": "PPI MoM ({month})",
        "prior_series": "PPIACO",
    },
    "Employment Situation": {
        "event_type": "NFP",
        "assets_impacted": [AssetSymbol.SPY, AssetSymbol.VIX, AssetSymbol.DXY, AssetSymbol.GLD],
        "surprise_weight": 1.5,
        "event_time": "08:30",
        "label_template": "NFP ({month})",
        "prior_series": "PAYEMS",
    },
    "Advance Retail Sales": {
        "event_type": "RETAIL",
        "assets_impacted": [AssetSymbol.SPY],
        "surprise_weight": 1.0,
        "event_time": "08:30",
        "label_template": "Retail Sales MoM ({month})",
        "prior_series": "RSAFS",
    },
    "FOMC Press Release": {
        "event_type": "FOMC",
        "assets_impacted": [AssetSymbol.SPY, AssetSymbol.VIX, AssetSymbol.GLD, AssetSymbol.SLV, AssetSymbol.DXY],
        "surprise_weight": 1.5,
        "event_time": "14:00",
        "label_template": "FOMC Rate Decision ({month})",
        "prior_series": None,
    },
}

_RELEASE_NAME_ALIASES: dict[str, str] = {
    "Federal Open Market Committee": "FOMC Press Release",
    "FOMC": "FOMC Press Release",
    "FOMC Meeting": "FOMC Press Release",
}

EIA_ASSETS = [AssetSymbol.WTI, AssetSymbol.BRENT]

OPEC_MEETINGS_2025_2026: list[tuple[str, str]] = [
    ("2025-06-04", "OPEC+ Ministerial Meeting (Jun 2025)"),
    ("2025-07-06", "OPEC+ Joint Ministerial Monitoring Committee (Jul 2025)"),
    ("2025-10-01", "OPEC+ Ministerial Meeting (Oct 2025)"),
    ("2025-12-04", "OPEC+ Ministerial Meeting (Dec 2025)"),
    ("2026-06-04", "OPEC+ Ministerial Meeting (Jun 2026)"),
    ("2026-12-04", "OPEC+ Ministerial Meeting (Dec 2026)"),
]

EARNINGS_TICKERS: list[str] = [
    "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK-B", "JPM", "V",
]

MONTH_ABBR = {
    1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
}


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _assets_to_str(assets: list[AssetSymbol]) -> str:
    return json.dumps([a.value for a in assets])


def _str_to_assets(s: str) -> list[AssetSymbol]:
    return [AssetSymbol(v) for v in json.loads(s)]


async def _fetch_fred_release_dates(
    api_key: str, days_forward: int
) -> list[CatalystEvent]:
    today = _today()
    end = today + timedelta(days=days_forward)
    params = {
        "api_key": api_key,
        "file_type": "json",
        "include_release_dates_with_no_data": "true",
        "offset": 0,
        "limit": 1000,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(FRED_RELEASES_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.warning("FRED release calendar fetch failed")
        return []

    events: list[CatalystEvent] = []
    release_dates = data.get("releases_dates", data.get("release_dates", []))
    if not release_dates:
        logger.warning("No release dates found in FRED response; keys: %s", list(data.keys()))
        return []

    for rd in release_dates:
        release_name = rd.get("release_name", "")
        date_str = rd.get("date", "")[:10]
        if not date_str:
            continue
        try:
            event_date = date.fromisoformat(date_str)
        except (ValueError, TypeError):
            continue
        if event_date < today or event_date > end:
            continue

        mapping = FRED_RELEASE_MAP.get(release_name) or FRED_RELEASE_MAP.get(_RELEASE_NAME_ALIASES.get(release_name, ""))
        if mapping is None:
            continue

        month_str = MONTH_ABBR.get(event_date.month, str(event_date.month))
        label = mapping["label_template"].format(month=month_str)

        prior_value = None
        if mapping.get("prior_series") and api_key:
            prior_value = await _fetch_prior_value(mapping["prior_series"], api_key)

        events.append(CatalystEvent(
            event_date=date_str,
            event_time=mapping["event_time"],
            event_type=mapping["event_type"],
            event_label=label,
            assets_impacted=mapping["assets_impacted"],
            consensus_value=None,
            prior_value=prior_value,
            surprise_weight=mapping["surprise_weight"],
            straddle_implied_move=None,
        ))

    return events


async def _fetch_prior_value(series_id: str, api_key: str) -> float | None:
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            observations = data.get("observations", [])
            for obs in observations:
                val = obs.get("value", ".")
                if val != ".":
                    return float(val)
    except Exception:
        logger.debug("Failed to fetch prior value for series %s", series_id)
    return None


def _generate_eia_events(days_forward: int) -> list[CatalystEvent]:
    today = _today()
    end = today + timedelta(days=days_forward)
    events: list[CatalystEvent] = []
    d = today
    while d <= end:
        if d.weekday() == 2:  # Wednesday
            month_str = MONTH_ABBR.get(d.month, str(d.month))
            events.append(CatalystEvent(
                event_date=d.isoformat(),
                event_time="10:30",
                event_type="EIA",
                event_label=f"EIA Petroleum Status Report ({month_str} {d.day})",
                assets_impacted=EIA_ASSETS,
                consensus_value=None,
                prior_value=None,
                surprise_weight=1.0,
                straddle_implied_move=None,
            ))
        d += timedelta(days=1)
    return events


def _generate_opec_events(days_forward: int) -> list[CatalystEvent]:
    today = _today()
    end = today + timedelta(days=days_forward)
    events: list[CatalystEvent] = []
    for date_str, label in OPEC_MEETINGS_2025_2026:
        try:
            event_date = date.fromisoformat(date_str)
        except ValueError:
            continue
        if event_date < today or event_date > end:
            continue
        events.append(CatalystEvent(
            event_date=date_str,
            event_time=None,
            event_type="OPEC",
            event_label=label,
            assets_impacted=[AssetSymbol.WTI, AssetSymbol.BRENT],
            consensus_value=None,
            prior_value=None,
            surprise_weight=1.5,
            straddle_implied_move=None,
        ))
    return events


async def _fetch_earnings_events(days_forward: int) -> list[CatalystEvent]:
    today = _today()
    end = today + timedelta(days=days_forward)
    events: list[CatalystEvent] = []

    try:
        import yfinance as yf
    except ImportError:
        logger.warning("yfinance not available; skipping earnings events")
        return events

    for ticker in EARNINGS_TICKERS:
        try:
            t = yf.Ticker(ticker)
            cal = t.earnings_dates
            if cal is None or cal.empty:
                continue
            for idx, row in cal.iterrows():
                if not isinstance(idx, date):
                    try:
                        idx = idx.date() if hasattr(idx, "date") else None
                    except Exception:
                        continue
                if idx is None:
                    continue
                if idx < today or idx > end:
                    continue
                events.append(CatalystEvent(
                    event_date=idx.isoformat(),
                    event_time="06:00",
                    event_type="EARNINGS",
                    event_label=f"{ticker} Earnings",
                    assets_impacted=[AssetSymbol.SPY],
                    consensus_value=None,
                    prior_value=None,
                    surprise_weight=0.5,
                    straddle_implied_move=None,
                ))
        except Exception:
            logger.debug("Failed to fetch earnings date for %s, skipping", ticker)
            continue

    return events


def _ensure_unique_constraint() -> None:
    with get_conn() as conn:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_macro_catalysts_dedup "
            "ON macro_catalysts(event_date, event_type, event_label)"
        )


def _store_events(events: list[CatalystEvent]) -> None:
    _ensure_unique_constraint()
    today = _today().isoformat()
    with get_conn() as conn:
        conn.execute("DELETE FROM macro_catalysts WHERE event_date < ?", (today,))
        for ev in events:
            conn.execute(
                """INSERT INTO macro_catalysts
                    (event_date, event_time, event_type, event_label,
                     assets_impacted, consensus_value, prior_value,
                     surprise_weight, straddle_implied_move)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(event_date, event_type, event_label) DO UPDATE SET
                     event_time=excluded.event_time,
                     assets_impacted=excluded.assets_impacted,
                     consensus_value=excluded.consensus_value,
                     prior_value=excluded.prior_value,
                     surprise_weight=excluded.surprise_weight,
                     straddle_implied_move=excluded.straddle_implied_move""",
                (
                    ev.event_date,
                    ev.event_time,
                    ev.event_type,
                    ev.event_label,
                    _assets_to_str(ev.assets_impacted),
                    ev.consensus_value,
                    ev.prior_value,
                    ev.surprise_weight,
                    ev.straddle_implied_move,
                ),
            )


def _row_to_event(row: dict) -> CatalystEvent:
    assets = _str_to_assets(row["assets_impacted"])
    return CatalystEvent(
        event_date=row["event_date"],
        event_time=row["event_time"],
        event_type=row["event_type"],
        event_label=row["event_label"],
        assets_impacted=assets,
        consensus_value=row["consensus_value"],
        prior_value=row["prior_value"],
        surprise_weight=row["surprise_weight"] or 1.0,
        straddle_implied_move=row["straddle_implied_move"],
    )


async def build_catalyst_calendar(days_forward: int = 21) -> list[CatalystEvent]:
    """
    Build the catalyst calendar for the next N trading days.
    Fetches from FRED release schedule, EIA schedule, earnings calendar.
    Stores in macro_catalysts table. Returns sorted by date.
    """
    cached = cache_get("macro", CACHE_KEY, CACHE_TTL)
    if cached is not None:
        return [CatalystEvent.model_validate(e) for e in cached]

    all_events: list[CatalystEvent] = []

    api_key = os.getenv("FRED_API_KEY", "")
    if api_key:
        fred_events = await _fetch_fred_release_dates(api_key, days_forward)
        all_events.extend(fred_events)
    else:
        logger.warning("FRED_API_KEY not set; skipping FRED-sourced catalyst events")

    all_events.extend(_generate_eia_events(days_forward))
    all_events.extend(_generate_opec_events(days_forward))

    earnings_events = await _fetch_earnings_events(days_forward)
    all_events.extend(earnings_events)

    all_events.sort(key=lambda e: (e.event_date, e.event_time or ""))

    _store_events(all_events)

    cache_set("macro", CACHE_KEY, [e.model_dump() for e in all_events])

    return all_events


async def get_upcoming_catalysts(days: int = 21) -> list[CatalystEvent]:
    """
    Retrieve catalysts from DB for the next N days.
    Used by the frontend to render the timeline.
    """
    today = _today().isoformat()
    end_date = (_today() + timedelta(days=days)).isoformat()

    with get_conn() as conn:
        rows = conn.execute(
            """SELECT event_date, event_time, event_type, event_label,
                      assets_impacted, consensus_value, prior_value,
                      surprise_weight, straddle_implied_move
               FROM macro_catalysts
               WHERE event_date >= ? AND event_date <= ?
               ORDER BY event_date, event_time""",
            (today, end_date),
        ).fetchall()

    return [_row_to_event(dict(r)) for r in rows]


async def get_catalyst_density(asset: str, days: int = 14) -> int:
    """Count of catalysts impacting a specific asset in next N days."""
    today = _today().isoformat()
    end_date = (_today() + timedelta(days=days)).isoformat()

    with get_conn() as conn:
        rows = conn.execute(
            """SELECT assets_impacted FROM macro_catalysts
               WHERE event_date >= ? AND event_date <= ?""",
            (today, end_date),
        ).fetchall()

    count = 0
    for row in rows:
        assets = json.loads(row["assets_impacted"])
        if asset in assets:
            count += 1
    return count