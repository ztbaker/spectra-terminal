"""Two-stage narrative synthesizer — regime characterization + trade commentary."""

from __future__ import annotations

import httpx
import logging
import os
from datetime import date

from database import get_conn
from macro.models import (
    CatalystAlignment,
    NarrativeOutput,
    RegimeReading,
    ScoreState,
    TradeIdea,
)
from macro.narrative.prompts import (
    STAGE1_SYSTEM,
    STAGE1_USER_TEMPLATE,
    STAGE2_SYSTEM,
    STAGE2_USER_TEMPLATE,
)
from macro.types import AssetSymbol, Conviction, FactorName

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = os.getenv("MACRO_LLM_MODEL", "llama3.1:8b")
CLAUDE_MODEL = os.getenv("AI_MODEL", "claude-sonnet-4-5-20241022")


async def _call_llm(system: str, user: str, max_tokens: int = 1024) -> tuple[str, str]:
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(OLLAMA_URL, json={
                "model": OLLAMA_MODEL,
                "system": system,
                "prompt": user,
                "stream": False,
            })
            resp.raise_for_status()
            text = resp.json().get("response", "").strip()
            if text:
                return (text, f"ollama/{OLLAMA_MODEL}")
    except Exception as e:
        logger.debug("Ollama unavailable: %s", e)

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if api_key:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": CLAUDE_MODEL,
                        "max_tokens": max_tokens,
                        "system": system,
                        "messages": [{"role": "user", "content": user}],
                    },
                )
                resp.raise_for_status()
                text = resp.json()["content"][0]["text"].strip()
                return (text, f"claude/{CLAUDE_MODEL}")
        except Exception as e:
            logger.debug("Claude unavailable: %s", e)

    return ("", "none")


def _format_trade_ideas(ideas: list[TradeIdea]) -> str:
    if not ideas:
        return "None qualifying. All assets fail the 3-confirmation filter."
    lines = []
    for idea in ideas:
        asset = idea.asset.value if isinstance(idea.asset, AssetSymbol) else idea.asset
        conviction = idea.conviction.value if isinstance(idea.conviction, Conviction) else idea.conviction
        lines.append(
            f"- {asset} {idea.direction}: {idea.structure}, "
            f"DTE {idea.dte_range[0]}-{idea.dte_range[1]}, "
            f"conviction {conviction}, "
            f"{'HALF SIZE' if idea.half_size else 'full size'}"
        )
    return "\n".join(lines)


def _format_catalyst_summary(catalyst_alignment: CatalystAlignment) -> str:
    parts = []
    for asset, state in catalyst_alignment.per_asset.items():
        density = state.catalyst_density_14d
        aligned = state.aligned_with_score
        next_cat = state.next_catalyst
        line = f"- {asset}: {density} catalysts in 14d"
        if next_cat:
            line += f", next: {next_cat.event_type} on {next_cat.event_date}"
        if aligned is not None:
            line += f", {'aligned' if aligned else 'misaligned'} with score"
        parts.append(line)
    return "\n".join(parts) if parts else "No catalyst data available."


def _get_factor_score(score_state: ScoreState, factor: FactorName) -> float:
    for f in score_state.factors:
        if f.factor == factor:
            return f.blended
    return 0.0


class NarrativeSynthesizer:
    async def generate(
        self,
        score_state: ScoreState,
        regime: RegimeReading,
        trade_ideas: list[TradeIdea],
        catalyst_alignment: CatalystAlignment,
    ) -> NarrativeOutput:
        """
        Generate the daily narrative in two stages.
        Stage 1: Regime characterization (what world are we in).
        Stage 2: Directional bias + trade commentary.
        Persists both stages to macro_narratives table.
        """
        stage1_text, model1 = await self._stage1_regime(score_state, regime)

        if not stage1_text:
            stage1_text = (
                f"Regime: {regime.regime.value.replace('_', ' ').title()}. "
                f"Day {regime.age_days}. Conviction: {regime.conviction.value}. "
                "LLM narrative generation unavailable — start Ollama or configure ANTHROPIC_API_KEY."
            )
            model1 = "fallback/none"

        stage2_text, model2 = await self._stage2_trade(
            stage1_text, trade_ideas, catalyst_alignment, score_state
        )

        if not stage2_text:
            stage2_text = "Trade commentary unavailable. See structured data above for current setups."
            model2 = "fallback/none"

        today = date.today().isoformat()

        with get_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO macro_narratives (date, stage, content, model_used) "
                "VALUES (?, 1, ?, ?)",
                (today, stage1_text, model1),
            )
            conn.execute(
                "INSERT OR REPLACE INTO macro_narratives (date, stage, content, model_used) "
                "VALUES (?, 2, ?, ?)",
                (today, stage2_text, model2),
            )

        model_used = model1 if model1 != "fallback/none" else model2

        return NarrativeOutput(
            date=today,
            regime_narrative=stage1_text,
            trade_narrative=stage2_text,
            model_used=model_used,
        )

    async def _stage1_regime(self, score_state: ScoreState, regime: RegimeReading) -> tuple[str, str]:
        """LLM call: characterize the regime."""
        user = STAGE1_USER_TEMPLATE.format(
            regime_name=regime.regime.value.replace("_", " ").title(),
            age_days=regime.age_days,
            conviction=regime.conviction.value,
            real_rate_score=_get_factor_score(score_state, FactorName.REAL_RATE),
            risk_appetite_score=_get_factor_score(score_state, FactorName.RISK_APPETITE),
            dollar_liquidity_score=_get_factor_score(score_state, FactorName.DOLLAR_LIQUIDITY),
            growth_inflation_score=_get_factor_score(score_state, FactorName.GROWTH_INFLATION),
            coherence=regime.coherence_score,
            recently_shifted=regime.recently_shifted,
        )
        return await _call_llm(STAGE1_SYSTEM, user, max_tokens=512)

    async def _stage2_trade(
        self, regime_narrative: str, trade_ideas: list[TradeIdea],
        catalyst_alignment: CatalystAlignment, score_state: ScoreState
    ) -> tuple[str, str]:
        """LLM call: directional bias and trade commentary."""
        user = STAGE2_USER_TEMPLATE.format(
            stage1_output=regime_narrative,
            n_ideas=len(trade_ideas),
            trade_ideas_formatted=_format_trade_ideas(trade_ideas),
            catalyst_summary=_format_catalyst_summary(catalyst_alignment),
        )
        return await _call_llm(STAGE2_SYSTEM, user, max_tokens=1024)

    async def get_cached_narrative(self, date_str: str) -> NarrativeOutput | None:
        """Retrieve today's narrative from DB if already generated."""
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT stage, content, model_used FROM macro_narratives WHERE date = ? ORDER BY stage",
                (date_str,),
            ).fetchall()

        if len(rows) < 2:
            return None

        stage1 = next((r for r in rows if r["stage"] == 1), None)
        stage2 = next((r for r in rows if r["stage"] == 2), None)

        if stage1 is None or stage2 is None:
            return None

        return NarrativeOutput(
            date=date_str,
            regime_narrative=stage1["content"],
            trade_narrative=stage2["content"],
            model_used=stage1["model_used"] or stage2["model_used"] or "unknown",
        )