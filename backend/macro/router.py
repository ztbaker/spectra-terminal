"""MACRO FastAPI router — dashboard, regime, catalysts, ideas, narrative, refresh."""

import json
import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter

from database import get_conn
from macro.models import (
    AssetScoreCard,
    CatalystEvent,
    Conviction,
    MacroDashboardResponse,
    NarrativeOutput,
    RegimeName,
    RegimeReading,
    TradeIdea,
)
from macro.types import AssetSymbol, FactorName
from macro.scheduler import run_macro_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_latest_regime() -> RegimeReading | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT regime_name, conviction, age_days, score_coherence FROM macro_regime_history ORDER BY date DESC LIMIT 1"
        ).fetchone()
    if row is None:
        return None
    recently_shifted = _check_recent_shift()
    return RegimeReading(
        regime=RegimeName(row["regime_name"]),
        age_days=row["age_days"],
        conviction=Conviction(row["conviction"]),
        recently_shifted=recently_shifted,
        coherence_score=row["score_coherence"] or 0.0,
    )


def _check_recent_shift() -> bool:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT date, regime_name FROM macro_regime_history ORDER BY date DESC"
        ).fetchall()
    if len(rows) < 2:
        return False
    today = date.today()
    for i in range(1, len(rows)):
        prev = rows[i]
        curr = rows[i - 1]
        if prev["regime_name"] != curr["regime_name"]:
            transition_date = date.fromisoformat(curr["date"])
            biz_days = _business_days_between(transition_date, today)
            if biz_days <= 5:
                return True
    return False


def _business_days_between(start: date, end: date) -> int:
    from datetime import timedelta
    count = 0
    current = start
    while current <= end:
        if current.weekday() < 5:
            count += 1
        current += timedelta(days=1)
    return count


def _default_regime() -> RegimeReading:
    return RegimeReading(
        regime=RegimeName.MIXED_NO_EDGE,
        age_days=0,
        conviction=Conviction.LOW,
        recently_shifted=False,
        coherence_score=0.0,
    )


async def _assemble_asset_cards_async() -> dict[str, AssetScoreCard]:
    from macro.data.iv_logger import get_all_iv_ranks
    from macro.data.market_data import fetch_asset_prices

    with get_conn() as conn:
        score_rows = conn.execute(
            "SELECT factor_name, score_5d, score_10d, score_21d, raw_inputs_json FROM macro_scores ORDER BY date DESC"
        ).fetchall()

        if not score_rows:
            return {}

        latest_date_row = conn.execute("SELECT date FROM macro_scores ORDER BY date DESC LIMIT 1").fetchone()
        if latest_date_row:
            scores_date = latest_date_row["date"]
            rows = conn.execute(
                "SELECT factor_name, score_5d, score_10d, score_21d, raw_inputs_json FROM macro_scores WHERE date = ?",
                (scores_date,),
            ).fetchall()
        else:
            rows = score_rows

        factor_scores: dict[str, dict] = {}
        for row in rows:
            factor_scores[row["factor_name"]] = {
                "score_5d": row["score_5d"],
                "score_10d": row["score_10d"],
                "score_21d": row["score_21d"],
            }

    iv_ranks: dict = {}
    try:
        iv_ranks = await get_all_iv_ranks()
    except Exception:
        pass

    prices: dict = {}
    try:
        prices = await fetch_asset_prices()
    except Exception:
        pass

    return _build_asset_cards(factor_scores, iv_ranks, prices)


def _assemble_asset_cards_sync() -> dict[str, AssetScoreCard]:
    with get_conn() as conn:
        score_rows = conn.execute(
            "SELECT factor_name, score_5d, score_10d, score_21d, raw_inputs_json FROM macro_scores ORDER BY date DESC"
        ).fetchall()

        if not score_rows:
            return {}

        latest_date_row = conn.execute("SELECT date FROM macro_scores ORDER BY date DESC LIMIT 1").fetchone()
        if latest_date_row:
            scores_date = latest_date_row["date"]
            rows = conn.execute(
                "SELECT factor_name, score_5d, score_10d, score_21d, raw_inputs_json FROM macro_scores WHERE date = ?",
                (scores_date,),
            ).fetchall()
        else:
            rows = score_rows

        factor_scores: dict[str, dict] = {}
        for row in rows:
            factor_scores[row["factor_name"]] = {
                "score_5d": row["score_5d"],
                "score_10d": row["score_10d"],
                "score_21d": row["score_21d"],
            }

    iv_ranks: dict = _load_iv_ranks_from_cache()
    prices: dict = _load_prices_from_cache()

    return _build_asset_cards(factor_scores, iv_ranks, prices)


def _build_asset_cards(factor_scores: dict, iv_ranks: dict, prices: dict) -> dict[str, AssetScoreCard]:
    cards: dict[str, AssetScoreCard] = {}

    FACTOR_ASSET_MAP: dict[str, list[str]] = {
        "real_rate": ["GLD", "SLV"],
        "risk_appetite": ["SPY", "VIX"],
        "dollar_liquidity": ["DXY", "GLD"],
        "growth_inflation": ["WTI", "BRENT", "SLV"],
    }
    INVERTED = {"VIX", "DXY"}

    for asset_enum in AssetSymbol:
        asset = asset_enum.value
        contributing = [fn for fn, assets in FACTOR_ASSET_MAP.items() if asset in assets]
        s5 = s10 = s21 = 0.0
        dominant = "real_rate"
        if contributing:
            scores_list = []
            for fn in contributing:
                fs = factor_scores.get(fn, {})
                scores_list.append(fs)
                if fs.get("score_10d", 0) > factor_scores.get(dominant, {}).get("score_10d", 0):
                    dominant = fn
            if scores_list:
                s5 = sum(s.get("score_5d", 0) for s in scores_list) / len(scores_list)
                s10 = sum(s.get("score_10d", 0) for s in scores_list) / len(scores_list)
                s21 = sum(s.get("score_21d", 0) for s in scores_list) / len(scores_list)
                if asset in INVERTED:
                    s5, s10, s21 = -s5, -s10, -s21

        price_data = prices.get(asset)
        iv_data = iv_ranks.get(asset)

        def _state_line(s5: float, s10: float, s21: float) -> str:
            dirs = []
            for val, label in [(s5, "5d"), (s10, "10d"), (s21, "21d")]:
                if val > 0.5:
                    dirs.append(f"{label}\u2191")
                elif val < -0.5:
                    dirs.append(f"{label}\u2193")
                else:
                    dirs.append(f"{label}\u2192")
            return " ".join(dirs)

        def _border_state(s10: float) -> str:
            if s10 > 0.75:
                return "bullish"
            elif s10 < -0.75:
                return "bearish"
            return "neutral"

        cards[asset] = AssetScoreCard(
            asset=asset_enum,
            price=price_data.price if price_data else None,
            change_1d_pct=price_data.change_1d_pct if price_data else None,
            change_5d_pct=price_data.change_5d_pct if price_data else None,
            change_21d_pct=price_data.change_21d_pct if price_data else None,
            score_5d=round(s5, 4),
            score_10d=round(s10, 4),
            score_21d=round(s21, 4),
            iv_rank=iv_data.rank_pct if iv_data else None,
            dominant_factor=FactorName(dominant),
            state_line=_state_line(s5, s10, s21),
            border_state=_border_state(s10),
        )

    return cards


def _get_upcoming_catalysts() -> list[CatalystEvent]:
    today = date.today().isoformat()
    from datetime import timedelta
    end_date = (date.today() + timedelta(days=21)).isoformat()

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

    events: list[CatalystEvent] = []
    for row in rows:
        assets = json.loads(row["assets_impacted"])
        events.append(CatalystEvent(
            event_date=row["event_date"],
            event_time=row["event_time"],
            event_type=row["event_type"],
            event_label=row["event_label"],
            assets_impacted=[AssetSymbol(a) for a in assets],
            consensus_value=row["consensus_value"],
            prior_value=row["prior_value"],
            surprise_weight=row["surprise_weight"] or 1.0,
            straddle_implied_move=row["straddle_implied_move"],
        ))
    return events


def _get_latest_ideas() -> list[TradeIdea]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT generated_date FROM macro_trade_ideas ORDER BY generated_date DESC LIMIT 1"
        ).fetchall()
    if not rows:
        return []

    latest_date = rows[0]["generated_date"]
    with get_conn() as conn:
        idea_rows = conn.execute(
            """SELECT asset, direction, dte_min, dte_max, structure, entry_condition,
                      invalidation, conviction, iv_rank_context
               FROM macro_trade_ideas WHERE generated_date = ?
               ORDER BY id""",
            (latest_date,),
        ).fetchall()

    ideas: list[TradeIdea] = []
    for row in idea_rows:
        ideas.append(TradeIdea(
            asset=AssetSymbol(row["asset"]),
            direction=row["direction"],
            dte_range=(row["dte_min"], row["dte_max"]),
            structure=row["structure"] or "",
            entry_condition=row["entry_condition"] or "",
            invalidation=row["invalidation"] or "",
            conviction=Conviction(row["conviction"]),
            iv_rank_context=row["iv_rank_context"] or "",
            confirmations=3 if row["conviction"] == "high" else (2 if row["conviction"] == "medium" else 1),
            half_size=row["conviction"] == "low",
        ))
    return ideas


def _get_today_narrative() -> NarrativeOutput | None:
    today = date.today().isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT stage, content, model_used FROM macro_narratives WHERE date = ? ORDER BY stage",
            (today,),
        ).fetchall()

    if not rows:
        return None

    regime_narrative = rows[0]["content"]
    trade_narrative = rows[1]["content"] if len(rows) >= 2 else ""
    model_used = rows[0]["model_used"]

    return NarrativeOutput(
        date=today,
        regime_narrative=regime_narrative,
        trade_narrative=trade_narrative,
        model_used=model_used,
    )


def _get_last_refresh_time() -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT date FROM macro_regime_history ORDER BY date DESC LIMIT 1"
        ).fetchone()
    if row is None:
        return None
    return row["date"]


@router.get("/macro/dashboard", response_model=MacroDashboardResponse)
async def get_macro_dashboard():
    """Full dashboard state — reads from DB/cache, does NOT run pipeline."""
    try:
        regime = _get_latest_regime()
    except Exception:
        regime = None

    today = date.today().isoformat()
    stale = True
    if regime is not None:
        stale = False
        with get_conn() as conn:
            row = conn.execute("SELECT date FROM macro_regime_history ORDER BY date DESC LIMIT 1").fetchone()
            if row:
                stale = row["date"] != today

    try:
        asset_scores = await _assemble_asset_cards_async()
    except Exception:
        asset_scores = {}

    try:
        catalysts = _get_upcoming_catalysts()
    except Exception:
        catalysts = []

    try:
        ideas = _get_latest_ideas()
    except Exception:
        ideas = []

    try:
        narrative = _get_today_narrative()
    except Exception:
        narrative = None

    last_refresh = _get_last_refresh_time()

    return MacroDashboardResponse(
        regime=regime or _default_regime(),
        asset_scores=asset_scores,
        catalysts=catalysts,
        trade_ideas=ideas,
        narrative=narrative,
        last_refresh=last_refresh,
        stale=stale,
    )


@router.get("/macro/regime", response_model=RegimeReading)
async def get_macro_regime():
    """Current regime reading only."""
    try:
        regime = _get_latest_regime()
        if regime is None:
            return _default_regime()
        return regime
    except Exception:
        return _default_regime()


@router.get("/macro/catalysts", response_model=list[CatalystEvent])
async def get_macro_catalysts():
    """Upcoming catalyst calendar."""
    try:
        return _get_upcoming_catalysts()
    except Exception:
        return []


@router.get("/macro/ideas", response_model=list[TradeIdea])
async def get_macro_ideas():
    """Current trade ideas."""
    try:
        return _get_latest_ideas()
    except Exception:
        return []


@router.get("/macro/narrative", response_model=NarrativeOutput | None)
async def get_macro_narrative():
    """Today's narrative."""
    try:
        return _get_today_narrative()
    except Exception:
        return None


@router.post("/macro/refresh")
async def refresh_macro():
    """Trigger manual pipeline run."""
    try:
        result = await run_macro_pipeline()
        return result
    except Exception as e:
        logger.exception("Manual MACRO pipeline run failed")
        return {"status": "error", "error": str(e)}