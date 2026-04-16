import axios from 'axios'
import type {
  EquityData, ChartData, OptionsData, NewsResponse, IndexQuote,
  EconSeries, MacroDashboard, PortfolioRow, PortfolioPerformance,
  WatchlistRow, WatchlistQuote, EarningsCalendar, ScreenerResponse,
  FXResponse, CryptoResponse, FilingsResponse, FinancialsData,
  WorldIndicesResponse, IndexMembersResponse, SpreadData,
  ECSTResponse, FXRatesResponse, FAResponse, ReaderArticle,
  ChatRoom, ChatMessage, ChatDMThread, ChatUserRow, ChatNotification,
} from '../types'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''

export const AUTH_TOKEN_KEY = 'spectra_auth_token'
export const AUTH_USER_KEY = 'spectra_auth_user'
export const AUTH_INVALIDATED_EVENT = 'spectra-auth-invalidated'

const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  config.headers = config.headers ?? {}
  if (API_KEY) {
    config.headers['X-Spectra-Key'] = API_KEY
  }
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status
    const url: string = err?.config?.url ?? ''
    // Ignore 401s from the auth endpoints themselves (they're informational,
    // not "session expired"). Only invalidate when an authenticated request
    // is rejected.
    if (status === 401 && !url.startsWith('/auth/')) {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      localStorage.removeItem(AUTH_USER_KEY)
      window.dispatchEvent(new Event(AUTH_INVALIDATED_EVENT))
    }
    return Promise.reject(err)
  },
)

// ─── Auth ────────────────────────────────────────────────────────────────────
export interface AuthResponse {
  token: string
  user_id: number
  username: string
  email_verified: boolean
}

export interface UserInfo {
  user_id: number
  username: string
  email?: string | null
  email_verified?: boolean
}

export const authSignup = (username: string, email: string, password: string): Promise<AuthResponse> =>
  api.post('/auth/signup', { username, email, password }).then(r => r.data)

export const authLogin = (username: string, password: string): Promise<AuthResponse> =>
  api.post('/auth/login', { username, password }).then(r => r.data)

export const authLogout = (): Promise<void> =>
  api.post('/auth/logout').then(r => r.data)

export const authMe = (): Promise<UserInfo> =>
  api.get('/auth/me').then(r => r.data)

export const authForgotPassword = (email: string): Promise<void> =>
  api.post('/auth/forgot-password', { email }).then(r => r.data)

export const authResendVerification = (): Promise<void> =>
  api.post('/auth/resend-verification').then(r => r.data)

// ─── Equity ──────────────────────────────────────────────────────────────────
export const fetchEquity = (ticker: string): Promise<EquityData> =>
  api.get(`/equity/${ticker}`).then(r => r.data)

export const fetchEquityLive = (ticker: string): Promise<import('../types').ExtendedHoursData & { ticker: string; price: number | null; change: number | null; change_pct: number | null; bid: number | null; ask: number | null; volume: number | null; day_high: number | null; day_low: number | null; as_of: number }> =>
  api.get(`/equity/${ticker}/live`).then(r => r.data)

// ─── Chart ───────────────────────────────────────────────────────────────────
export const fetchChart = (ticker: string, period = '1y', interval = '1d'): Promise<ChartData> =>
  api.get(`/chart/${ticker}`, { params: { period, interval } }).then(r => r.data)

export const fetchChartHistory = (
  ticker: string,
  start: string,
  end: string,
  interval = '1d',
): Promise<ChartData> =>
  api.get(`/chart/${ticker}`, { params: { start, end, interval } }).then(r => r.data)

// ─── Options ─────────────────────────────────────────────────────────────────
export const fetchOptions = (ticker: string): Promise<OptionsData> =>
  api.get(`/options/${ticker}`).then(r => r.data)

export const fetchOptionsSurface = (ticker: string) =>
  api.get(`/options/${ticker}/surface`).then(r => r.data)

export const fetchOptionsTermStructure = (ticker: string) =>
  api.get(`/options/${ticker}/term-structure`).then(r => r.data)

export const fetchOptionsUnusual = (ticker: string) =>
  api.get(`/options/${ticker}/unusual`).then(r => r.data)

// ─── News ─────────────────────────────────────────────────────────────────────
export const fetchNews = (ticker = 'MARKET', limit = 50): Promise<NewsResponse> =>
  api.get('/news', { params: { ticker, limit } }).then(r => r.data)

// ─── Indices ─────────────────────────────────────────────────────────────────
export const fetchIndices = (): Promise<IndexQuote[]> =>
  api.get('/indices').then(r => r.data)

export const fetchWorldIndices = (): Promise<WorldIndicesResponse> =>
  api.get('/indices/world').then(r => r.data)

export const fetchIndexMembers = (ticker: string): Promise<IndexMembersResponse> =>
  api.get('/indices/world/members', { params: { ticker } }).then(r => r.data)

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

export const fetchScreenerDSL = (query: string): Promise<ScreenerResponse> =>
  api.get('/screener/dsl', { params: { q: query } }).then(r => r.data)

// ─── FX ──────────────────────────────────────────────────────────────────────
export const fetchFX = (): Promise<FXResponse> =>
  api.get('/fx').then(r => r.data)

// ─── Crypto ──────────────────────────────────────────────────────────────────
export const fetchCrypto = (): Promise<CryptoResponse> =>
  api.get('/crypto').then(r => r.data)

// ─── Filings ─────────────────────────────────────────────────────────────────
export const fetchFilings = (ticker: string, type = '10-K', limit = 10): Promise<FilingsResponse> =>
  api.get(`/filings/${ticker}`, { params: { type, limit } }).then(r => r.data)

// ─── Historical Spread ────────────────────────────────────────────────────────
export const fetchSpread = (ticker1: string, ticker2: string, period = '2y'): Promise<SpreadData> =>
  api.get('/chart/spread', { params: { ticker1, ticker2, period } }).then(r => r.data)

// ─── Financials ──────────────────────────────────────────────────────────────
export async function fetchFinancials(ticker: string): Promise<FinancialsData> {
  const { data } = await api.get<FinancialsData>(`/equity/${ticker}/financials`)
  return data
}

// ─── ECST ─────────────────────────────────────────────────────────────────────
export const fetchECST = (): Promise<ECSTResponse> =>
  api.get('/ecst').then(r => r.data)

// ─── FX Rates (matrix) ────────────────────────────────────────────────────────
export const fetchFXRates = (): Promise<FXRatesResponse> =>
  api.get('/fx/rates').then(r => r.data)

// ─── News (extended) ──────────────────────────────────────────────────────────
export const fetchNewsCompany = (symbol: string, limit = 50): Promise<NewsResponse> =>
  api.get('/news/company', { params: { symbol, limit } }).then(r => r.data)

export const fetchNewsWorld = (topic = 'general', limit = 50): Promise<NewsResponse> =>
  api.get('/news/world', { params: { topic, limit } }).then(r => r.data)

export const fetchReaderArticle = (url: string): Promise<ReaderArticle> =>
  api.get('/news/reader', { params: { url } }).then(r => r.data)

// ─── Commodity ────────────────────────────────────────────────────────────────
export const fetchCommoditySpots = (): Promise<any[]> =>
  api.get('/commodity/spot').then(r => r.data)

export const fetchCommodityEnergyOutlook = (): Promise<any> =>
  api.get('/commodity/energy/outlook').then(r => r.data)

export const fetchCommodityEnergyStocks = (): Promise<any> =>
  api.get('/commodity/energy/stocks').then(r => r.data)

export const fetchCommodityAgPSD = (commodityCode = '0440000'): Promise<any> =>
  api.get('/commodity/ag/psd', { params: { commodity_code: commodityCode } }).then(r => r.data)

// ─── Analytics ─────────────────────────────────────────────────────────────────
export const fetchAnalyticsSummary = (ticker: string, period = '2y'): Promise<any> =>
  api.get('/analytics/summary', { params: { ticker, period } }).then(r => r.data)

export const fetchAnalyticsRegression = (yTicker: string, xTicker?: string, marketTicker = '^GSPC'): Promise<any> =>
  api.get('/analytics/regression', { params: { y_ticker: yTicker, x_ticker: xTicker, market_ticker: marketTicker } }).then(r => r.data)

export const fetchAnalyticsCointegration = (ticker1: string, ticker2: string): Promise<any> =>
  api.get('/analytics/cointegration', { params: { ticker1, ticker2 } }).then(r => r.data)

export const fetchAnalyticsFamaFrench = (ticker: string): Promise<any> =>
  api.get('/analytics/fama-french', { params: { ticker } }).then(r => r.data)

// ─── Congress ──────────────────────────────────────────────────────────────────
export const fetchCongressBills = (limit = 30): Promise<any> =>
  api.get('/congress/bills', { params: { limit } }).then(r => r.data)

export const fetchCongressBill = (billId: string): Promise<any> =>
  api.get(`/congress/bill/${billId}`).then(r => r.data)

// ─── Econ Search ──────────────────────────────────────────────────────────────
export const fetchEconSearch = (q: string, limit = 20): Promise<any> =>
  api.get('/econ/search', { params: { q, limit } }).then(r => r.data)

// ─── 13F & Litigation ────────────────────────────────────────────────────────
export const fetch13F = (cik: string): Promise<any> =>
  api.get(`/filings/13f/${cik}`).then(r => r.data)

export const fetchInstitutionSearch = (q: string): Promise<any> =>
  api.get('/filings/institutions/search', { params: { q } }).then(r => r.data)

export const fetchLitigation = (): Promise<any> =>
  api.get('/filings/litigation').then(r => r.data)

// ─── FA (Fundamental Analysis) ──────────────────────────────────────────────
export const fetchFA = (ticker: string, period: 'annual' | 'quarterly' = 'annual'): Promise<FAResponse> =>
  api.get(`/fa/${ticker}`, { params: { period } }).then(r => r.data)

// ─── Chat ────────────────────────────────────────────────────────────────────
export const chatListRooms = (): Promise<ChatRoom[]> =>
  api.get('/chat/rooms').then(r => r.data)

export const chatCreateRoom = (
  slug: string,
  name: string,
  description?: string,
): Promise<ChatRoom> =>
  api.post('/chat/rooms', { slug, name, description }).then(r => r.data)

export const chatJoinRoom = (slug: string): Promise<void> =>
  api.post(`/chat/rooms/${encodeURIComponent(slug)}/join`).then(r => r.data)

export const chatLeaveRoom = (slug: string): Promise<void> =>
  api.post(`/chat/rooms/${encodeURIComponent(slug)}/leave`).then(r => r.data)

export const chatRoomMessages = (slug: string, after = 0): Promise<ChatMessage[]> =>
  api.get(`/chat/rooms/${encodeURIComponent(slug)}/messages`, {
    params: { after },
  }).then(r => r.data)

export const chatSendRoomMessage = (slug: string, body: string): Promise<ChatMessage> =>
  api.post(`/chat/rooms/${encodeURIComponent(slug)}/messages`, { body }).then(r => r.data)

export const chatListDMs = (): Promise<ChatDMThread[]> =>
  api.get('/chat/dms').then(r => r.data)

export const chatDMMessages = (username: string, after = 0): Promise<ChatMessage[]> =>
  api.get(`/chat/dms/${encodeURIComponent(username)}/messages`, {
    params: { after },
  }).then(r => r.data)

export const chatSendDM = (username: string, body: string): Promise<ChatMessage> =>
  api.post(`/chat/dms/${encodeURIComponent(username)}/messages`, { body }).then(r => r.data)

export const chatSearchUsers = (q: string): Promise<ChatUserRow[]> =>
  api.get('/chat/users', { params: { q } }).then(r => r.data)

export const chatNotifications = (sinceId: number): Promise<ChatNotification[]> =>
  api.get('/chat/notifications', { params: { since_id: sinceId } }).then(r => r.data)
