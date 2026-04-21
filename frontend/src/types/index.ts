// ─── Equity ──────────────────────────────────────────────────────────────────
export interface EquityData {
  ticker: string
  company_name: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  volume: number | null
  avg_volume: number | null
  market_cap: number | null
  pe_ratio: number | null
  eps: number | null
  high_52w: number | null
  low_52w: number | null
  beta: number | null
  dividend_yield: number | null
  sector: string | null
  industry: string | null
  description: string | null
  exchange: string | null
  currency: string | null
  shares_outstanding: number | null
  float_shares: number | null
  bid: number | null
  ask: number | null
  day_high: number | null
  day_low: number | null
  open: number | null
  prev_close: number | null
  cached?: boolean
  // DES fields
  country?: string | null
  sub_industry?: string | null
  ceo?: string | null
  address?: string | null
  phone?: string | null
  short_ratio?: number | null
  forward_pe?: number | null
  ev_ebitda?: number | null
  price_to_book?: number | null
  employees?: number | null
  website?: string | null
  target_price?: number | null
  recommendation?: string | null
  next_earnings?: string | null
}

// ─── Chart ───────────────────────────────────────────────────────────────────
export interface OhlcvBar {
  time: string | number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ChartData {
  ticker: string
  period: string
  interval: string
  ohlcv: OhlcvBar[]
  sma20: (number | null)[]
  sma50: (number | null)[]
  sma200: (number | null)[]
  rsi: (number | null)[]
  macd_line: (number | null)[]
  macd_signal: (number | null)[]
  macd_hist: (number | null)[]
  bb_upper: (number | null)[]
  bb_mid: (number | null)[]
  bb_lower: (number | null)[]
  cached?: boolean
  has_more?: boolean
  truncated?: boolean
}

// ─── Options ─────────────────────────────────────────────────────────────────
export interface OptionContract {
  strike: number | null
  last_price: number | null
  bid: number | null
  ask: number | null
  volume: number | null
  open_interest: number | null
  implied_volatility: number | null
  delta: number | null
  gamma: number | null
  theta: number | null
  vega: number | null
  rho: number | null
  charm: number | null
  vanna: number | null
  in_the_money: boolean
  expiration: string
}

export interface OptionsExpiry {
  expiry: string
  calls: OptionContract[]
  puts: OptionContract[]
}

export interface OptionsData {
  ticker: string
  spot: number | null
  expiries: OptionsExpiry[]
}

// ─── News ─────────────────────────────────────────────────────────────────────
export interface NewsItem {
  headline: string
  source: string
  url: string
  datetime: number
  summary: string
  sentiment: 'positive' | 'negative' | 'neutral' | null
}

export interface NewsResponse {
  ticker: string | null
  items: NewsItem[]
  cached?: boolean
}

export interface ReaderArticle {
  url: string
  title: string | null
  author: string | null
  published: string | null
  site: string | null
  text: string
  word_count: number
  error: string | null
}

// ─── Indices ─────────────────────────────────────────────────────────────────
export interface IndexQuote {
  ticker: string
  label: string
  price: number | null
  change: number | null
  change_pct: number | null
}

// ─── FRED / Econ ─────────────────────────────────────────────────────────────
export interface EconObservation {
  date: string
  value: number | null
}

export interface EconSeries {
  series_id: string
  title: string
  units: string
  frequency: string
  observations: EconObservation[]
  cached?: boolean
}

export interface MacroCard {
  series_id: string
  label: string
  value: number | null
  prev: number | null
  change: number | null
  units: string
  sparkline: number[]
  error?: string | null
}

export interface MacroDashboard {
  cards: MacroCard[]
  cached?: boolean
}

// ─── Portfolio ────────────────────────────────────────────────────────────────
export interface PortfolioRow {
  id: number
  ticker: string
  shares: number
  avg_cost: number
  added_at: string
  current_price: number | null
  market_value: number | null
  pnl: number | null
  pnl_pct: number | null
}

export interface PortfolioPerformance {
  holdings: PortfolioRow[]
  total_cost: number
  total_value: number
  total_pnl: number
  total_pnl_pct: number
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
export interface WatchlistRow {
  id: number
  ticker: string
  added_at: string
  notes: string | null
}

export interface WatchlistQuote {
  ticker: string
  company_name: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  volume: number | null
  market_cap: number | null
}

// ─── Earnings ────────────────────────────────────────────────────────────────
export interface EarningsEntry {
  ticker: string
  company_name: string | null
  earnings_date: string
  eps_estimate: number | null
  eps_actual: number | null
  revenue_estimate: number | null
  revenue_actual: number | null
  when_market: 'BMO' | 'AMC' | 'unknown'
}

export interface EarningsDay {
  date: string
  entries: EarningsEntry[]
}

export interface EarningsCalendar {
  days: EarningsDay[]
  cached?: boolean
}

// ─── Screener ────────────────────────────────────────────────────────────────
export interface ScreenerResult {
  ticker: string
  company_name: string | null
  sector: string | null
  price: number | null
  change_pct: number | null
  market_cap: number | null
  pe_ratio: number | null
  volume: number | null
  beta: number | null
  high_52w: number | null
  low_52w: number | null
}

export interface ScreenerResponse {
  results: ScreenerResult[]
  total: number
  cached?: boolean
}

// ─── FX ──────────────────────────────────────────────────────────────────────
export interface FXPair {
  pair: string
  label: string
  rate: number | null
  change: number | null
  change_pct: number | null
  day_high: number | null
  day_low: number | null
  chart_data: { time: string; open: number; high: number; low: number; close: number }[]
}

export interface FXResponse {
  pairs: FXPair[]
  cached?: boolean
}

// ─── Crypto ──────────────────────────────────────────────────────────────────
export interface CryptoAsset {
  ticker: string
  symbol: string
  name?: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  market_cap: number | null
  volume: number | null
}

export interface CryptoResponse {
  assets: CryptoAsset[]
  cached?: boolean
}

// ─── Filings ─────────────────────────────────────────────────────────────────
export interface Filing {
  form_type: string
  filed_date: string
  description: string
  url: string
  period_of_report: string
  accession_number: string
}

export interface FilingsResponse {
  ticker: string
  filings: Filing[]
  cached?: boolean
}

// ─── DES Financials ───────────────────────────────────────────────────────────
export interface FinancialsData {
  revenue_ttm: number | null
  net_income_ttm: number | null
  eps_ttm: number | null
  gross_margin: number | null
  operating_margin: number | null
  debt_to_equity: number | null
  current_ratio: number | null
  return_on_equity: number | null
  return_on_assets: number | null
  revenue_growth: number | null
  earnings_growth: number | null
}

// ─── World Equity Indices (WEI) ───────────────────────────────────────────────
export interface WorldIndexEntry {
  ticker:     string
  name:       string
  short:      string
  country:    string
  region:     string
  price:      number | null
  change:     number | null
  change_pct: number | null
  volume:     number | null
  year_high:  number | null
  year_low:   number | null
  currency:   string | null
  error:      string | null
}

export interface WorldIndicesResponse {
  indices:    WorldIndexEntry[]
  fetched_at: number
}

// ─── Historical Spread (HS) ───────────────────────────────────────────────────
export interface SpreadPoint {
  time: string
  value: number
}

export interface PricePoint {
  time:  string
  value: number
}

export interface SpreadData {
  ticker1:     string
  ticker2:     string
  label1:      string
  label2:      string
  period:      string
  spread:      SpreadPoint[]
  series1:     PricePoint[]
  series2:     PricePoint[]
  current:     number | null
  high:        number | null
  low:         number | null
  avg:         number | null
  median:      number | null
  stdev:       number | null
  high_date:   string | null
  low_date:    string | null
  percentile:  number | null
}

// ─── Index constituents ───────────────────────────────────────────────────────
export interface IndexMember {
  ticker:     string
  price:      number | null
  change:     number | null
  change_pct: number | null
  volume:     number | null
  market_cap: number | null
}

export interface IndexMembersResponse {
  index_ticker: string
  index_name:   string
  members:      IndexMember[]
  total:        number
  offset:       number
  has_more:     boolean
}

// ─── ECST ─────────────────────────────────────────────────────────────────────
export interface ECSTEntry {
  series_id: string
  category: string
  label: string
  value: number | null
  prior: number | null
  change: number | null
  units: string
  frequency: string
  next_release_date: string | null
  sparkline: number[]
}

export interface ECSTResponse {
  entries: ECSTEntry[]
  cached?: boolean
}

// ─── FX Rates (matrix) ────────────────────────────────────────────────────────
export interface FXRatesResponse {
  rates: Record<string, number | null>
  fetched_at: number
}

// ─── ETF ──────────────────────────────────────────────────────────────────────
export interface ETFInfo {
  ticker: string
  name: string | null
  exchange: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  expense_ratio: number | null
  aum: number | null
  inception_date: string | null
  category: string | null
  benchmark: string | null
  description: string | null
  cached?: boolean
}

export interface ETFHolding {
  symbol: string
  name: string | null
  weight: number | null
  sector: string | null
}

export interface ETFSector {
  sector: string
  weight: number
}

export interface ETFCountry {
  country: string
  weight: number
}

export interface ETFPerformance {
  ticker: string
  perf_1d: number | null
  perf_1w: number | null
  perf_1m: number | null
  perf_ytd: number | null
  perf_1y: number | null
  perf_3y: number | null
  perf_5y: number | null
  cached?: boolean
}

// ─── Fixed Income (Bond) ──────────────────────────────────────────────────────
export interface YieldCurvePoint {
  tenor: string
  yield_value: number | null
}

export interface YieldCurveResponse {
  date: string | null
  curve: YieldCurvePoint[]
  cached?: boolean
}

export interface MortgageRateResponse {
  rate_30y: number | null
  rate_15y: number | null
  date: string | null
  cached?: boolean
}

// ─── Commodity ────────────────────────────────────────────────────────────────
export interface CommoditySpot {
  symbol: string
  name: string
  price: number | null
  change: number | null
  change_pct: number | null
  cached?: boolean
}

// ─── Congress Bills ───────────────────────────────────────────────────────────
export interface Bill {
  bill_id: string
  title: string
  type: string
  congress: number
  latest_action: string | null
  update_date: string | null
  url: string | null
}

// ─── IV Surface / Term Structure ──────────────────────────────────────────────
export interface IVSurface {
  expiries: string[]
  strikes: number[]
  iv: (number | null)[][]
}

export interface TermStructurePoint {
  expiry: string
  atm_iv: number | null
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export interface StatsResponse {
  ticker: string
  mean: number | null
  std: number | null
  skew: number | null
  kurtosis: number | null
  sharpe: number | null
  max_drawdown: number | null
  var_95: number | null
}

export interface FamaFrenchResponse {
  ticker: string
  alpha: number | null
  mkt_beta: number | null
  smb_beta: number | null
  hml_beta: number | null
  source: string
  cached?: boolean
}

export interface JarqueBeraResponse {
  ticker: string
  jb_statistic: number | null
  p_value: number | null
  is_normal: boolean | null
  skewness: number | null
  kurtosis: number | null
  source: string
  cached?: boolean
}

export interface ADFResponse {
  ticker: string
  adf_statistic: number | null
  p_value: number | null
  used_lag: number | null
  n_obs: number | null
  is_stationary: boolean | null
  critical_values: Record<string, number> | null
  source: string
  cached?: boolean
}

export interface VIFFactor {
  factor: string
  vif: number | null
}

export interface VIFResponse {
  ticker: string
  factors: VIFFactor[]
  source: string
  cached?: boolean
}

// ─── ETF Historical ──────────────────────────────────────────────────────────
export interface ETFHistoricalBar {
  time: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

export interface ETFHistoricalResponse {
  ticker: string
  period: string
  interval: string
  ohlcv: ETFHistoricalBar[]
  source: string
  cached?: boolean
}

// ─── Fixed Income TCM ───────────────────────────────────────────────────────
export interface TCMRate {
  tenor: string
  series_id: string
  value: number | null
  date: string | null
}

export interface TCMResponse {
  rates: TCMRate[]
  date: string | null
  source: string
  cached?: boolean
}

// ─── Options Historical IV ──────────────────────────────────────────────────
export interface HistoricalIVPoint {
  date: string
  iv: number | null
}

export interface HistoricalIVResponse {
  ticker: string
  atm_iv_30d: number | null
  date: string | null
  history: HistoricalIVPoint[]
  source: string
  cached?: boolean
}

// ─── Econ Search ──────────────────────────────────────────────────────────────
export interface EconSearchResult {
  series_id: string
  title: string
  frequency: string
  units: string
}

export interface EconSearchResponse {
  results: EconSearchResult[]
  cached?: boolean
}

// ─── Congress Bill Detail ──────────────────────────────────────────────────────
export interface BillDetail {
  bill_id: string
  title: string
  type: string
  congress: number
  summary: string | null
  sponsor: string | null
  sponsor_party: string | null
  introduced_date: string | null
  latest_action: string | null
  url: string | null
}

export interface BillDetailResponse {
  bill: BillDetail
  cached?: boolean
}

// ─── Econ Indicators ────────────────────────────────────────────────────────
export interface IndicatorEntry {
  series_id: string
  label: string
  value: number | null
  prev: number | null
  change: number | null
  units: string
  frequency: string
}

export interface IndicatorsResponse {
  indicators: IndicatorEntry[]
  source: string
  cached?: boolean
}

export interface CentralBankEntry {
  series_id: string
  label: string
  value: number | null
  date: string | null
  units: string
}

export interface CentralBankResponse {
  holdings: CentralBankEntry[]
  source: string
  cached?: boolean
}

export interface DotsEntry {
  country: string
  exports: number | null
  imports: number | null
  balance: number | null
  period: string | null
}

export interface DotsResponse {
  entries: DotsEntry[]
  source: string
  cached?: boolean
}

export interface HousePriceResponse {
  series_id: string
  title: string
  observations: EconObservation[]
  source: string
  cached?: boolean
}

export interface RetailPriceEntry {
  series_id: string
  label: string
  value: number | null
  date: string | null
  change_yoy: number | null
  units: string
}

export interface RetailPricesResponse {
  indicators: RetailPriceEntry[]
  source: string
  cached?: boolean
}

// ─── Equity extensions ───────────────────────────────────────────────────────
export interface MarketSnapshot {
  ticker: string
  name: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  volume: number | null
}

export interface MarketSnapshotsResponse {
  snapshots: MarketSnapshot[]
  source: string
  cached?: boolean
}

export interface OfficerComp {
  name: string | null
  title: string | null
  total_pay: number | null
  fiscal_year: number | null
}

export interface ManagementResponse {
  ticker: string
  officers: OfficerComp[]
  source: string
  cached?: boolean
}

export interface MarketCapBar {
  date: string
  market_cap: number | null
  price: number | null
}

export interface MarketCapHistoryResponse {
  ticker: string
  history: MarketCapBar[]
  source: string
  cached?: boolean
}

export interface EstimateEntry {
  period: string | null
  eps_estimate: number | null
  eps_actual: number | null
  revenue_estimate: number | null
  revenue_actual: number | null
}

export interface EstimatesResponse {
  ticker: string
  current_year: EstimateEntry[]
  next_year: EstimateEntry[]
  source: string
  cached?: boolean
}

export interface PeerEntry {
  ticker: string
  company_name: string | null
  price: number | null
  change_pct: number | null
  market_cap: number | null
  pe_ratio: number | null
  sector: string | null
  industry: string | null
}

export interface CompareResponse {
  ticker: string
  peers: PeerEntry[]
  source: string
  cached?: boolean
}

export interface CalendarEntry {
  ticker: string
  company_name: string | null
  event_type: string
  date: string | null
  details: string | null
}

export interface CalendarResponse {
  entries: CalendarEntry[]
  source: string
  cached?: boolean
}

export interface DiscoveryEntry {
  ticker: string
  company_name: string | null
  price: number | null
  change_pct: number | null
  volume: number | null
  market_cap: number | null
}

export interface DiscoveryResponse {
  gainers: DiscoveryEntry[]
  losers: DiscoveryEntry[]
  active: DiscoveryEntry[]
  source: string
  cached?: boolean
}

export interface ShortInterestEntry {
  week_start_date: string | null
  short_volume: number | null
  total_volume: number | null
  short_ratio: number | null
}

export interface ShortInterestResponse {
  ticker: string
  entries: ShortInterestEntry[]
  source: string
  cached?: boolean
}

// ─── Command parsing ─────────────────────────────────────────────────────────
export type ScreenType =
  | 'equity' | 'chart' | 'options' | 'news' | 'filings'
  | 'portfolio' | 'watchlist' | 'econ' | 'earnings'
  | 'screener' | 'fx' | 'crypto' | 'macro' | 'home' | 'des'
  | 'graph' | 'gpo' | 'gip' | 'wei' | 'hs'
  | 'ecst' | 'fxc' | 'quit'
  | 'fa' | 'etf' | 'bond' | 'comd' | 'cong' | 'quant' | 'ask' | 'help' | 'back'
  | 'bugreport'
  | 'logout'
  | 'chat'
  | 'meme'
  | 'profile'
  | 'ticker-menu'

// ─── Chat ────────────────────────────────────────────────────────────────────
export interface ChatRoom {
  id: number
  slug: string
  name: string
  description: string | null
  created_at: string
  member_count: number
  joined: boolean
}

export interface ChatMessage {
  id: number
  room_id: number | null
  sender_id: number
  sender_username: string
  recipient_id: number | null
  recipient_username: string | null
  body: string
  created_at: string
}

export interface ChatDMThread {
  peer_id: number
  peer_username: string
  last_message: string | null
  last_at: string | null
}

export interface ChatUserRow {
  id: number
  username: string
  online?: boolean
}

export interface ChatNotification {
  id: number
  kind: 'room' | 'dm'
  room_slug: string | null
  sender_username: string
  body: string
  created_at: string
}

export interface ParsedCommand {
  screen: ScreenType
  ticker?: string
  sub?: string
  raw: string
}

// ─── Workspace / Panel V3 ──────────────────────────────────────────────────

export type WorkspaceLayoutType = '1P' | '2P' | '2PT' | '3P' | '4P' | '1P+1S'

export interface PanelSnapshot {
  screen: ScreenType
  ticker?: string
  sub?: string
}

export interface PanelConfig {
  id: string
  screen: ScreenType
  ticker?: string
  sub?: string
  focused: boolean
  history?: PanelSnapshot[]
}

export interface WorkspaceState {
  layout: WorkspaceLayoutType
  panels: PanelConfig[]
  focusedPanelId: string | null
  sizes: number[]
}

// ─── FA (Fundamental Analysis) ─────────────────────────────────────────────────
export interface FAPeriod {
  date: string
  total_revenue: number | null
  cost_of_revenue: number | null
  gross_profit: number | null
  operating_expense: number | null
  operating_income: number | null
  ebitda: number | null
  interest_expense: number | null
  pretax_income: number | null
  tax_provision: number | null
  net_income: number | null
  diluted_eps: number | null
  basic_eps: number | null
  total_assets: number | null
  current_assets: number | null
  cash_and_equivalents: number | null
  inventory: number | null
  receivables: number | null
  ppe: number | null
  goodwill: number | null
  total_liabilities: number | null
  current_liabilities: number | null
  long_term_debt: number | null
  total_debt: number | null
  total_equity: number | null
  shares_outstanding: number | null
  operating_cash_flow: number | null
  investing_cash_flow: number | null
  financing_cash_flow: number | null
  capex: number | null
  free_cash_flow: number | null
  dividends_paid: number | null
  share_repurchases: number | null
}

export interface FARatios {
  date: string
  gross_margin: number | null
  operating_margin: number | null
  net_margin: number | null
  ebitda_margin: number | null
  roe: number | null
  roa: number | null
  roic: number | null
  current_ratio: number | null
  quick_ratio: number | null
  cash_ratio: number | null
  debt_to_equity: number | null
  debt_to_assets: number | null
  interest_coverage: number | null
  asset_turnover: number | null
  inventory_turnover: number | null
  receivables_turnover: number | null
  fcf_margin: number | null
  fcf_to_net_income: number | null
}

export interface FAValuation {
  market_cap: number | null
  enterprise_value: number | null
  pe_ratio: number | null
  forward_pe: number | null
  peg_ratio: number | null
  price_to_book: number | null
  price_to_sales: number | null
  ev_ebitda: number | null
  ev_revenue: number | null
  dividend_yield: number | null
  payout_ratio: number | null
  fcf_yield: number | null
}

export interface FAGrowth {
  revenue_yoy: number | null
  revenue_3y_cagr: number | null
  revenue_5y_cagr: number | null
  net_income_yoy: number | null
  eps_yoy: number | null
  fcf_yoy: number | null
  operating_income_yoy: number | null
}

export interface FAOverview {
  company_name: string | null
  sector: string | null
  industry: string | null
  employees: number | null
  description: string | null
  exchange: string | null
  shares_outstanding: number | null
  beta: number | null
  week52_high: number | null
  week52_low: number | null
  current_price: number | null
}

export interface FAResponse {
  ticker: string
  period: string
  currency: string
  as_of: string
  overview: FAOverview
  income_statement: FAPeriod[]
  balance_sheet: FAPeriod[]
  cash_flow: FAPeriod[]
  ratios: FARatios[]
  valuation: FAValuation
  growth: FAGrowth
  cached?: boolean
}

// ─── Extended Hours ──────────────────────────────────────────────────────────
export type MarketSession = 'PRE' | 'OPEN' | 'POST' | 'CLOSED'

export interface ExtendedHoursData {
  market_state: MarketSession
  pre_market_price: number | null
  pre_market_change: number | null
  pre_market_change_pct: number | null
  pre_market_time: number | null
  post_market_price: number | null
  post_market_change: number | null
  post_market_change_pct: number | null
  post_market_time: number | null
  regular_close: number | null
  regular_close_time: number | null
}
