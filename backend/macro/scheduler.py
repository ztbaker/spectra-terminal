"""MACRO pipeline scheduler — APScheduler cron (5am ET daily)."""

import asyncio
import json
import logging
from datetime import date, datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz
from fastapi import FastAPI

logger = logging.getLogger("macro.pipeline")

ET = pytz.timezone("US/Eastern")

_scheduler: AsyncIOScheduler | None = None


def setup_scheduler(app: FastAPI) -> None:
    """
    Configure APScheduler to run the MACRO pipeline:
    - Daily at 5:00 AM ET
    - Twice on FOMC/CPI days (5:00 AM and 6:00 AM ET)
    Returns the scheduler instance so the caller can manage lifecycle.
    """
    global _scheduler
    _scheduler = AsyncIOScheduler()

    _scheduler.add_job(
        run_macro_pipeline,
        CronTrigger(hour=5, minute=0, timezone=ET),
        id="macro_daily",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("MACRO scheduler started — daily 5am ET")


def _cache_iv_ranks(iv_ranks: dict) -> None:
    """Cache IV rank data for the sync dashboard fallback."""
    from cache import cache_set
    if iv_ranks:
        cache_set("macro", "macro_iv_ranks", {k: v.model_dump() for k, v in iv_ranks.items()})


def _persist_trade_ideas(date_str: str, ideas: list) -> None:
    """Persist trade ideas to the macro_trade_ideas table."""
    from database import get_conn

    with get_conn() as conn:
        conn.execute("DELETE FROM macro_trade_ideas WHERE generated_date = ?", (date_str,))
        for idea in ideas:
            asset_val = idea.asset.value if hasattr(idea.asset, 'value') else str(idea.asset)
            conviction_val = idea.conviction.value if hasattr(idea.conviction, 'value') else str(idea.conviction)
            score_snapshot = json.dumps(idea.dte_range if isinstance(idea.dte_range, list) else list(idea.dte_range))
            conn.execute(
                """INSERT INTO macro_trade_ideas
                    (generated_date, asset, direction, dte_min, dte_max, structure,
                     entry_condition, invalidation, conviction, iv_rank_context, score_snapshot_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    date_str,
                    asset_val,
                    idea.direction,
                    idea.dte_range[0],
                    idea.dte_range[1],
                    idea.structure,
                    idea.entry_condition,
                    idea.invalidation,
                    conviction_val,
                    idea.iv_rank_context,
                    score_snapshot,
                ),
            )


async def run_macro_pipeline() -> dict:
    """
    Execute the full MACRO pipeline:
    1. Fetch all data (FRED, CFTC, market data, catalysts)
    2. Log IV30
    3. Run scoring engine
    4. Classify regime
    5. Evaluate catalyst alignment
    6. Run trade filter
    7. Generate narrative
    Returns summary dict for logging.
    """
    logger.info("MACRO pipeline starting...")

    try:
        from macro.data.fred_macro import fetch_scoring_inputs
        from macro.data.catalyst import build_catalyst_calendar
        from macro.data.iv_logger import log_daily_iv30, get_all_iv_ranks
        from macro.data.market_data import fetch_asset_prices
        from macro.engine.scoring import ScoringEngine
        from macro.engine.regime import RegimeClassifier
        from macro.engine.catalyst_align import CatalystAligner
        from macro.engine.filter import TradeFilter
        from macro.narrative.synthesizer import NarrativeSynthesizer

        scoring_inputs, _, _, _, iv_ranks_result = await asyncio.gather(
            fetch_scoring_inputs(use_cache=False),
            fetch_asset_prices(),
            log_daily_iv30(),
            build_catalyst_calendar(),
            get_all_iv_ranks(),
        )

        _cache_iv_ranks(iv_ranks_result)

        engine = ScoringEngine()
        score_state = await engine.compute(inputs=scoring_inputs)

        classifier = RegimeClassifier()
        regime = classifier.classify(score_state)

        aligner = CatalystAligner()
        catalyst_alignment = await aligner.evaluate(score_state)

        trade_filter = TradeFilter()
        ideas = trade_filter.filter(score_state, regime, catalyst_alignment, iv_ranks_result)

        _persist_trade_ideas(score_state.date, ideas)

        synth = NarrativeSynthesizer()
        try:
            await synth.generate(score_state, regime, ideas, catalyst_alignment)
        except NotImplementedError:
            logger.warning("NarrativeSynthesizer.generate not yet implemented (Agent A12)")
        except Exception as e:
            logger.warning("Narrative generation failed: %s", e)

        logger.info("MACRO pipeline complete: regime=%s, ideas=%d", regime.regime.value, len(ideas))

        if _scheduler is not None:
            await _schedule_fomc_cpi_rerun(regime.regime.value)

        return {
            "status": "ok",
            "regime": regime.regime.value,
            "ideas": len(ideas),
            "date": score_state.date,
        }

    except Exception as e:
        logger.error("MACRO pipeline failed: %s", e, exc_info=True)
        return {"status": "error", "error": str(e)}


async def _schedule_fomc_cpi_rerun(regime_value: str) -> None:
    """If today has a FOMC or CPI catalyst, schedule a 6am ET re-run."""
    tomorrow = date.today()
    today_str = tomorrow.isoformat()

    from database import get_conn

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT event_type FROM macro_catalysts WHERE event_date = ? AND event_type IN ('FOMC', 'CPI')",
            (today_str,),
        ).fetchall()

    if rows and _scheduler is not None:
        _scheduler.add_job(
            run_macro_pipeline,
            CronTrigger(hour=6, minute=0, timezone=ET),
            id=f"macro_catalyst_rerun_{today_str}",
            replace_existing=True,
        )
        logger.info("FOMC/CPI catalyst detected — scheduled 6am ET rerun")