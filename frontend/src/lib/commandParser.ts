import type { ParsedCommand, ScreenType } from '../types'

// ─── Bloomberg asset class qualifiers ────────────────────────────────────────

const ASSET_CLASSES = new Set(['EQUITY', 'CURNCY', 'COMDTY', 'INDEX', 'CORP', 'GOVT'])

/** Bloomberg exchange code → yfinance ticker suffix */
const EXCHANGE_SUFFIX: Record<string, string> = {
  LN: '.L',   // London
  GY: '.DE',  // Germany (XETRA)
  FP: '.PA',  // Paris
  JP: '.T',   // Tokyo
  HK: '.HK',  // Hong Kong
  AU: '.AX',  // ASX
  CN: '.TO',  // TSX
  SS: '.SS',  // Shanghai
  SZ: '.SZ',  // Shenzhen
  IT: '.MI',  // Milan
  SM: '.MC',  // Madrid
  NA: '.AS',  // Amsterdam
  SW: '.SW',  // Switzerland
  SE: '.ST',  // Stockholm
  US: '',     // US equities — no suffix needed
}

/** Bloomberg index mnemonics → yfinance tickers */
const INDEX_TICKER_MAP: Record<string, string> = {
  SPX:  '^GSPC',
  INDU: '^DJI',
  CCMP: '^IXIC',
  VIX:  '^VIX',
  RTY:  '^RUT',
  UKX:  '^FTSE',
  DAX:  '^GDAXI',
  CAC:  '^FCHI',
  NKY:  '^N225',
  HSI:  '^HSI',
}

/** Bloomberg commodity root tickers → yfinance continuous futures */
const COMDTY_TICKER_MAP: Record<string, string> = {
  HG: 'HG=F',  // Copper
  CL: 'CL=F',  // WTI Crude
  GC: 'GC=F',  // Gold
  SI: 'SI=F',  // Silver
  NG: 'NG=F',  // Natural Gas
  CO: 'BZ=F',  // Brent Crude
  W:  'ZW=F',  // Wheat
  S:  'ZS=F',  // Soybeans
  C:  'ZC=F',  // Corn
}

function resolveBloombergTicker(ticker: string, exchange: string | null, assetClass: string): string {
  switch (assetClass) {
    case 'CURNCY':
      return ticker.endsWith('=X') ? ticker : ticker + '=X'
    case 'COMDTY': {
      // Strip trailing contract number: HG1 → HG, CL1 → CL
      const root = ticker.replace(/\d+$/, '')
      return COMDTY_TICKER_MAP[root] ?? COMDTY_TICKER_MAP[ticker] ?? (root + '=F')
    }
    case 'INDEX':
      return INDEX_TICKER_MAP[ticker] ?? ('^' + ticker)
    default: // EQUITY, CORP, GOVT
      if (exchange != null && exchange in EXCHANGE_SUFFIX) {
        return ticker + EXCHANGE_SUFFIX[exchange]
      }
      return ticker
  }
}

// ─── Known standalone commands (no ticker) ───────────────────────────────────
const STANDALONE_COMMANDS: Record<string, ScreenType> = {
  PORT:      'portfolio',
  PORTFOLIO: 'portfolio',
  WLT:       'watchlist',
  WATCHLIST: 'watchlist',
  ECST:      'ecst',
  ECON:      'econ',
  EARN:      'earnings',
  EARNINGS:  'earnings',
  SCR:       'screener',
  SCREENER:  'screener',
  FX:        'fx',
  FXC:       'fxc',
  CRYPTO:    'crypto',
  MEME:      'meme',
  PROF:      'profile',
  PROFILE:   'profile',
  MACRO:     'macro',
  HOME:      'home',
  G:         'graph',
  WEI:       'wei',
  WINDEX:    'wei',
  HS:        'hs',
  BOND:      'bond',
  YLD:       'bond',
  COMD:      'comd',
  COMMODITY: 'comd',
  CONG:      'cong',
  CONGRESS:  'cong',
  QUANT:     'quant',
  ASK:       'ask',
  HELP:      'help',
  BACK:      'back',
  QUIT:      'quit',
  EXIT:      'quit',
  LOGOUT:    'logout',
  SIGNOUT:   'logout',
  BUG:       'bugreport',
  TRUMP:     'truth',
}

// ─── Ticker-qualified suffixes ────────────────────────────────────────────────
const TICKER_SUFFIXES: Record<string, ScreenType> = {
  GP:       'chart',
  CHART:    'chart',
  OPT:      'options',
  OPTIONS:  'options',
  N:        'news',
  NEWS:     'news',
  FILINGS:  'filings',
  EQUITY:   'equity',
  DES:      'des',
  FA:       'fa',
  GPO:      'gpo',
  GIP:      'gip',
  ETF:      'etf',
  BOND:     'bond',
  YLD:      'bond',
  COMD:     'comd',
  CONG:     'cong',
  QUANT:    'quant',
  HS:       'hs',
}

/**
 * Validates that a string looks like a ticker symbol:
 * 1–5 uppercase letters, numbers, dots, or dashes.
 */
export function isValidTicker(s: string): boolean {
  return /^[A-Z][A-Z0-9.-]{0,4}$/.test(s)
}

/**
 * Parse a Bloomberg-style command string into a ParsedCommand.
 *
 * Rules (case-insensitive input, normalised to uppercase):
 *   "AAPL"          → ticker-menu / AAPL  (select function)
 *   "AAPL EQUITY"   → ticker-menu / AAPL
 *   "AAPL GP"       → chart   / AAPL
 *   "AAPL OPT"      → options / AAPL
 *   "AAPL OPTIONS"  → options / AAPL
 *   "AAPL NEWS"     → news    / AAPL
 *   "AAPL FILINGS"  → filings / AAPL
 *   "PORT"          → portfolio
 *   "PORTFOLIO"     → portfolio
 *   "WLT"           → watchlist
 *   "WATCHLIST"     → watchlist
 *   "ECON"          → econ
 *   "EARN"          → earnings
 *   "EARNINGS"      → earnings
 *   "SCR"           → screener
 *   "SCREENER"      → screener
 *   "FX"            → fx
 *   "CRYPTO"        → crypto
 *   "MACRO"         → macro
 *   Unknown         → equity / <input>  (assume ticker)
 */
export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim()
  const upper = raw.toUpperCase()
  const parts = upper.split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return { screen: 'home', raw }
  }

  // Chat: CHAT, CHAT #slug, CHAT @username — preserve original case for the
  // target since usernames/slugs are case-insensitive server-side but we want
  // to display the username as the user entered it.
  if (parts[0] === 'CHAT') {
    const rawParts = raw.split(/\s+/).filter(Boolean)
    if (rawParts.length >= 2) {
      const target = rawParts[1]
      if (target.startsWith('#')) {
        return { screen: 'chat', sub: `room:${target.slice(1).toLowerCase()}`, raw }
      }
      if (target.startsWith('@')) {
        return { screen: 'chat', sub: `dm:${target.slice(1)}`, raw }
      }
      // Bare second token: treat as room slug
      return { screen: 'chat', sub: `room:${target.toLowerCase()}`, raw }
    }
    return { screen: 'chat', raw }
  }

  // Profile: PROF, PROF @username
  if (parts[0] === 'PROF' || parts[0] === 'PROFILE') {
    const rawParts = raw.split(/\s+/).filter(Boolean)
    if (rawParts.length >= 2) {
      const target = rawParts[1]
      const username = target.startsWith('@') ? target.slice(1) : target
      return { screen: 'profile', sub: username, raw }
    }
    return { screen: 'profile', raw }
  }

  // 0. G1–G9 graph slot shortcuts (before standalone check so G1 ≠ ticker)
  if (parts.length === 1 && /^G[1-9]$/.test(parts[0])) {
    return { screen: 'graph', ticker: parts[0].slice(1), raw }
  }

  // 1. Single-token standalone commands
  if (parts.length === 1) {
    const standalone = STANDALONE_COMMANDS[parts[0]]
    if (standalone) {
      return { screen: standalone, raw }
    }
    // Single token that is a known ticker suffix (e.g. "GP", "DES", "OPT")
    // → return screen with no ticker; App will fill in the last-used ticker
    const suffixScreen = TICKER_SUFFIXES[parts[0]]
    if (suffixScreen) {
      return { screen: suffixScreen, raw }
    }
    // Single token with no known command → treat as ticker → function menu
    return { screen: 'ticker-menu', ticker: parts[0], raw }
  }

  // 2. Multi-token: detect Bloomberg asset class qualifier
  //    e.g. "AAPL US Equity", "EURUSD Curncy", "HG1 Comdty GP", "VOD LN Equity DES"
  if (parts.length >= 2) {
    // Find rightmost asset class token
    let acIdx = -1
    for (let i = parts.length - 1; i >= 1; i--) {
      if (ASSET_CLASSES.has(parts[i])) { acIdx = i; break }
    }

    if (acIdx >= 1) {
      const assetClass = parts[acIdx]

      // Function suffix comes after the asset class token
      let screen: ScreenType = 'ticker-menu'
      const afterAC = parts.slice(acIdx + 1)
      if (afterAC.length > 0) {
        const fnScreen = TICKER_SUFFIXES[afterAC[0]]
        if (fnScreen) screen = fnScreen
      }

      // Ticker (and optional exchange code) come before the asset class token
      const beforeAC = parts.slice(0, acIdx)
      let ticker: string
      let exchange: string | null = null

      if (beforeAC.length >= 2) {
        // Last token before asset class may be an exchange code: "VOD LN Equity"
        const possibleExchange = beforeAC[beforeAC.length - 1]
        if (possibleExchange in EXCHANGE_SUFFIX) {
          exchange = possibleExchange
          ticker = beforeAC[beforeAC.length - 2]
        } else {
          ticker = beforeAC[beforeAC.length - 1]
        }
      } else {
        ticker = beforeAC[0]
      }

      const resolvedTicker = resolveBloombergTicker(ticker, exchange, assetClass)
      return { screen, ticker: resolvedTicker, raw }
    }

    // 3. Non-Bloomberg multi-token: <TICKER> <SUFFIX>  OR  standalone
    const lastToken = parts[parts.length - 1]
    if (parts.length > 2) {
      const longFormScreen = TICKER_SUFFIXES[lastToken]
      if (longFormScreen) {
        return { screen: longFormScreen, ticker: parts[0], raw }
      }
    }

    const [first, second] = parts

    // Check if second token is a known suffix
    const suffixScreen = TICKER_SUFFIXES[second]
    if (suffixScreen) {
      return { screen: suffixScreen, ticker: first, raw }
    }

    // Check if first token is a standalone command (extra tokens ignored)
    const standalone = STANDALONE_COMMANDS[first]
    if (standalone) {
      return { screen: standalone, raw }
    }

    // Unknown two-token command: treat first token as ticker → function menu
    return { screen: 'ticker-menu', ticker: first, raw }
  }

  // Fallback (unreachable given the checks above, but satisfies TypeScript)
  return { screen: 'equity', ticker: upper, raw }
}
