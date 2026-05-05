# A12 — Two-Stage Narrative Synthesizer

## Status: COMPLETE

## Files Modified

- `backend/macro/narrative/synthesizer.py` — filled implementation
- `backend/macro/narrative/prompts.py` — already had templates, no changes needed

## Files Created

- `backend/macro/narrative/tests/test_synthesizer.py` — 21 tests

## Implementation Summary

### `synthesizer.py`
- `NarrativeSynthesizer.generate()` — orchestrates two-stage LLM flow, persists to `macro_narratives` table
- `_stage1_regime()` — formats and sends Stage 1 prompt (regime characterization), max 512 tokens
- `_stage2_trade()` — formats and sends Stage 2 prompt (trade commentary), receives Stage 1 output, max 1024 tokens
- `get_cached_narrative()` — retrieves both stages from DB, returns `None` if incomplete
- `_call_llm()` — Ollama-first, Claude-fallback LLM client (mirrors `ai.py` pattern)
- `_format_trade_ideas()` — formats trade idea list for Stage 2 prompt
- `_format_catalyst_summary()` — formats catalyst alignment for Stage 2 prompt
- Graceful fallback when no LLM available (both Ollama and Claude down)
- Proper enum value extraction for `AssetSymbol` and `Conviction` in formatting

### `prompts.py`
- Already contained all four prompt templates per spec — no modifications needed

## Done Criteria

- [x] `generate()` produces valid `NarrativeOutput` with two-stage content
- [x] Stage 1 and Stage 2 are separate LLM calls
- [x] Ollama → Claude fallback chain works
- [x] Graceful fallback when no LLM available
- [x] Results persisted to macro_narratives table
- [x] Cached narratives returned without LLM calls
- [x] Prompts are well-formatted and produce useful output
- [x] All tests pass (21/21)
- [x] Summary written to reporting location

## Test Results

```
21 passed in 0.15s
```

Tests cover:
- Ollama success, Claude fallback, no-backend fallback for `_call_llm`
- Trade idea formatting (0, 1, 5 ideas; half_size flag)
- Catalyst summary formatting
- Factor score extraction
- Two-stage flow (separate calls, Stage 2 receives Stage 1 output)
- Fallback messages when LLM unavailable
- DB persistence of both stages
- Cached narrative retrieval (complete, missing, partial)
- Prompt formatting with various trade idea counts
- Empty score_state handling