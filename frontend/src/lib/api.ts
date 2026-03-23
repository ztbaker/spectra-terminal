import axios from 'axios'
import type {
  EquityData, ChartData, OptionsData, NewsResponse, IndexQuote,
  EconSeries, MacroDashboard, PortfolioRow, PortfolioPerformance,
  WatchlistRow, WatchlistQuote, EarningsCalendar, ScreenerResponse,
  FXResponse, CryptoResponse, FilingsResponse, FinancialsData,
} from '../types'

const api = axios.create({ baseURL: '/api' })

// ─── Equity ──────────────────────────────────────────────────────────────────
export const fetchEquity = (ticker: string): Promise<EquityData> =>
  api.get(`/equity/${ticker}`).then(r => r.data)

// ─── Chart ───────────────────────────────────────────────────────────────────
export const fetchChart = (ticker: string, period = '1y', interval = '1d'): Promise<ChartData> =>
  api.get(`/chart/${ticker}`, { params: { period, interval } }).then(r => r.data)

// ─── Options ─────────────────────────────────────────────────────────────────
export const fetchOptions = (ticker: string): Promise<OptionsData> =>
  api.get(`/options/${ticker}`).then(r => r.data)

// ─── News ─────────────────────────────────────────────────────────────────────
export const fetchNews = (ticker = 'MARKET', limit = 50): Promise<NewsResponse> =>
  api.get('/news', { params: { ticker, limit } }).then(r => r.data)

// ─── Indices ─────────────────────────────────────────────────────────────────
export const fetchIndices = (): Promise<IndexQuote[]> =>
  api.get('/indices').then(r => r.data)

// ─── Econ ─────────────────────────────────────────────────────────────────────
export const fetchEcon = (seriesId: string, start = '2010-01-01'): Promise<EconSeries> =>
  api.get(`/econ/${seriesId}`, { params: { start } }).then(r => r.data)

export const fetchMacroDashboard = (): Promise<MacroDashboard> =>
  api.get('/macro/dashboard').then(r => r.data)

// ─── Portfolio ────────────────────────────────────────────────────────────────
export const fetchPortfolio = (): Promise<PortfolioRow[]> =>
  api.get('/portfolio').then(r => r.data)

export const fetchPortfolioPerformance = (): Promise<PortfolioPerformance> =>
  api.get('/portfolio/performance').then(r => r.data)

export const addPosition = (ticker: string, shares: number, avg_cost: number): Promise<PortfolioRow> =>
  api.post('/portfolio', { ticker, shares, avg_cost }).then(r => r.data)

export const deletePosition = (id: number): Promise<void> =>
  api.delete(`/portfolio/${id}`).then(r => r.data)

// ─── Watchlist ────────────────────────────────────────────────────────────────
export const fetchWatchlist = (): Promise<WatchlistRow[]> =>
  api.get('/watchlist').then(r => r.data)

export const fetchWatchlistQuotes = (): Promise<WatchlistQuote[]> =>
  api.get('/watchlist/quotes').then(r => r.data)

export const addToWatchlist = (ticker: string, notes?: string): Promise<WatchlistRow> =>
  api.post('/watchlist', { ticker, notes }).then(r => r.data)

export const removeFromWatchlist = (ticker: string): Promise<void> =>
  api.delete(`/watchlist/${ticker}`).then(r => r.data)

// ─── Earnings ────────────────────────────────────────────────────────────────
export const fetchEarnings = (lookahead_days = 14): Promise<EarningsCalendar> =>
  api.get('/earnings/calendar', { params: { lookahead_days } }).then(r => r.data)

// ─── Screener ────────────────────────────────────────────────────────────────
export const fetchScreener = (params: Record<string, string | number | undefined>): Promise<ScreenerResponse> =>
  api.get('/screener', { params }).then(r => r.data)

// ─── FX ──────────────────────────────────────────────────────────────────────
export const fetchFX = (): Promise<FXResponse> =>
  api.get('/fx').then(r => r.data)

// ─── Crypto ──────────────────────────────────────────────────────────────────
export const fetchCrypto = (): Promise<CryptoResponse> =>
  api.get('/crypto').then(r => r.data)

// ─── Filings ─────────────────────────────────────────────────────────────────
export const fetchFilings = (ticker: string, type = '10-K', limit = 10): Promise<FilingsResponse> =>
  api.get(`/filings/${ticker}`, { params: { type, limit } }).then(r => r.data)

// ─── Financials ──────────────────────────────────────────────────────────────
export async function fetchFinancials(ticker: string): Promise<FinancialsData> {
  const { data } = await api.get<FinancialsData>(`/equity/${ticker}/financials`)
  return data
}
