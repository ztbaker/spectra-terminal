import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { parseCommand } from '../../lib/commandParser'
import { useBreakpoint } from '../../lib/useBreakpoint'
import theme from '../../lib/theme'
import { fetchChart } from '../../lib/api'
import Sparkline from '../shared/Sparkline'
import DecodeText from '../shared/DecodeText'
import SpectraLogo from '../shared/SpectraLogo'
import type { ParsedCommand, ChartData } from '../../types'

const { color, font, type: t, radius, motion } = theme

// ─── Constants ────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'bb_cmd_history'
const HISTORY_MAX = 50

const KNOWN_COMMANDS = [
  'PORT', 'WLT', 'ECON', 'EARN', 'SCR', 'FX', 'CRYPTO', 'MACRO',
  'EQUITY', 'GP', 'OPT', 'OPTIONS', 'NEWS', 'FILINGS',
  'PORTFOLIO', 'WATCHLIST', 'EARNINGS', 'SCREENER',
  'HOME', 'HELP', 'QUIT', 'MEME', 'PROF', 'PROFILE',
]

const KNOWN_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  'SPY', 'QQQ', 'BTC-USD',
]

const ALL_SUGGESTIONS = [...KNOWN_COMMANDS, ...KNOWN_TICKERS]

// ─── Command descriptions for autocomplete ────────────────────────────────────

const COMMAND_DESCRIPTIONS: Record<string, string> = {
  PORT: 'Portfolio tracker',
  WLT: 'Watchlist',
  ECON: 'Economic data',
  EARN: 'Earnings calendar',
  SCR: 'Stock screener',
  FX: 'Foreign exchange',
  CRYPTO: 'Crypto dashboard',
  MACRO: 'Macro dashboard',
  EQUITY: 'Equity overview',
  GP: 'Chart with indicators',
  OPT: 'Options chain',
  OPTIONS: 'Options chain',
  NEWS: 'Market news',
  FILINGS: 'SEC filings',
  PORTFOLIO: 'Portfolio tracker',
  WATCHLIST: 'Watchlist',
  EARNINGS: 'Earnings calendar',
  SCREENER: 'Stock screener',
  HOME: 'Return to landing page',
  HELP: 'List all commands',
  QUIT: 'Exit terminal',
  MEME: 'Meme coin tracker',
  PROF: 'User profile',
  PROFILE: 'User profile',
}

// ─── Screen display labels for breadcrumb ─────────────────────────────────────

const SCREEN_LABELS: Record<string, string> = {
  equity: 'EQUITY', chart: 'CHART', options: 'OPTIONS', news: 'NEWS',
  filings: 'FILINGS', portfolio: 'PORTFOLIO', watchlist: 'WATCHLIST',
  econ: 'ECON', earnings: 'EARNINGS', screener: 'SCREENER',
  fx: 'FX', fxc: 'FXC', crypto: 'CRYPTO', macro: 'MACRO',
  home: 'HOME', des: 'DES', graph: 'GRAPH', gpo: 'GPO', gip: 'GIP',
  wei: 'WEI', hs: 'HS', ecst: 'ECST', etf: 'ETF', bond: 'BOND',
  comd: 'COMD', cong: 'CONG', quant: 'QUANT', ask: 'ASK', help: 'HELP',
  meme: 'MEME', profile: 'PROFILE',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveHistory(history: string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)))
  } catch {}
}

function getSuggestions(input: string): string[] {
  const upper = input.toUpperCase().trim()
  if (!upper) return []
  const parts = upper.split(/\s+/)
  const query = parts[parts.length - 1]
  if (!query) return []
  return ALL_SUGGESTIONS.filter(s => s.startsWith(query) && s !== query).slice(0, 5)
}

// ─── Inline sparkline for ticker suggestions ──────────────────────────────────

const TickerSparkline: React.FC<{ ticker: string; up: boolean | null }> = ({ ticker, up }) => {
  const { data } = useQuery<ChartData>({
    queryKey: ['chart', ticker, '5d', '15m'],
    queryFn: () => fetchChart(ticker, '5d', '15m'),
    staleTime: 5 * 60_000,
  })
  const closes = (data?.ohlcv ?? []).map(b => b.close)
  if (closes.length < 2) return null
  const sparkColor = up === true ? color.accentPositive : up === false ? color.accentNegative : color.textTertiary
  return <Sparkline data={closes} width={44} height={12} color={sparkColor} />
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onCommand: (cmd: ParsedCommand) => void
  onCommandNewPanel?: (cmd: ParsedCommand) => void
  activeCommand: ParsedCommand | null
  contextTicker: string
}

const CommandBarV3: React.FC<Props> = ({ onCommand, onCommandNewPanel, activeCommand, contextTicker }) => {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>(loadHistory)
  const [historyIdx, setHistoryIdx] = useState(-1)
  const liveInputRef = useRef('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionIdx, setSuggestionIdx] = useState(-1)
  const [, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const queryClient = useQueryClient()

  const bp = useBreakpoint()
  const isCompact = bp === 'compact'
  const isExpanded = bp === 'expanded'

  // ── Auto-focus the input on mount and keep it focused ────────────────────

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  // Global keydown: focus input on printable key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!inputRef.current) return
      if (document.activeElement === inputRef.current) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key.length === 1 || e.key === 'Backspace') {
        inputRef.current.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (historyIdx === -1) {
      liveInputRef.current = input
    }
  }, [input, historyIdx])

  // Prefetch charts for ticker suggestions
  useEffect(() => {
    for (const s of suggestions) {
      if (KNOWN_TICKERS.includes(s)) {
        queryClient.prefetchQuery({
          queryKey: ['chart', s, '5d', '15m'],
          queryFn: () => fetchChart(s, '5d', '15m'),
          staleTime: 5 * 60_000,
        })
      }
    }
  }, [suggestions, queryClient])

  // ── Measure text width for cursor positioning ────────────────────────────

  const getTextWidth = useCallback((text: string) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return text.length * 8
    const fontSize = isCompact ? '12px' : isExpanded ? '14px' : '13px'
    ctx.font = `500 ${fontSize} ${font.mono}`
    return ctx.measureText(text).width
  }, [isCompact, isExpanded])

  // ── Command handling ─────────────────────────────────────────────────────

  const commitCommand = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return
      const cmd = parseCommand(trimmed)
      onCommand(cmd)
      setHistory(prev => {
        const deduped = prev.filter(h => h !== trimmed)
        const next = [trimmed, ...deduped].slice(0, HISTORY_MAX)
        saveHistory(next)
        return next
      })
      setInput('')
      setHistoryIdx(-1)
      setSuggestions([])
      setSuggestionIdx(-1)
      liveInputRef.current = ''
      // Don't steal focus from chat composer when navigating to chat
      if (cmd.screen !== 'chat') {
        focusInput()
      }
    },
    [onCommand, focusInput],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Enter': {
          e.preventDefault()
          if (e.shiftKey && onCommandNewPanel) {
            if (suggestionIdx >= 0 && suggestions[suggestionIdx]) {
              const accepted = suggestions[suggestionIdx]
              const parts = input.toUpperCase().split(/\s+/)
              parts[parts.length - 1] = accepted
              const next = parts.join(' ')
              onCommandNewPanel(parseCommand(next))
              setHistory(prev => {
                const deduped = prev.filter(h => h !== next)
                const nextHist = [next, ...deduped].slice(0, HISTORY_MAX)
                saveHistory(nextHist)
                return nextHist
              })
              setInput('')
              setHistoryIdx(-1)
              setSuggestions([])
              setSuggestionIdx(-1)
              liveInputRef.current = ''
              focusInput()
            } else {
              onCommandNewPanel(parseCommand(input))
              const trimmed = input.trim()
              if (trimmed) {
                setHistory(prev => {
                  const deduped = prev.filter(h => h !== trimmed)
                  const next = [trimmed, ...deduped].slice(0, HISTORY_MAX)
                  saveHistory(next)
                  return next
                })
              }
              setInput('')
              setHistoryIdx(-1)
              setSuggestions([])
              setSuggestionIdx(-1)
              liveInputRef.current = ''
              focusInput()
            }
            break
          }
          if (suggestionIdx >= 0 && suggestions[suggestionIdx]) {
            const accepted = suggestions[suggestionIdx]
            const parts = input.toUpperCase().split(/\s+/)
            parts[parts.length - 1] = accepted
            const next = parts.join(' ')
            setInput(next)
            setSuggestions([])
            setSuggestionIdx(-1)
          } else {
            commitCommand(input)
          }
          break
        }
        case 'Escape': {
          e.preventDefault()
          setInput('')
          setHistoryIdx(-1)
          setSuggestions([])
          setSuggestionIdx(-1)
          liveInputRef.current = ''
          focusInput()
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          if (suggestions.length > 0) {
            setSuggestionIdx(prev => prev <= 0 ? suggestions.length - 1 : prev - 1)
          } else {
            if (history.length === 0) break
            const nextIdx = historyIdx + 1
            if (nextIdx < history.length) {
              setHistoryIdx(nextIdx)
              setInput(history[nextIdx])
            }
          }
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          if (suggestions.length > 0) {
            setSuggestionIdx(prev => prev >= suggestions.length - 1 ? 0 : prev + 1)
          } else {
            if (historyIdx <= 0) {
              setHistoryIdx(-1)
              setInput(liveInputRef.current)
            } else {
              const nextIdx = historyIdx - 1
              setHistoryIdx(nextIdx)
              setInput(history[nextIdx])
            }
          }
          break
        }
        case 'Tab': {
          e.preventDefault()
          const suggs = getSuggestions(input)
          if (suggs.length === 1) {
            const parts = input.toUpperCase().split(/\s+/)
            parts[parts.length - 1] = suggs[0]
            const next = parts.join(' ')
            setInput(next)
            setSuggestions([])
            setSuggestionIdx(-1)
          } else if (suggs.length > 1) {
            setSuggestions(suggs)
            setSuggestionIdx(0)
          }
          break
        }
        default:
          break
      }
    },
    [commitCommand, history, historyIdx, input, suggestions, suggestionIdx, onCommandNewPanel, focusInput],
  )

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInput(val)
    setHistoryIdx(-1)
    setSuggestions(getSuggestions(val))
    setSuggestionIdx(-1)
  }, [])

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      const parts = input.toUpperCase().split(/\s+/)
      parts[parts.length - 1] = suggestion
      const next = parts.join(' ')
      setInput(next)
      setSuggestions([])
      setSuggestionIdx(-1)
      inputRef.current?.focus()
    },
    [input],
  )

  // ── Cursor position ──────────────────────────────────────────────────────

  const textWidth = getTextWidth(input.toUpperCase())

  // Breadcrumb
  const breadcrumbParts: string[] = []
  if (activeCommand?.ticker) breadcrumbParts.push(activeCommand.ticker)
  if (activeCommand?.screen) breadcrumbParts.push(SCREEN_LABELS[activeCommand.screen] ?? activeCommand.screen.toUpperCase())
  if (activeCommand?.sub) breadcrumbParts.push(activeCommand.sub.toUpperCase())

  const activeLabel = activeCommand
    ? activeCommand.ticker
      ? `[ ${activeCommand.ticker} ${activeCommand.screen.toUpperCase()} ]`
      : `[ ${activeCommand.screen.toUpperCase()} ]`
    : ''

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '48px',
        fontFamily: font.sans,
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        paddingRight: '16px',
        zIndex: 1000,
        userSelect: 'none',
        background: 'rgba(19, 22, 25, 0.75)',
        backdropFilter: 'blur(40px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.3)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 -1px 0 rgba(255, 255, 255, 0.04)',
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Left: Logo mark */}
      <div
        style={{
          paddingLeft: isCompact ? '10px' : '14px',
          paddingRight: isCompact ? '10px' : '14px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          borderRight: `1px solid ${color.borderSubtle}`,
          flexShrink: 0,
        }}
      >
        <SpectraLogo size={isCompact ? 26 : 30} />
      </div>

      {/* Context ticker ghost prefix */}
      {contextTicker && !input && (
        <span style={{
          color: color.textTertiary,
          fontSize: isCompact ? '12px' : '13px',
          fontFamily: font.mono,
          marginRight: '2px',
          pointerEvents: 'none',
          userSelect: 'none',
          paddingLeft: '12px',
        }}>
          {contextTicker}
        </span>
      )}

      {/* Input area */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '12px' }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flex: 1 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            placeholder="Enter command..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: color.textPrimary,
              fontFamily: font.mono,
              fontSize: isCompact ? '12px' : isExpanded ? '14px' : '13px',
              fontWeight: 500,
              width: '100%',
              caretColor: 'transparent',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              padding: 0,
            }}
            aria-label="Command input"
          />
          {/* Blinking cursor */}
          <span
            className="bb-cursor"
            style={{
              position: 'absolute',
              left: `${textWidth}px`,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-block',
              width: '2px',
              height: isCompact ? '14px' : '16px',
              background: color.accentPositive,
              borderRadius: '1px',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Autocomplete dropdown */}
        {suggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '8px',
              background: 'rgba(26, 30, 35, 0.85)',
              backdropFilter: 'blur(40px) saturate(1.3)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.3)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
              borderRadius: radius.md,
              zIndex: 2000,
              minWidth: isCompact ? 'unset' : '300px',
              width: isCompact ? 'calc(100vw - 20px)' : 'auto',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 217, 100, 0.03)',
              overflow: 'hidden',
            }}
          >
            <div style={{
              ...t.caption,
              color: color.textTertiary,
              padding: '8px 12px 6px',
              borderBottom: `1px solid ${color.borderSubtle}`,
            }}>
              Suggestions
            </div>
            {suggestions.map((s, i) => {
              const isCommand = KNOWN_COMMANDS.includes(s)
              const isTicker = KNOWN_TICKERS.includes(s)
              const desc = isCommand ? COMMAND_DESCRIPTIONS[s] : undefined
              const isSelected = i === suggestionIdx
              return (
                <div
                  key={s}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSuggestionClick(s)
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    background: isSelected ? color.bgHover : 'transparent',
                    borderLeft: isSelected ? `2px solid ${color.accentPositive}` : '2px solid transparent',
                    transition: `background ${motion.fast} ${motion.ease}`,
                  }}
                >
                  <span style={{
                    color: isSelected ? color.textPrimary : color.textSecondary,
                    fontSize: '12px',
                    letterSpacing: '0.02em',
                    fontFamily: font.mono,
                    fontWeight: isSelected ? 600 : 400,
                  }}>
                    {s}
                  </span>
                  {isTicker ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <TickerSparkline ticker={s} up={null} />
                      <span style={{
                        background: color.bgActive,
                        borderRadius: '3px',
                        padding: '1px 5px',
                        color: color.textTertiary,
                        fontSize: '9px',
                        fontFamily: font.mono,
                      }}>
                        ↵
                      </span>
                    </span>
                  ) : desc ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        color: color.textTertiary,
                        fontSize: '11px',
                        fontFamily: font.sans,
                      }}>
                        {desc}
                      </span>
                      <span style={{
                        background: color.bgActive,
                        borderRadius: '3px',
                        padding: '1px 5px',
                        color: color.textTertiary,
                        fontSize: '9px',
                        fontFamily: font.mono,
                      }}>
                        ↵
                      </span>
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right: breadcrumb + active screen badge */}
      {activeLabel && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginLeft: '16px',
          flexShrink: 0,
        }}>
          {breadcrumbParts.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0',
              fontSize: '11px',
              fontFamily: font.mono,
              maxWidth: isCompact ? '120px' : isExpanded ? 'none' : '200px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {breadcrumbParts.map((part, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {i > 0 && (
                    <span style={{ color: color.textTertiary, margin: '0 4px', fontSize: '10px' }}>/</span>
                  )}
                  <span style={{
                    color: i === breadcrumbParts.length - 1 ? color.textPrimary : color.textTertiary,
                    fontWeight: i === breadcrumbParts.length - 1 ? 600 : 400,
                  }}>
                    {part}
                  </span>
                </span>
              ))}
            </div>
          )}

          <div style={{
            background: color.bgSurface,
            color: color.textSecondary,
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            padding: '4px 10px',
            borderRadius: radius.full,
            fontFamily: font.mono,
            whiteSpace: 'nowrap',
            border: `1px solid ${color.borderSubtle}`,
          }}>
            <DecodeText text={activeLabel} />
          </div>
        </div>
      )}
    </div>
  )
}

export default CommandBarV3
