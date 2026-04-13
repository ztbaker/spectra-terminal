import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from 'react'
import { parseCommand } from '../../lib/commandParser'
import C from '../../lib/colors'
import type { ParsedCommand } from '../../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'bb_cmd_history'
const HISTORY_MAX = 50

const KNOWN_COMMANDS = [
  'PORT', 'WLT', 'ECON', 'EARN', 'SCR', 'FX', 'CRYPTO', 'MACRO',
  'EQUITY', 'GP', 'OPT', 'OPTIONS', 'NEWS', 'FILINGS',
  'PORTFOLIO', 'WATCHLIST', 'EARNINGS', 'SCREENER',
]

const KNOWN_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  'SPY', 'QQQ', 'BTC-USD',
]

const ALL_SUGGESTIONS = [...KNOWN_COMMANDS, ...KNOWN_TICKERS]

// ─── Screen display labels for breadcrumb ─────────────────────────────────────

const SCREEN_LABELS: Record<string, string> = {
  equity: 'EQUITY',
  chart: 'CHART',
  options: 'OPTIONS',
  news: 'NEWS',
  filings: 'FILINGS',
  portfolio: 'PORTFOLIO',
  watchlist: 'WATCHLIST',
  econ: 'ECON',
  earnings: 'EARNINGS',
  screener: 'SCREENER',
  fx: 'FX',
  fxc: 'FXC',
  crypto: 'CRYPTO',
  macro: 'MACRO',
  home: 'HOME',
  des: 'DES',
  graph: 'GRAPH',
  gpo: 'GPO',
  gip: 'GIP',
  wei: 'WEI',
  hs: 'HS',
  ecst: 'ECST',
  etf: 'ETF',
  bond: 'BOND',
  comd: 'COMD',
  cong: 'CONG',
  quant: 'QUANT',
  ask: 'ASK',
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
  } catch {
    // localStorage unavailable — ignore
  }
}

function getSuggestions(input: string): string[] {
  const upper = input.toUpperCase().trim()
  if (!upper) return []
  const parts = upper.split(/\s+/)
  const query = parts[parts.length - 1]
  if (!query) return []

  return ALL_SUGGESTIONS.filter(s => s.startsWith(query) && s !== query).slice(0, 5)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onCommand: (cmd: ParsedCommand) => void
  activeCommand?: ParsedCommand | null
  contextTicker?: string
}

const CommandBar: React.FC<Props> = ({ onCommand, activeCommand, contextTicker }) => {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>(loadHistory)
  // historyIdx: -1 means "not browsing history" (live input)
  const [historyIdx, setHistoryIdx] = useState(-1)
  // Stash current input when user starts browsing history
  const liveInputRef = useRef('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionIdx, setSuggestionIdx] = useState(-1)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep live input ref in sync
  useEffect(() => {
    if (historyIdx === -1) {
      liveInputRef.current = input
    }
  }, [input, historyIdx])

  const commitCommand = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return

      const cmd = parseCommand(trimmed)
      onCommand(cmd)

      // Add to history (deduplicate: remove prior entry then prepend)
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
    },
    [onCommand],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Enter': {
          e.preventDefault()
          // If a suggestion is highlighted, accept it first
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
          break
        }

        case 'ArrowUp': {
          e.preventDefault()
          if (suggestions.length > 0) {
            // Navigate suggestions upward
            setSuggestionIdx(prev =>
              prev <= 0 ? suggestions.length - 1 : prev - 1,
            )
          } else {
            // Navigate history
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
            setSuggestionIdx(prev =>
              prev >= suggestions.length - 1 ? 0 : prev + 1,
            )
          } else {
            if (historyIdx <= 0) {
              // Back to live input
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
            // Single match: complete immediately
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
    [commitCommand, history, historyIdx, input, suggestions, suggestionIdx],
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

  // ── Breadcrumb derivation ───────────────────────────────────────────────────
  const breadcrumbParts: string[] = []
  if (activeCommand?.ticker) {
    breadcrumbParts.push(activeCommand.ticker)
  }
  if (activeCommand?.screen) {
    breadcrumbParts.push(SCREEN_LABELS[activeCommand.screen] ?? activeCommand.screen.toUpperCase())
  }
  if (activeCommand?.sub) {
    breadcrumbParts.push(activeCommand.sub.toUpperCase())
  }

  // ── Active screen label ─────────────────────────────────────────────────────
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
        height: '40px',
        background: C.bg0,
        fontFamily: C.fontMono,
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '0',
        paddingRight: '12px',
        zIndex: 1000,
        userSelect: 'none',
        // Subtle warm gradient on bottom border
        borderBottom: '1px solid transparent',
        backgroundImage: `linear-gradient(${C.bg0}, ${C.bg0}), linear-gradient(90deg, #ff990033, transparent 30%, transparent 70%, #ff990033)`,
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
      }}
    >
      {/* Left: BAKER wordmark */}
      <div
        style={{
          fontFamily: C.fontSans,
          fontWeight: 700,
          fontSize: '14px',
          color: C.amber,
          letterSpacing: '0.12em',
          paddingLeft: '14px',
          paddingRight: '14px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          borderRight: `1px solid ${C.border0}`,
          flexShrink: 0,
        }}
      >
        BAKER
      </div>

      {/* Context ticker ghost prefix */}
      {contextTicker && !input && (
        <span style={{
          color: C.border1,
          fontSize: '13px',
          fontFamily: C.fontMono,
          letterSpacing: '0.02em',
          marginRight: '2px',
          pointerEvents: 'none',
          userSelect: 'none',
          paddingLeft: '10px',
        }}>
          {contextTicker}&ensp;·
        </span>
      )}

      {/* Input area */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
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
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: C.amber,
            fontFamily: C.fontMono,
            fontSize: '13px',
            flex: 1,
            caretColor: 'transparent', // we render our own cursor below
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            padding: 0,
            boxShadow: focused ? '0 0 8px rgba(255,153,0,0.15)' : 'none',
            transition: 'box-shadow 0.2s ease',
          }}
          aria-label="Command input"
        />
        {/* Blinking block cursor shown after the typed text */}
        <span
          className="bb-cursor"
          style={{
            display: 'inline-block',
            width: '8px',
            height: '13px',
            background: C.amber,
            marginLeft: '1px',
          }}
        />

        {/* Autocomplete dropdown — frosted glass */}
        {suggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              background: 'rgba(10,10,10,0.9)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: `1px solid ${C.border1}`,
              borderRadius: '4px',
              zIndex: 2000,
              minWidth: '180px',
              boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px ${C.border0}`,
              overflow: 'hidden',
            }}
          >
            <div style={{
              fontSize: '9px',
              letterSpacing: '0.08em',
              color: C.amberMute,
              padding: '4px 10px 2px',
              textTransform: 'uppercase',
              borderBottom: `1px solid ${C.border0}`,
            }}>
              Suggestions
            </div>
            {suggestions.map((s, i) => (
              <div
                key={s}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSuggestionClick(s)
                }}
                style={{
                  padding: '5px 10px',
                  cursor: 'pointer',
                  color: i === suggestionIdx ? C.bg0 : C.amber,
                  background: i === suggestionIdx ? C.amber : 'transparent',
                  fontSize: '12px',
                  letterSpacing: '0.02em',
                  fontFamily: C.fontMono,
                  transition: 'background 0.1s ease, color 0.1s ease',
                }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: active screen badge (pill) + breadcrumb */}
      {activeLabel && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginLeft: '12px',
          flexShrink: 0,
        }}>
          {/* Breadcrumb trail */}
          {breadcrumbParts.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0',
              fontSize: '10px',
              letterSpacing: '0.05em',
              color: C.amberMute,
              fontFamily: C.fontMono,
            }}>
              {breadcrumbParts.map((part, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {i > 0 && (
                    <span style={{
                      color: C.border2,
                      margin: '0 4px',
                      fontSize: '9px',
                    }}>
                      &rsaquo;
                    </span>
                  )}
                  <span style={{
                    color: i === breadcrumbParts.length - 1 ? C.whiteDim : C.amberMute,
                  }}>
                    {part}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Active screen pill */}
          <div style={{
            background: C.bg3,
            color: C.amber,
            fontSize: '10px',
            fontWeight: 500,
            letterSpacing: '0.06em',
            padding: '2px 8px',
            borderRadius: '3px',
            fontFamily: C.fontMono,
            whiteSpace: 'nowrap',
          }}>
            {activeLabel}
          </div>
        </div>
      )}
    </div>
  )
}

export default CommandBar