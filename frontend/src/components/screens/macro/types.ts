export type RegimeName =
  | 'disinflation_risk_on'
  | 'stagflation_defensive'
  | 'flight_to_quality'
  | 'reflation'
  | 'mixed_no_edge'

export type Conviction = 'high' | 'medium' | 'low'

export type AssetSymbol = 'SPY' | 'VIX' | 'GLD' | 'SLV' | 'DXY' | 'WTI' | 'BRENT'

export type BorderState = 'yellow' | 'green' | 'muted'

export interface RegimeReading {
  regime: RegimeName
  age_days: number
  conviction: Conviction
  recently_shifted: boolean
  coherence_score: number
}

export interface AssetScoreCard {
  asset: AssetSymbol
  price: number | null
  change_1d_pct: number | null
  change_5d_pct: number | null
  change_21d_pct: number | null
  score_5d: number
  score_10d: number
  score_21d: number
  iv_rank: number | null
  dominant_factor: string
  state_line: string
  border_state: BorderState
}

export interface CatalystEvent {
  event_date: string
  event_time: string | null
  event_type: string
  event_label: string
  assets_impacted: AssetSymbol[]
  consensus_value: number | null
  prior_value: number | null
  surprise_weight: number
  straddle_implied_move: number | null
}

export interface TradeIdea {
  asset: AssetSymbol
  direction: string
  dte_range: [number, number]
  structure: string
  entry_condition: string
  invalidation: string
  conviction: Conviction
  iv_rank_context: string
  confirmations: number
  half_size: boolean
}

export interface NarrativeOutput {
  date: string
  regime_narrative: string
  trade_narrative: string
  model_used: string
}

export interface MacroDashboardResponse {
  regime: RegimeReading
  asset_scores: Record<string, AssetScoreCard>
  catalysts: CatalystEvent[]
  trade_ideas: TradeIdea[]
  narrative: NarrativeOutput | null
  last_refresh: string | null
  stale: boolean
}