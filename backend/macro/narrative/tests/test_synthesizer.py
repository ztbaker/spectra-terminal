"""Tests for NarrativeSynthesizer — two-stage LLM narrative generation."""

from __future__ import annotations

import asyncio
import sqlite3
from datetime import date
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from macro.models import (
    AssetCatalystState,
    CatalystAlignment,
    CatalystEvent,
    FactorScore,
    NarrativeOutput,
    RegimeReading,
    ScoreState,
    TradeIdea,
)
from macro.narrative.synthesizer import (
    NarrativeSynthesizer,
    _call_llm,
    _format_trade_ideas,
    _format_catalyst_summary,
    _get_factor_score,
)
from macro.types import Conviction, FactorName, RegimeName, AssetSymbol


def run_async(coro):
    return asyncio.run(coro)


def _make_score_state(
    real_rate: float = 0.5,
    risk_appetite: float = -0.3,
    dollar_liquidity: float = 1.0,
    growth_inflation: float = 0.0,
) -> ScoreState:
    return ScoreState(
        date=date.today().isoformat(),
        factors=[
            FactorScore(factor=FactorName.REAL_RATE, slow_pctile=50.0, fast_pctile=60.0, positioning_pctile=55.0, blended=real_rate),
            FactorScore(factor=FactorName.RISK_APPETITE, slow_pctile=40.0, fast_pctile=35.0, positioning_pctile=45.0, blended=risk_appetite),
            FactorScore(factor=FactorName.DOLLAR_LIQUIDITY, slow_pctile=70.0, fast_pctile=75.0, positioning_pctile=65.0, blended=dollar_liquidity),
            FactorScore(factor=FactorName.GROWTH_INFLATION, slow_pctile=50.0, fast_pctile=50.0, positioning_pctile=50.0, blended=growth_inflation),
        ],
        asset_scores={},
    )


def _make_regime() -> RegimeReading:
    return RegimeReading(
        regime=RegimeName.DISINFLATION_RISK_ON,
        age_days=12,
        conviction=Conviction.HIGH,
        recently_shifted=False,
        coherence_score=0.75,
    )


def _make_trade_idea(
    asset: str = "SPY",
    direction: str = "bull put spread",
    conviction: Conviction = Conviction.HIGH,
    half_size: bool = False,
) -> TradeIdea:
    return TradeIdea(
        asset=AssetSymbol.SPY,
        direction=direction,
        dte_range=(30, 45),
        structure=direction,
        entry_condition="SPY > 450",
        invalidation="SPY < 430",
        conviction=conviction,
        iv_rank_context="IV rank 45%",
        confirmations=3,
        half_size=half_size,
    )


def _make_catalyst_alignment() -> CatalystAlignment:
    return CatalystAlignment(
        date=date.today().isoformat(),
        per_asset={
            "SPY": AssetCatalystState(
                catalyst_density_14d=2,
                next_catalyst=CatalystEvent(
                    event_date="2025-01-15",
                    event_time="08:30",
                    event_type="CPI",
                    event_label="CPI Report",
                    assets_impacted=[AssetSymbol.SPY],
                    consensus_value=0.3,
                    prior_value=0.2,
                    surprise_weight=1.0,
                    straddle_implied_move=1.5,
                ),
                aligned_with_score=True,
                atm_straddle_move_14d=1.5,
            ),
        },
    )


# ─── Mock DB helpers ───────────────────────────────────────────────────────

def _make_in_memory_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("""
        CREATE TABLE macro_narratives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            stage INTEGER NOT NULL,
            content TEXT NOT NULL,
            model_used TEXT,
            generated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(date, stage)
        )
    """)
    conn.commit()
    return conn


@pytest.fixture
def mock_db():
    conn = _make_in_memory_db()
    with patch("macro.narrative.synthesizer.get_conn") as mock_get_conn:
        mock_get_conn.return_value.__enter__ = MagicMock(return_value=conn)
        mock_get_conn.return_value.__exit__ = MagicMock(return_value=False)
        yield conn
    conn.close()


# ─── _call_llm tests ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_call_llm_ollama_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"response": "  Ollama regime text  "}

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("macro.narrative.synthesizer.httpx.AsyncClient", return_value=mock_client):
        text, model = await _call_llm("system", "user")

    assert text == "Ollama regime text"
    assert "ollama" in model


@pytest.mark.asyncio
async def test_call_llm_claude_fallback():
    ollama_client = AsyncMock()
    ollama_client.post = AsyncMock(side_effect=Exception("Ollama down"))
    ollama_client.__aenter__ = AsyncMock(return_value=ollama_client)
    ollama_client.__aexit__ = AsyncMock(return_value=None)

    claude_response = MagicMock()
    claude_response.status_code = 200
    claude_response.raise_for_status = MagicMock()
    claude_response.json.return_value = {
        "content": [{"text": "Claude trade text"}]
    }

    claude_client = AsyncMock()
    claude_client.post = AsyncMock(return_value=claude_response)
    claude_client.__aenter__ = AsyncMock(return_value=claude_client)
    claude_client.__aexit__ = AsyncMock(return_value=None)

    call_count = 0
    def client_factory(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return ollama_client
        return claude_client

    with patch("macro.narrative.synthesizer.httpx.AsyncClient", side_effect=client_factory):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key"}):
            text, model = await _call_llm("system", "user")

    assert text == "Claude trade text"
    assert "claude" in model


@pytest.mark.asyncio
async def test_call_llm_no_backend():
    failing_client = AsyncMock()
    failing_client.post = AsyncMock(side_effect=Exception("down"))
    failing_client.__aenter__ = AsyncMock(return_value=failing_client)
    failing_client.__aexit__ = AsyncMock(return_value=None)

    with patch("macro.narrative.synthesizer.httpx.AsyncClient", return_value=failing_client):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": ""}, clear=False):
            text, model = await _call_llm("system", "user")

    assert text == ""
    assert model == "none"


# ─── _format_trade_ideas tests ──────────────────────────────────────────────

def test_format_trade_ideas_empty():
    result = _format_trade_ideas([])
    assert "None qualifying" in result


def test_format_trade_ideas_single():
    idea = _make_trade_idea()
    result = _format_trade_ideas([idea])
    assert "SPY" in result
    assert "bull put spread" in result
    assert "30-45" in result
    assert "full size" in result


def test_format_trade_ideas_multiple():
    assets = [AssetSymbol.SPY, AssetSymbol.GLD, AssetSymbol.SLV, AssetSymbol.WTI, AssetSymbol.DXY]
    ideas = [
        TradeIdea(
            asset=a,
            direction=f"dir_{i}",
            dte_range=(30, 45),
            structure=f"struct_{i}",
            entry_condition="cond",
            invalidation="inv",
            conviction=Conviction.HIGH if i % 2 == 0 else Conviction.MEDIUM,
            iv_rank_context="45%",
            confirmations=3,
            half_size=(i % 2 == 1),
        )
        for i, a in enumerate(assets)
    ]
    result = _format_trade_ideas(ideas)
    lines = [l for l in result.strip().split("\n") if l.startswith("- ")]
    assert len(lines) == 5
    assert "SPY" in lines[0]
    assert "GLD" in lines[1]
    assert "HALF SIZE" in result
    assert "HALF SIZE" in result
    assert "full size" in result


def test_format_trade_ideas_half_size():
    idea = _make_trade_idea(half_size=True)
    result = _format_trade_ideas([idea])
    assert "HALF SIZE" in result


# ─── _format_catalyst_summary tests ────────────────────────────────────────

def test_format_catalyst_summary_with_data():
    alignment = _make_catalyst_alignment()
    result = _format_catalyst_summary(alignment)
    assert "SPY" in result
    assert "CPI" in result
    assert "aligned" in result


def test_format_catalyst_summary_empty():
    alignment = CatalystAlignment(date=date.today().isoformat(), per_asset={})
    result = _format_catalyst_summary(alignment)
    assert "No catalyst data" in result


# ─── _get_factor_score tests ───────────────────────────────────────────────

def test_get_factor_score_found():
    state = _make_score_state(real_rate=0.75)
    result = _get_factor_score(state, FactorName.REAL_RATE)
    assert result == 0.75


def test_get_factor_score_missing():
    state = _make_score_state()
    original_factors = state.factors
    object.__setattr__(state, 'factors', [])
    result = _get_factor_score(state, FactorName.REAL_RATE)
    assert result == 0.0


# ─── Two-stage flow tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_two_stages(mock_db):
    synth = NarrativeSynthesizer()
    score_state = _make_score_state()
    regime = _make_regime()
    trade_ideas = [_make_trade_idea()]
    catalyst = _make_catalyst_alignment()

    call_log = []

    async def mock_call_llm(system, user, max_tokens=1024):
        call_log.append((system, user, max_tokens))
        if "regime assessment" in system.lower():
            return ("Stage 1 regime content", "ollama/llama3.1:8b")
        return ("Stage 2 trade content", "ollama/llama3.1:8b")

    with patch("macro.narrative.synthesizer._call_llm", side_effect=mock_call_llm):
        result = await synth.generate(score_state, regime, trade_ideas, catalyst)

    assert isinstance(result, NarrativeOutput)
    assert result.regime_narrative == "Stage 1 regime content"
    assert result.trade_narrative == "Stage 2 trade content"
    assert "ollama" in result.model_used
    assert len(call_log) == 2
    assert call_log[0][2] == 512
    assert call_log[1][2] == 1024


@pytest.mark.asyncio
async def test_stage2_receives_stage1_output(mock_db):
    synth = NarrativeSynthesizer()
    score_state = _make_score_state()
    regime = _make_regime()

    stage1_output = "UNIQUE_REGIME_TEXT_12345"

    async def mock_call_llm(system, user, max_tokens=1024):
        if "regime assessment" in system.lower():
            return (stage1_output, "ollama/llama3.1:8b")
        assert stage1_output in user, "Stage 2 must receive Stage 1 output"
        return ("Trade commentary based on regime", "ollama/llama3.1:8b")

    with patch("macro.narrative.synthesizer._call_llm", side_effect=mock_call_llm):
        result = await synth.generate(score_state, regime, [], _make_catalyst_alignment())

    assert stage1_output in result.regime_narrative


@pytest.mark.asyncio
async def test_generate_fallback_when_no_llm(mock_db):
    synth = NarrativeSynthesizer()
    score_state = _make_score_state()
    regime = _make_regime()

    with patch("macro.narrative.synthesizer._call_llm", return_value=("", "none")):
        result = await synth.generate(score_state, regime, [], _make_catalyst_alignment())

    assert "Disinflation Risk On" in result.regime_narrative
    assert "Day 12" in result.regime_narrative
    assert "unavailable" in result.trade_narrative.lower() or "unavailable" in result.regime_narrative.lower()


@pytest.mark.asyncio
async def test_persistence(mock_db):
    synth = NarrativeSynthesizer()
    score_state = _make_score_state()
    regime = _make_regime()

    async def mock_call_llm(system, user, max_tokens=1024):
        if "regime assessment" in system.lower():
            return ("Persisted stage 1", "ollama/llama3.1:8b")
        return ("Persisted stage 2", "ollama/llama3.1:8b")

    with patch("macro.narrative.synthesizer._call_llm", side_effect=mock_call_llm):
        await synth.generate(score_state, regime, [], _make_catalyst_alignment())

    rows = mock_db.execute(
        "SELECT stage, content, model_used FROM macro_narratives WHERE date = ? ORDER BY stage",
        (date.today().isoformat(),),
    ).fetchall()

    assert len(rows) == 2
    assert rows[0]["stage"] == 1
    assert rows[0]["content"] == "Persisted stage 1"
    assert rows[1]["stage"] == 2
    assert rows[1]["content"] == "Persisted stage 2"


@pytest.mark.asyncio
async def test_cached_narrative_returns_without_llm(mock_db):
    today = date.today().isoformat()
    mock_db.execute(
        "INSERT INTO macro_narratives (date, stage, content, model_used) VALUES (?, 1, ?, ?)",
        (today, "Cached regime", "ollama/llama3.1:8b"),
    )
    mock_db.execute(
        "INSERT INTO macro_narratives (date, stage, content, model_used) VALUES (?, 2, ?, ?)",
        (today, "Cached trade", "ollama/llama3.1:8b"),
    )
    mock_db.commit()

    synth = NarrativeSynthesizer()

    with patch("macro.narrative.synthesizer.get_conn") as mock_get_conn:
        mock_get_conn.return_value.__enter__ = MagicMock(return_value=mock_db)
        mock_get_conn.return_value.__exit__ = MagicMock(return_value=False)

        result = await synth.get_cached_narrative(today)

    assert result is not None
    assert result.regime_narrative == "Cached regime"
    assert result.trade_narrative == "Cached trade"


@pytest.mark.asyncio
async def test_cached_narrative_missing_returns_none(mock_db):
    synth = NarrativeSynthesizer()

    with patch("macro.narrative.synthesizer.get_conn") as mock_get_conn:
        mock_get_conn.return_value.__enter__ = MagicMock(return_value=mock_db)
        mock_get_conn.return_value.__exit__ = MagicMock(return_value=False)

        result = await synth.get_cached_narrative("2099-01-01")

    assert result is None


@pytest.mark.asyncio
async def test_cached_narrative_partial_returns_none(mock_db):
    today = date.today().isoformat()
    mock_db.execute(
        "INSERT INTO macro_narratives (date, stage, content, model_used) VALUES (?, 1, ?, ?)",
        (today, "Only stage 1", "ollama/llama3.1:8b"),
    )
    mock_db.commit()

    synth = NarrativeSynthesizer()

    with patch("macro.narrative.synthesizer.get_conn") as mock_get_conn:
        mock_get_conn.return_value.__enter__ = MagicMock(return_value=mock_db)
        mock_get_conn.return_value.__exit__ = MagicMock(return_value=False)

        result = await synth.get_cached_narrative(today)

    assert result is None


# ─── Prompt formatting tests ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_prompt_formatting_with_zero_ideas(mock_db):
    synth = NarrativeSynthesizer()
    call_log = []

    async def mock_call_llm(system, user, max_tokens=1024):
        call_log.append(user)
        if "regime assessment" in system.lower():
            return ("Regime ok", "ollama/llama3.1:8b")
        return ("No trades", "ollama/llama3.1:8b")

    with patch("macro.narrative.synthesizer._call_llm", side_effect=mock_call_llm):
        await synth.generate(_make_score_state(), _make_regime(), [], _make_catalyst_alignment())

    stage2_prompt = call_log[1]
    assert "0" in stage2_prompt
    assert "None qualifying" in stage2_prompt


@pytest.mark.asyncio
async def test_prompt_formatting_with_five_ideas(mock_db):
    synth = NarrativeSynthesizer()
    ideas = [_make_trade_idea(half_size=(i % 2 == 1)) for i in range(5)]
    call_log = []

    async def mock_call_llm(system, user, max_tokens=1024):
        call_log.append(user)
        if "regime assessment" in system.lower():
            return ("Regime ok", "ollama/llama3.1:8b")
        return ("Five trades", "ollama/llama3.1:8b")

    with patch("macro.narrative.synthesizer._call_llm", side_effect=mock_call_llm):
        await synth.generate(_make_score_state(), _make_regime(), ideas, _make_catalyst_alignment())

    stage2_prompt = call_log[1]
    assert "5" in stage2_prompt


@pytest.mark.asyncio
async def test_empty_score_state_handled(mock_db):
    synth = NarrativeSynthesizer()
    empty_state = ScoreState(date=date.today().isoformat(), factors=[], asset_scores={})

    async def mock_call_llm(system, user, max_tokens=1024):
        if "regime assessment" in system.lower():
            return ("Empty regime", "ollama/llama3.1:8b")
        return ("Empty trade", "ollama/llama3.1:8b")

    with patch("macro.narrative.synthesizer._call_llm", side_effect=mock_call_llm):
        result = await synth.generate(empty_state, _make_regime(), [], _make_catalyst_alignment())

    assert isinstance(result, NarrativeOutput)


import os