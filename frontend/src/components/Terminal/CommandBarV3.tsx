import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { parseCommand } from '../../lib/commandParser'
import { useBreakpoint } from '../../lib/useBreakpoint'
import C from '../../lib/colors'
import { fetchChart } from '../../lib/api'
import Sparkline from '../shared/Sparkline'
import DecodeText from '../shared/DecodeText'
import type { ParsedCommand, ChartData } from '../../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'bb_cmd_history'
const HISTORY_MAX = 50

const KNOWN_COMMANDS = [
  'PORT', 'WLT', 'ECON', 'EARN', 'SCR', 'FX', 'CRYPTO', 'MACRO',
  'EQUITY', 'GP', 'OPT', 'OPTIONS', 'NEWS', 'FILINGS',
  'PORTFOLIO', 'WATCHLIST', 'EARNINGS', 'SCREENER',
  'HOME', 'HELP', 'QUIT',
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
  const color = up === true ? C.green : up === false ? C.red : C.amberDim
  return <Sparkline data={closes} width={44} height={12} color={color} />
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
  const [borderPulse, setBorderPulse] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const prevSuggestionIdxRef = useRef(-1)
  const queryClient = useQueryClient()

  const bp = useBreakpoint()
  const isCompact = bp === 'compact'
  const isExpanded = bp === 'expanded'

  // ── Auto-focus the input on mount and keep it focused ────────────────────

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Re-focus after any command is committed (input will have been cleared)
  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  // Global keydown: if user starts typing (printable key) while input is not
  // focused, focus the input and let the key through.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!inputRef.current) return
      if (document.activeElement === inputRef.current) return
      // Don't hijack if focus is in another input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Only intercept printable keys (and Backspace to clear)
      if (e.key.length === 1 || e.key === 'Backspace') {
        inputRef.current.focus()
        // The key will naturally flow into the now-focused input
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

  useEffect(() => {
    if (suggestionIdx !== prevSuggestionIdxRef.current && suggestionIdx >= 0) {
      setBorderPulse(true)
      const t = setTimeout(() => setBorderPulse(false), 200)
      return () => clearTimeout(t)
    }
    prevSuggestionIdxRef.current = suggestionIdx
  }, [suggestionIdx])

  // Prefetch 5d/15m chart for any ticker suggestion so the inline sparkline
  // is ready by the time the row renders.
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
    ctx.font = `${fontSize} ${C.fontMono}`
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
      focusInput()
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
      ? `${activeCommand.ticker} ${activeCommand.screen.toUpperCase()}`
      : activeCommand.screen.toUpperCase()
    : ''

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '48px',
        fontFamily: C.fontMono,
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '0',
        paddingRight: '14px',
        zIndex: 1000,
        userSelect: 'none',
        borderBottom: '1px solid transparent',
        backgroundImage: `linear-gradient(${C.surface0}, ${C.surface0}), linear-gradient(90deg, ${C.amber}60, ${C.violet}20, transparent 40%, transparent 60%, ${C.cyan}20, ${C.amber}60)`,
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
        boxShadow: C.shadow2,
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Left: SPECTRA wordmark */}
      <div
        style={{
          fontFamily: C.fontDisplay,
          fontWeight: 700,
          fontSize: '15px',
          background: C.gradientHero,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '0.15em',
          paddingLeft: isCompact ? '10px' : '18px',
          paddingRight: isCompact ? '10px' : '18px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          borderRight: `1px solid ${C.glassBorder}`,
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {isCompact ? 'S>' : 'SPECTRA'}
        {isExpanded && (
          <span style={{
            fontFamily: C.fontBody,
            fontSize: '9px',
            fontWeight: 400,
            letterSpacing: '0.06em',
            marginLeft: '6px',
            WebkitTextFillColor: C.whiteGhost,
            textTransform: 'uppercase',
          }}>
            Terminal
          </span>
        )}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: C.amberGlow,
          filter: 'blur(16px)',
          opacity: 0.3,
          pointerEvents: 'none',
        }} />
      </div>

      {/* Context ticker ghost prefix */}
      {contextTicker && !input && (
        <span style={{
          color: C.whiteGhost,
          fontSize: isCompact ? '12px' : '13px',
          fontFamily: C.fontMono,
          letterSpacing: '0.02em',
          marginRight: '2px',
          pointerEvents: 'none',
          userSelect: 'none',
          paddingLeft: '12px',
        }}>
          {contextTicker}&ensp;·
        </span>
      )}

      {/* Input area */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
        {/* Prompt symbol */}
        <span style={{
          color: C.amber,
          fontFamily: C.fontMono,
          fontSize: '14px',
          fontWeight: 700,
          marginRight: '6px',
          textShadow: `0 0 8px ${C.amberGlow}`,
        }}>
          ›
        </span>

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
              color: C.white,
              fontFamily: C.fontMono,
              fontSize: isCompact ? '12px' : isExpanded ? '14px' : '13px',
              width: '100%',
              caretColor: 'transparent',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
              padding: 0,
              transition: 'all 0.2s ease',
            }}
            aria-label="Command input"
          />
          {/* Blinking block cursor — positioned right after the text */}
          <span
            className="bb-cursor"
            style={{
              position: 'absolute',
              left: `${textWidth}px`,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-block',
              width: input.length === 0 ? '8px' : '8px',
              height: isCompact ? '12px' : '14px',
              background: C.amber,
              borderRadius: '1px',
              boxShadow: `0 0 8px ${C.amberGlow}`,
              pointerEvents: 'none',
              transition: 'left 0.05s steps(1)',
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
              background: 'rgba(8, 8, 26, 0.92)',
              backdropFilter: 'blur(20px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
              border: `1px solid ${C.glassBorder}`,
              borderRadius: '8px',
              zIndex: 2000,
              minWidth: isCompact ? 'unset' : '320px',
              width: isCompact ? 'calc(100vw - 20px)' : 'auto',
              boxShadow: `${C.shadow3}, 0 0 30px ${C.amberGlow}`,
              overflow: 'hidden',
            }}
          >
            <div style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              color: C.whiteGhost,
              padding: '8px 12px 4px',
              textTransform: 'uppercase' as const,
              fontFamily: C.fontBody,
              fontWeight: 600,
              borderBottom: `1px solid ${C.glassBorder}`,
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
                    background: isSelected ? `linear-gradient(90deg, ${C.amberGlow}, transparent 70%)` : 'transparent',
                    borderLeft: isSelected ? `2px solid ${C.amber}` : '2px solid transparent',
                    boxShadow: isSelected && borderPulse ? `0 0 8px ${C.amberGlow}` : 'none',
                    transition: 'all 150ms ease',
                  }}
                >
                  <span style={{
                    color: isSelected ? C.amberBright : C.amber,
                    fontSize: '12px',
                    letterSpacing: '0.04em',
                    fontFamily: C.fontMono,
                    fontWeight: isSelected ? 700 : 400,
                  }}>
                    {s}
                  </span>
                  {isTicker ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <TickerSparkline ticker={s} up={null} />
                      <span style={{
                        background: C.surface2,
                        borderRadius: '3px',
                        padding: '1px 5px',
                        color: C.whiteGhost,
                        fontSize: '9px',
                        fontFamily: C.fontMono,
                        letterSpacing: '0.02em',
                      }}>
                        ↵
                      </span>
                    </span>
                  ) : desc ? (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <span style={{
                        color: C.whiteDim,
                        fontSize: '10px',
                        fontFamily: C.fontBody,
                      }}>
                        {desc}
                      </span>
                      <span style={{
                        background: C.surface2,
                        borderRadius: '3px',
                        padding: '1px 5px',
                        color: C.whiteGhost,
                        fontSize: '9px',
                        fontFamily: C.fontMono,
                        letterSpacing: '0.02em',
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
          marginLeft: '14px',
          flexShrink: 0,
        }}>
          {breadcrumbParts.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0',
              fontSize: '10px',
              letterSpacing: '0.05em',
              fontFamily: C.fontMono,
              maxWidth: isCompact ? '120px' : isExpanded ? 'none' : '200px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}>
              {breadcrumbParts.map((part, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {i > 0 && (
                    <span style={{
                      color: C.whiteGhost,
                      margin: '0 5px',
                      fontSize: '9px',
                    }}>
                      /
                    </span>
                  )}
                  <span style={{
                    color: i === breadcrumbParts.length - 1 ? C.cyan : C.whiteGhost,
                    fontWeight: i === breadcrumbParts.length - 1 ? 600 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                  }}>
                    {part}
                  </span>
                </span>
              ))}
            </div>
          )}

          <div style={{
            background: C.glass,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            color: C.amber,
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            padding: '4px 10px',
            borderRadius: '100px',
            fontFamily: C.fontMono,
            whiteSpace: 'nowrap' as const,
            border: `1px solid ${C.amberDim}40`,
            boxShadow: `0 0 12px ${C.amberGlow}`,
          }}>
            <DecodeText text={activeLabel} />
          </div>
        </div>
      )}
    </div>
  )
}

export default CommandBarV3