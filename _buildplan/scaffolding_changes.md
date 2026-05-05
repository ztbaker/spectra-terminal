# Scaffolding Changes

These are the files I will create during the scaffolding phase (after Gate 2 approval). Each contains only type definitions, interface contracts, and empty stub implementations — no business logic.

## Files Created

### Backend — `backend/macro/`

```
backend/macro/__init__.py                    — Package init, exports
backend/macro/models.py                      — Pydantic models for all MACRO subsystem state
backend/macro/types.py                       — Enums (RegimeName, FactorName, AssetSymbol), constants, weight tables
backend/macro/data/__init__.py               — Package init
backend/macro/data/fred_macro.py             — Stub: async def fetch_scoring_inputs(...) -> ScoringInputs
backend/macro/data/cftc_scraper.py           — Stub: async def fetch_cot_positions(...) -> list[CftcPosition]
backend/macro/data/fedwatch.py               — Stub: async def fetch_fedwatch_probs(...) -> FedWatchState
backend/macro/data/iv_logger.py              — Stub: async def log_daily_iv30(...) -> None; async def get_iv_rank(...)
backend/macro/data/market_data.py            — Stub: async def fetch_asset_prices(...) -> dict[str, AssetSnapshot]
backend/macro/data/catalyst.py               — Stub: async def build_catalyst_calendar(...) -> list[CatalystEvent]
backend/macro/engine/__init__.py             — Package init
backend/macro/engine/normalizer.py           — Stub: class Normalizer — percentile_rank(series, window_days)
backend/macro/engine/scoring.py              — Stub: class ScoringEngine — compute(date) -> ScoreState
backend/macro/engine/regime.py               — Stub: class RegimeClassifier — classify(ScoreState) -> RegimeReading
backend/macro/engine/catalyst_align.py       — Stub: class CatalystAligner — evaluate(date, assets) -> CatalystAlignment
backend/macro/engine/filter.py               — Stub: class TradeFilter ��� filter(ScoreState, RegimeReading, CatalystAlignment) -> list[TradeIdea]
backend/macro/narrative/__init__.py          — Package init
backend/macro/narrative/synthesizer.py       — Stub: class NarrativeSynthesizer — generate(state) -> NarrativeOutput
backend/macro/narrative/prompts.py           — Constants: STAGE1_SYSTEM, STAGE1_USER_TEMPLATE, STAGE2_SYSTEM, STAGE2_USER_TEMPLATE
backend/macro/scheduler.py                   — Stub: def setup_scheduler(app) -> None
backend/macro/router.py                      — Stub endpoints: GET /macro/dashboard, /macro/regime, /macro/catalysts, /macro/ideas, /macro/narrative, POST /macro/refresh
```

### Frontend — `frontend/src/components/screens/macro/`

```
frontend/src/components/screens/macro/types.ts           — TypeScript interfaces mirroring backend models
frontend/src/components/screens/macro/fixtures.ts        — Static mock data for all zones
frontend/src/components/screens/macro/MacroIntelScreen.tsx — Container shell (imports zones, renders stacked)
frontend/src/components/screens/macro/RegimeBar.tsx      — Empty component with Props interface
frontend/src/components/screens/macro/AssetGrid.tsx      — Empty component with Props interface
frontend/src/components/screens/macro/CatalystCalendar.tsx — Empty component with Props interface
frontend/src/components/screens/macro/TradeReadyTable.tsx — Empty component with Props interface
frontend/src/components/screens/macro/TodaysRead.tsx     — Empty component with Props interface
```

### Modified Existing Files

| File | Change |
|------|--------|
| `backend/database.py` | Add `_init_macro_tables(conn)` call inside `init_db()` |
| `backend/main.py` | Replace `from routers import macro` → `from macro.router import router as macro_router`; update `include_router` |
| `frontend/src/App.tsx` | Change MacroScreen import to `MacroIntelScreen` from new path |
| `frontend/src/types/index.ts` | Add `'macro'` sub-variants to `ScreenType` if needed (existing `'macro'` stays) |
| `frontend/src/lib/api.ts` | Add fetch functions for new macro endpoints |
| `backend/cache.py` | Add `"macro": ("macro_input_cache", "input_key")` to `_TABLE_MAP` |

### SQLite Migration (in scaffolding)

Added as `_init_macro_tables(conn: sqlite3.Connection)` called from `init_db()`:

```sql
CREATE TABLE IF NOT EXISTS macro_iv30_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset TEXT NOT NULL,
    date TEXT NOT NULL,
    iv30 REAL,
    iv_rank_pct REAL,
    UNIQUE(asset, date)
);

CREATE TABLE IF NOT EXISTS macro_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    factor_name TEXT NOT NULL,
    score_5d REAL,
    score_10d REAL,
    score_21d REAL,
    raw_inputs_json TEXT,
    UNIQUE(date, factor_name)
);

CREATE TABLE IF NOT EXISTS macro_regime_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    regime_name TEXT NOT NULL,
    conviction TEXT NOT NULL,
    age_days INTEGER NOT NULL,
    score_coherence REAL
);

CREATE TABLE IF NOT EXISTS macro_catalysts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,
    event_time TEXT,
    event_type TEXT NOT NULL,
    event_label TEXT NOT NULL,
    assets_impacted TEXT NOT NULL,
    consensus_value REAL,
    prior_value REAL,
    surprise_weight REAL DEFAULT 1.0,
    straddle_implied_move REAL
);

CREATE TABLE IF NOT EXISTS macro_trade_ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_date TEXT NOT NULL,
    asset TEXT NOT NULL,
    direction TEXT NOT NULL,
    dte_min INTEGER,
    dte_max INTEGER,
    structure TEXT,
    entry_condition TEXT,
    invalidation TEXT,
    conviction TEXT NOT NULL,
    iv_rank_context TEXT,
    score_snapshot_json TEXT
);

CREATE TABLE IF NOT EXISTS macro_narratives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    stage INTEGER NOT NULL,
    content TEXT NOT NULL,
    model_used TEXT,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(date, stage)
);

CREATE TABLE IF NOT EXISTS macro_cftc_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date TEXT NOT NULL,
    asset TEXT NOT NULL,
    net_long INTEGER,
    pct_oi REAL,
    change_1w INTEGER,
    UNIQUE(report_date, asset)
);

CREATE TABLE IF NOT EXISTS macro_input_cache (
    input_key TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Interface Contracts (Key Signatures)

These are the function/class signatures that agents code against. Defined in `models.py` and `types.py`.

### Python (backend/macro/types.py)
```python
from enum import Enum

class RegimeName(str, Enum):
    DISINFLATION_RISK_ON = "disinflation_risk_on"
    STAGFLATION_DEFENSIVE = "stagflation_defensive"
    FLIGHT_TO_QUALITY = "flight_to_quality"
    REFLATION = "reflation"
    MIXED_NO_EDGE = "mixed_no_edge"

class FactorName(str, Enum):
    REAL_RATE = "real_rate"
    RISK_APPETITE = "risk_appetite"
    DOLLAR_LIQUIDITY = "dollar_liquidity"
    GROWTH_INFLATION = "growth_inflation"

class AssetSymbol(str, Enum):
    SPY = "SPY"
    VIX = "VIX"
    GLD = "GLD"
    SLV = "SLV"
    DXY = "DXY"
    WTI = "WTI"
    BRENT = "BRENT"

class Conviction(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

ASSETS = list(AssetSymbol)

# Factor → asset mapping (which factors drive which assets)
FACTOR_ASSET_MAP: dict[FactorName, list[AssetSymbol]] = {
    FactorName.REAL_RATE: [AssetSymbol.GLD, AssetSymbol.SLV],
    FactorName.RISK_APPETITE: [AssetSymbol.SPY, AssetSymbol.VIX],
    FactorName.DOLLAR_LIQUIDITY: [AssetSymbol.DXY, AssetSymbol.GLD],
    FactorName.GROWTH_INFLATION: [AssetSymbol.WTI, AssetSymbol.BRENT, AssetSymbol.SLV],
}

# Scoring weights: (slow, fast, positioning)
FACTOR_WEIGHTS: dict[FactorName, tuple[float, float, float]] = {
    FactorName.REAL_RATE: (0.4, 0.35, 0.25),
    FactorName.RISK_APPETITE: (0.3, 0.4, 0.3),
    FactorName.DOLLAR_LIQUIDITY: (0.45, 0.30, 0.25),
    FactorName.GROWTH_INFLATION: (0.35, 0.35, 0.30),
}
```

### Python (backend/macro/models.py) — Key Types
```python
from pydantic import BaseModel
from .types import RegimeName, FactorName, AssetSymbol, Conviction

class FactorScore(BaseModel):
    factor: FactorName
    slow_pctile: float      # 0-100 percentile
    fast_pctile: float
    positioning_pctile: float
    blended: float          # weighted blend, -2 to +2 scale

class ScoreState(BaseModel):
    date: str
    factors: list[FactorScore]
    asset_scores: dict[str, dict[str, float]]  # asset -> {horizon_5d, horizon_10d, horizon_21d}

class RegimeReading(BaseModel):
    regime: RegimeName
    age_days: int
    conviction: Conviction
    recently_shifted: bool  # True if shifted within 5 trading days
    coherence_score: float  # 0-1, how aligned factors are

class CatalystEvent(BaseModel):
    event_date: str
    event_time: str | None
    event_type: str
    event_label: str
    assets_impacted: list[AssetSymbol]
    consensus_value: float | None
    prior_value: float | None
    surprise_weight: float
    straddle_implied_move: float | None

class CatalystAlignment(BaseModel):
    date: str
    per_asset: dict[str, AssetCatalystState]

class AssetCatalystState(BaseModel):
    catalyst_density_14d: int
    next_catalyst: CatalystEvent | None
    aligned_with_score: bool | None  # None if no directional catalyst
    atm_straddle_move_14d: float | None

class TradeIdea(BaseModel):
    asset: AssetSymbol
    direction: str           # "long_calls", "long_puts", "put_spread", etc.
    dte_range: tuple[int, int]
    structure: str           # "ATM call", "25d put spread", etc.
    entry_condition: str
    invalidation: str
    conviction: Conviction
    iv_rank_context: str
    confirmations: int       # 2 or 3
    half_size: bool          # True when only 2 confirmations

class NarrativeOutput(BaseModel):
    date: str
    regime_narrative: str    # Stage 1 output
    trade_narrative: str     # Stage 2 output
    model_used: str

class MacroDashboardResponse(BaseModel):
    regime: RegimeReading
    asset_scores: dict[str, AssetScoreCard]
    catalysts: list[CatalystEvent]
    trade_ideas: list[TradeIdea]
    narrative: NarrativeOutput | None
    last_refresh: str | None
    stale: bool

class AssetScoreCard(BaseModel):
    asset: AssetSymbol
    price: float | None
    change_1d_pct: float | None
    change_5d_pct: float | None
    change_21d_pct: float | None
    score_5d: float
    score_10d: float
    score_21d: float
    iv_rank: float | None
    dominant_factor: FactorName
    state_line: str
    border_state: str  # "yellow" | "green" | "muted"
```

### TypeScript (frontend types.ts) — mirrors the above
```typescript
export type RegimeName = 'disinflation_risk_on' | 'stagflation_defensive' | 'flight_to_quality' | 'reflation' | 'mixed_no_edge'
export type Conviction = 'high' | 'medium' | 'low'
export type AssetSymbol = 'SPY' | 'VIX' | 'GLD' | 'SLV' | 'DXY' | 'WTI' | 'BRENT'
export type BorderState = 'yellow' | 'green' | 'muted'

export interface RegimeReading { regime: RegimeName; age_days: number; conviction: Conviction; recently_shifted: boolean; coherence_score: number }
export interface AssetScoreCard { asset: AssetSymbol; price: number | null; change_1d_pct: number | null; change_5d_pct: number | null; change_21d_pct: number | null; score_5d: number; score_10d: number; score_21d: number; iv_rank: number | null; dominant_factor: string; state_line: string; border_state: BorderState }
export interface CatalystEvent { event_date: string; event_time: string | null; event_type: string; event_label: string; assets_impacted: AssetSymbol[]; consensus_value: number | null; prior_value: number | null; surprise_weight: number; straddle_implied_move: number | null }
export interface TradeIdea { asset: AssetSymbol; direction: string; dte_range: [number, number]; structure: string; entry_condition: string; invalidation: string; conviction: Conviction; iv_rank_context: string; confirmations: number; half_size: boolean }
export interface NarrativeOutput { date: string; regime_narrative: string; trade_narrative: string; model_used: string }
export interface MacroDashboardResponse { regime: RegimeReading; asset_scores: Record<string, AssetScoreCard>; catalysts: CatalystEvent[]; trade_ideas: TradeIdea[]; narrative: NarrativeOutput | null; last_refresh: string | null; stale: boolean }
```
