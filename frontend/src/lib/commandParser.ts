import type { ParsedCommand, ScreenType } from '../types'

// ─── Known standalone commands (no ticker) ───────────────────────────────────
const STANDALONE_COMMANDS: Record<string, ScreenType> = {
  PORT:      'portfolio',
  PORTFOLIO: 'portfolio',
  WLT:       'watchlist',
  WATCHLIST: 'watchlist',
  ECON:      'econ',
  EARN:      'earnings',
  EARNINGS:  'earnings',
  SCR:       'screener',
  SCREENER:  'screener',
  FX:        'fx',
  CRYPTO:    'crypto',
  MACRO:     'macro',
  HOME:      'home',
}

// ─── Ticker-qualified suffixes ────────────────────────────────────────────────
const TICKER_SUFFIXES: Record<string, ScreenType> = {
  GP:       'chart',
  CHART:    'chart',
  OPT:      'options',
  OPTIONS:  'options',
  NEWS:     'news',
  FILINGS:  'filings',
  EQUITY:   'equity',
  DES:      'des',
}

/**
 * Validates that a string looks like a ticker symbol:
 * 1–5 uppercase letters, numbers, dots, or dashes.
 */
export function isValidTicker(s: string): boolean {
  return /^[A-Z0-9.\-]{1,5}$/.test(s)
}

/**
 * Parse a Bloomberg-style command string into a ParsedCommand.
 *
 * Rules (case-insensitive input, normalised to uppercase):
 *   "AAPL"          → equity / AAPL
 *   "AAPL EQUITY"   → equity / AAPL
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

  // 1. Single-token standalone commands
  if (parts.length === 1) {
    const standalone = STANDALONE_COMMANDS[parts[0]]
    if (standalone) {
      return { screen: standalone, raw }
    }
    // Single token with no known command → treat as ticker → equity
    return { screen: 'equity', ticker: parts[0], raw }
  }

  // 2. Two-token commands: <TICKER> <SUFFIX>  OR  standalone with garbage
  if (parts.length >= 2) {
    // Long-form Bloomberg commands: "NVDA US EQUITY DES" → last token is function
    if (parts.length > 2) {
      const lastToken = parts[parts.length - 1]
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

    // Unknown two-token command: treat first token as ticker → equity
    return { screen: 'equity', ticker: first, raw }
  }

  // Fallback (unreachable given the checks above, but satisfies TypeScript)
  return { screen: 'equity', ticker: upper, raw }
}
