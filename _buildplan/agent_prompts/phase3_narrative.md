# Agent A12 — Two-Stage Narrative Synthesizer

## Objective

Implement the LLM-powered narrative layer that produces a daily "Today's Read" — a 200-400 word morning brief. The synthesis happens in two separate LLM calls: Stage 1 characterizes the regime (what world we're in), Stage 2 produces the directional bias and trade commentary. Two stages are mandatory to prevent the narrative from rationalizing trades.

## Pre-flight Reads

1. `backend/macro/models.py` — `NarrativeOutput`, `ScoreState`, `RegimeReading`, `TradeIdea`
2. `backend/macro/types.py` — regime names, factor names
3. `backend/routers/ai.py` — existing LLM client pattern (Ollama + Claude fallback)
4. `backend/database.py` — `get_conn()` for persistence
5. `backend/config.py` — env var access pattern

## Scope — Files This Agent Owns

- `backend/macro/narrative/synthesizer.py` — **create/fill**
- `backend/macro/narrative/prompts.py` — **create/fill**

## Scope — Files This Agent Must NOT Touch

All other files.

## Interface Contract

```python
# backend/macro/narrative/synthesizer.py

from backend.macro.models import NarrativeOutput, ScoreState, RegimeReading, TradeIdea, CatalystAlignment

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
        ...

    async def _stage1_regime(self, score_state: ScoreState, regime: RegimeReading) -> str:
        """LLM call: characterize the regime."""
        ...

    async def _stage2_trade(
        self, regime_narrative: str, trade_ideas: list[TradeIdea],
        catalyst_alignment: CatalystAlignment, score_state: ScoreState
    ) -> str:
        """LLM call: directional bias and trade commentary."""
        ...

    async def get_cached_narrative(self, date: str) -> NarrativeOutput | None:
        """Retrieve today's narrative from DB if already generated."""
        ...
```

```python
# backend/macro/narrative/prompts.py

STAGE1_SYSTEM: str
STAGE1_USER_TEMPLATE: str
STAGE2_SYSTEM: str
STAGE2_USER_TEMPLATE: str
```

## Implementation Requirements

### LLM Client Pattern

Follow the existing pattern from `backend/routers/ai.py`:
1. Try Ollama (localhost:11434) first
2. Fall back to Claude API (ANTHROPIC_API_KEY)
3. If neither available, return a fallback message

```python
import httpx
import os
import logging

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = os.getenv("MACRO_LLM_MODEL", "llama3.1:8b")
CLAUDE_MODEL = os.getenv("AI_MODEL", "claude-sonnet-4-5-20241022")

async def _call_llm(system: str, user: str, max_tokens: int = 1024) -> tuple[str, str]:
    """
    Call LLM with system + user prompts. Returns (response_text, model_used).
    Tries Ollama first, falls back to Claude.
    """
    # Try Ollama
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

    # Try Claude
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
```

### Stage 1 — Regime Characterization

**System prompt (`STAGE1_SYSTEM`):**
```
You are a macro strategist writing a concise regime assessment for an options trader.
Your output will be used as INPUT to a separate model that generates trade ideas — you must NOT suggest trades yourself.
Write 100-150 words. Be direct. No hedging language. State what the data shows.
```

**User prompt template (`STAGE1_USER_TEMPLATE`):**
```
Current macro regime: {regime_name} (Day {age_days}, conviction: {conviction})

Factor scores (blended, scale -2 to +2):
- Real Rate: {real_rate_score:.2f}
- Risk Appetite: {risk_appetite_score:.2f}
- Dollar Liquidity: {dollar_liquidity_score:.2f}
- Growth/Inflation: {growth_inflation_score:.2f}

Coherence: {coherence:.0%}
Recently shifted: {recently_shifted}

Characterize this regime. What macro environment are we in? What changed recently? What is the strongest signal? What is the strongest contradicting signal? Do NOT suggest any trades.
```

### Stage 2 — Trade Commentary

**System prompt (`STAGE2_SYSTEM`):**
```
You are a macro options strategist writing a morning brief. You receive a regime characterization (from a separate model) plus current trade setups.
Write 150-250 words covering: (1) directional bias for the week ahead, (2) commentary on qualifying trades (if any), (3) key risk to monitor.
Be direct, specific, and confident. This is for an experienced options trader, not a retail audience.
Do not repeat the regime characterization — reference it briefly and move to actionable content.
If no trades qualify, explain why and what would need to change.
```

**User prompt template (`STAGE2_USER_TEMPLATE`):**
```
REGIME ASSESSMENT:
{stage1_output}

QUALIFYING TRADE IDEAS ({n_ideas}):
{trade_ideas_formatted}

CATALYST CONTEXT:
{catalyst_summary}

Write the morning directional brief.
```

### Trade Ideas Formatting (for Stage 2 prompt):

```python
def _format_trade_ideas(ideas: list[TradeIdea]) -> str:
    if not ideas:
        return "None qualifying. All assets fail the 3-confirmation filter."
    lines = []
    for idea in ideas:
        lines.append(
            f"- {idea.asset} {idea.direction}: {idea.structure}, "
            f"DTE {idea.dte_range[0]}-{idea.dte_range[1]}, "
            f"conviction {idea.conviction}, "
            f"{'HALF SIZE' if idea.half_size else 'full size'}"
        )
    return "\n".join(lines)
```

### Persistence

Store both stages in `macro_narratives` table:
```python
with get_conn() as conn:
    conn.execute("""
        INSERT OR REPLACE INTO macro_narratives (date, stage, content, model_used)
        VALUES (?, 1, ?, ?)
    """, (today, stage1_text, model1))
    conn.execute("""
        INSERT OR REPLACE INTO macro_narratives (date, stage, content, model_used)
        VALUES (?, 2, ?, ?)
    """, (today, stage2_text, model2))
```

### Caching / Regeneration

- `get_cached_narrative(date)`: check DB for today's narrative. If both stages exist, return immediately without calling LLM.
- The scheduler calls `generate()` which always regenerates (for the daily refresh).
- Manual "Regenerate" button from frontend will call the router endpoint which calls `generate()` directly (bypassing cache).

### Fallback When LLM Unavailable

If both Ollama and Claude are unavailable:
```python
stage1_fallback = f"Regime: {regime.regime.value.replace('_', ' ').title()}. Day {regime.age_days}. Conviction: {regime.conviction.value}. LLM narrative generation unavailable — start Ollama or configure ANTHROPIC_API_KEY."
stage2_fallback = "Trade commentary unavailable. See structured data above for current setups."
model_used = "fallback/none"
```

### Output Assembly

```python
return NarrativeOutput(
    date=today,
    regime_narrative=stage1_text,
    trade_narrative=stage2_text,
    model_used=model_used,
)
```

The frontend displays `regime_narrative + "\n\n" + trade_narrative` as the full morning read.

## Test Requirements

Create `backend/macro/narrative/tests/test_synthesizer.py`:
1. Mock LLM responses (both Ollama and Claude), verify two-stage flow.
2. Test that Stage 2 receives Stage 1 output (not the raw data).
3. Test fallback message when no LLM available.
4. Test caching: second call same day returns DB content without LLM call.
5. Test persistence: both stages stored in DB.
6. Test prompt formatting with various trade idea counts (0, 1, 5).
7. Test with empty score_state (handles missing data in prompt).

Run: `cd backend && python -m pytest macro/narrative/tests/test_synthesizer.py -v`

## Hard Constraints

- No new pip dependencies (httpx already available).
- Do not modify `backend/routers/ai.py` or any other existing file.
- Two LLM calls are MANDATORY — do not combine into one call.
- Prompt templates must be in `prompts.py`, not hardcoded in synthesizer.py.
- Max token budget: Stage 1 = 512, Stage 2 = 1024.
- The model env var `MACRO_LLM_MODEL` allows the user to specify which Ollama model to use.

## Done Criteria

- [ ] `generate()` produces valid `NarrativeOutput` with two-stage content
- [ ] Stage 1 and Stage 2 are separate LLM calls
- [ ] Ollama → Claude fallback chain works
- [ ] Graceful fallback when no LLM available
- [ ] Results persisted to macro_narratives table
- [ ] Cached narratives returned without LLM calls
- [ ] Prompts are well-formatted and produce useful output
- [ ] All tests pass
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A12_narrative.md`
