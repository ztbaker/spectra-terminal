"""CFTC Commitments of Traders report scraper.

Fetches weekly COT data from CFTC bulk pipe-delimited CSV files for
Gold (GC), Silver (SI), Crude Oil (CL), and US Dollar Index (DX).
Stores results in macro_cftc_positions table.
"""

import io
import logging
from datetime import datetime, timezone

import httpx
import pandas as pd

from cache import cache_get, cache_set
from database import get_conn
from macro.models import CftcPosition

logger = logging.getLogger(__name__)

_COMMODITIES_URL = "https://www.cftc.gov/dea/newcot/deacom.txt"
_FINANCIALS_URL = "https://www.cftc.gov/dea/newcot/FinFutWk.txt"
_TIMEOUT = 60.0
_CACHE_KEY = "cftc_cot_raw"
_CACHE_TTL = 21600  # 6 hours

_ASSET_MAP = {
    "GC": {"pattern": "GOLD - COMMODITY EXCHANGE", "source": "commodities"},
    "SI": {"pattern": "SILVER - COMMODITY EXCHANGE", "source": "commodities"},
    "CL": {"pattern": "CRUDE OIL, LIGHT SWEET - NEW YORK", "source": "commodities"},
    "DX": {"pattern": "U.S. DOLLAR INDEX - ICE", "source": "financials"},
}

_COLUMN_MAP = {
    "Market_and_Exchange_Names": 0,
    "As_of_Date_In_Form_YYYY-MM-DD": 2,
    "Open_Interest": 8,
    "NonComm_Long": 9,
    "NonComm_Short": 10,
    "Change_in_NonComm_Long": 11,
    "Change_in_NonComm_Short": 12,
}


async def _fetch_raw_csv(url: str) -> str:
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(_TIMEOUT),
        headers={"User-Agent": "Mozilla/5.0"},
        follow_redirects=True,
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text


def _parse_pipe_csv(raw: str) -> pd.DataFrame:
    lines = raw.strip().split("\n")
    if not lines:
        return pd.DataFrame()
    header_line = lines[0]
    num_cols = len(header_line.split("|"))
    rows = []
    for line in lines[1:]:
        parts = line.split("|")
        if len(parts) == num_cols:
            rows.append(parts)
    if not rows:
        return pd.DataFrame()
    headers = [h.strip() for h in lines[0].split("|")]
    df = pd.DataFrame(rows, columns=headers)
    for col in df.columns:
        df[col] = df[col].astype(str).str.strip()
    return df


def _extract_positions(
    commodities_df: pd.DataFrame, financials_df: pd.DataFrame
) -> list[dict]:
    results = []
    for asset, info in _ASSET_MAP.items():
        df = commodities_df if info["source"] == "commodities" else financials_df
        if df.empty:
            logger.warning("No data frame available for %s (%s)", asset, info["source"])
            continue

        match_col = None
        for col in df.columns:
            if "market" in col.lower() and "exchange" in col.lower():
                match_col = col
                break
        if match_col is None and "Market_and_Exchange_Names" in df.columns:
            match_col = "Market_and_Exchange_Names"
        if match_col is None:
            match_col = df.columns[0]

        mask = df[match_col].str.upper().str.contains(info["pattern"], na=False)
        matched = df[mask]
        if matched.empty:
            logger.warning("No COT match for %s with pattern %s", asset, info["pattern"])
            continue

        row = matched.iloc[0]

        date_col = None
        for col in df.columns:
            if "date" in col.lower():
                date_col = col
                break
        if date_col is None:
            date_col = df.columns[2] if len(df.columns) > 2 else None

        report_date = str(row[date_col]) if date_col else ""

        noncomm_long_col = None
        noncomm_short_col = None
        open_interest_col = None
        change_long_col = None
        change_short_col = None

        for col in df.columns:
            cl = col.lower().replace(" ", "").replace("_", "")
            if "noncomm" in cl and "long" in cl and "change" not in cl:
                noncomm_long_col = col
            elif "noncomm" in cl and "short" in cl and "change" not in cl:
                noncomm_short_col = col
            elif "openinterest" in cl or "open_interest" in cl:
                open_interest_col = col
            elif "change" in cl and "noncomm" in cl and "long" in cl:
                change_long_col = col
            elif "change" in cl and "noncomm" in cl and "short" in col:
                pass

        try:
            nc_long = int(str(row[noncomm_long_col]).replace(",", "").replace("-", "0"))
            nc_short = int(str(row[noncomm_short_col]).replace(",", "").replace("-", "0"))
            net_long = nc_long - nc_short
            oi = float(str(row[open_interest_col]).replace(",", "").replace("-", "0"))
            pct_oi = round((net_long / oi * 100) if oi > 0 else 0.0, 2)

            change_1w = 0
            if change_long_col and change_long_col in df.columns:
                change_long = int(str(row[change_long_col]).replace(",", "").replace("-", "0"))
                change_1w = change_long

            results.append({
                "report_date": report_date,
                "asset": asset,
                "net_long": net_long,
                "pct_oi": pct_oi,
                "change_1w": change_1w,
            })
        except (ValueError, TypeError, KeyError) as exc:
            logger.error("Error parsing COT data for %s: %s", asset, exc)

    return results


def _store_positions(positions: list[dict]) -> None:
    if not positions:
        return
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        for p in positions:
            conn.execute(
                """INSERT INTO macro_cftc_positions (report_date, asset, net_long, pct_oi, change_1w)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(report_date, asset) DO UPDATE SET
                     net_long=excluded.net_long,
                     pct_oi=excluded.pct_oi,
                     change_1w=excluded.change_1w""",
                (p["report_date"], p["asset"], p["net_long"], p["pct_oi"], p["change_1w"]),
            )


def _load_from_db() -> list[CftcPosition]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT report_date, asset, net_long, pct_oi, change_1w "
            "FROM macro_cftc_positions ORDER BY report_date DESC, asset"
        ).fetchall()
    return [
        CftcPosition(
            report_date=r[0],
            asset=r[1],
            net_long=r[2],
            pct_oi=r[3],
            change_1w=r[4],
        )
        for r in rows
    ]


async def fetch_cot_positions() -> list[CftcPosition]:
    cached = cache_get("macro", _CACHE_KEY, _CACHE_TTL)
    if cached is not None:
        return [CftcPosition.model_validate(p) for p in cached]

    try:
        commodities_raw = await _fetch_raw_csv(_COMMODITIES_URL)
        financials_raw = await _fetch_raw_csv(_FINANCIALS_URL)
    except Exception as exc:
        logger.error("CFTC COT fetch failed: %s", exc)
        return _load_from_db()

    commodities_df = _parse_pipe_csv(commodities_raw)
    financials_df = _parse_pipe_csv(financials_raw)

    positions = _extract_positions(commodities_df, financials_df)

    if not positions:
        logger.warning("No COT positions extracted, falling back to DB")
        return _load_from_db()

    _store_positions(positions)

    cache_set("macro", _CACHE_KEY, positions)

    return [CftcPosition(**p) for p in positions]


async def get_historical_positions(asset: str, lookback_weeks: int = 104) -> list[CftcPosition]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT report_date, asset, net_long, pct_oi, change_1w "
            "FROM macro_cftc_positions WHERE asset = ? "
            "ORDER BY report_date DESC LIMIT ?",
            (asset, lookback_weeks),
        ).fetchall()
    return [
        CftcPosition(
            report_date=r[0],
            asset=r[1],
            net_long=r[2],
            pct_oi=r[3],
            change_1w=r[4],
        )
        for r in rows
    ]