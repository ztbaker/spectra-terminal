import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'
import { fetchIndices } from '../../lib/api'
import type { IndexQuote } from '../../types'
import ChangeIndicator from '../shared/ChangeIndicator'
import LiveDot from '../shared/LiveDot'
import Sparkline from '../shared/Sparkline'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (cmd: string) => void
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const INDEX_TICKERS = ['SPX', 'NDX', 'DJI', 'IWM', 'VIX', 'BTC-USD']

const COMMANDS = [
  { cmd: 'AAPL',      desc: 'View equity overview' },
  { cmd: 'AAPL GP',   desc: 'Launch chart with indicators' },
  { cmd: 'AAPL OPT',  desc: 'Options chain + surface' },
  { cmd: 'SCR pe<15', desc: 'Screen stocks by fundamentals' },
  { cmd: 'BOND',      desc: 'Treasury yield curve' },
  { cmd: 'ASK why...', desc: 'Ask AI about current screen' },
]

// ─── Index pulse tile ────────────────────────────────────────────────────────────

function IndexPulseTile({ quote }: { quote: IndexQuote | undefined }) {
  const price = quote?.price ?? null
  const change = quote?.change ?? null
  const changePct = quote?.change_pct ?? null
  const isLoading = !quote

  const sparkData = useMemo<(number | null)[]>(() => {
    if (price === null || change === null) return []
    const direction = change >= 0 ? 1 : -1
    const points: number[] = []
    for (let i = 0; i < 12; i++) {
      const noise = (Math.random() - 0.5) * Math.abs(change) * 0.3
      points.push(price + direction * (i / 12) * Math.abs(change) + noise)
    }
    return points
  }, [price, change])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      padding: '6px 0',
      minWidth: 0,
      flex: '1 1 0',
    }}>
      <span style={{
        fontFamily: C.fontDisplay,
        fontSize: '12px',
        fontWeight: 700,
        color: C.amber,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
      }}>
        {quote?.ticker ?? '--'}
      </span>
      <span style={{
        fontFamily: C.fontMono,
        fontSize: '14px',
        color: isLoading ? C.whiteGhost : C.white,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}>
        {price !== null
          ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '--'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {changePct !== null ? (
          <ChangeIndicator value={changePct} decimals={2} size="sm" />
        ) : (
          <span style={{ fontFamily: C.fontMono, fontSize: '10px', color: C.whiteGhost }}>
            --
          </span>
        )}
        <Sparkline
          data={sparkData}
          width={24}
          height={8}
          color={change !== null ? (change >= 0 ? C.green : C.red) : C.amber}
        />
      </div>
    </div>
  )
}

// ─── Recent history item ────────────────────────────────────────────────────────

function RecentItem({ cmd, onNavigate }: { cmd: string; onNavigate: (cmd: string) => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={() => onNavigate(cmd)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        padding: '4px 8px',
        width: '100%',
        fontFamily: C.fontMono,
        fontSize: '12px',
        color: hovered ? C.amber : C.whiteGhost,
        transition: 'color 150ms ease',
      }}
    >
      &gt; {cmd}
    </button>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────

const HomeScreenV3: React.FC<Props> = ({ onNavigate }) => {
  const [selectedCmd, setSelectedCmd] = useState(0)
  const [showHints, setShowHints] = useState(false)
  const [recentHistory, setRecentHistory] = useState<string[]>([])
  const selectedCmdRef = useRef(0)

  // Keep ref in sync with state so Enter handler always has current value
  useEffect(() => {
    selectedCmdRef.current = selectedCmd
  }, [selectedCmd])

  // ── Fetch market indices ────────────────────────────────────────────────────
  const { data: indices } = useQuery<IndexQuote[]>({
    queryKey: ['indices'],
    queryFn: fetchIndices,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const indexMap = useMemo(() => {
    const map: Record<string, IndexQuote> = {}
    if (indices) {
      for (const q of indices) {
        map[q.ticker] = q
      }
    }
    return map
  }, [indices])

  // ── Load recent command history from localStorage ───────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('bb_cmd_history')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setRecentHistory(parsed.slice(-5).reverse())
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedCmd(prev => (prev - 1 + COMMANDS.length) % COMMANDS.length)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedCmd(prev => (prev + 1) % COMMANDS.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onNavigate(COMMANDS[selectedCmdRef.current].cmd)
    } else if (e.key === '?' && e.shiftKey) {
      e.preventDefault()
      setShowHints(prev => !prev)
    } else if (e.key === 'Escape') {
      setShowHints(false)
    }
  }, [onNavigate])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: C.surface0,
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '24px',
    }}>

      {/* ═══ 1. WORDMARK ═══════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: '24px',
        paddingBottom: '20px',
      }}>
        <div style={{
          fontFamily: C.fontDisplay,
          fontSize: '36px',
          fontWeight: 700,
          color: C.amber,
          letterSpacing: '0.2em',
          lineHeight: 1,
          textShadow: `0 0 30px ${C.amberGlowStrong}`,
        }}>
          BAKER
        </div>
        <div style={{
          fontFamily: C.fontMono,
          fontSize: '12px',
          fontWeight: 400,
          color: C.whiteGhost,
          letterSpacing: '0.5em',
          marginTop: '6px',
        }}>
          TERMINAL
        </div>
      </div>

      {/* ═══ 2. MARKET PULSE STRIP ════════════════════════════════════════════ */}
      <div style={{
        borderLeft: `2px solid ${C.cyan}`,
        borderBottom: `1px solid ${C.border1}`,
        paddingLeft: '12px',
        paddingRight: '8px',
        paddingBottom: '8px',
        paddingTop: '8px',
        marginBottom: '20px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '6px',
        }}>
          <span style={{
            fontFamily: C.fontDisplay,
            fontSize: '10px',
            fontWeight: 700,
            color: C.amberMute,
            letterSpacing: '0.15em',
          }}>
            MARKET
          </span>
          <LiveDot size={5} color={indices ? C.green : C.amberMute} active={!!indices} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          {INDEX_TICKERS.map(ticker => (
            <IndexPulseTile key={ticker} quote={indexMap[ticker]} />
          ))}
        </div>
      </div>

      {/* ═══ 3. COMMAND SUGGESTIONS ════════════════════════════════════════════ */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontFamily: C.fontDisplay,
          fontSize: '10px',
          fontWeight: 700,
          color: C.whiteGhost,
          letterSpacing: '0.2em',
          marginBottom: '8px',
        }}>
          COMMANDS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {COMMANDS.map((item, i) => (
            <button
              key={item.cmd}
              onClick={() => onNavigate(item.cmd)}
              onMouseEnter={() => setSelectedCmd(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: 'none',
                borderLeft: i === selectedCmd
                  ? `2px solid ${C.cyan}`
                  : '2px solid transparent',
                background: i === selectedCmd ? C.amberGlow : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 150ms ease, border-color 150ms ease',
                width: '100%',
              }}
            >
              <span style={{
                fontFamily: C.fontMono,
                fontSize: '13px',
                color: C.amber,
                whiteSpace: 'nowrap',
                fontWeight: 700,
              }}>
                &gt; {item.cmd}
              </span>
              <span style={{
                fontFamily: C.fontBody,
                fontSize: '12px',
                color: C.whiteDim,
              }}>
                &mdash; {item.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 4. RECENT ACTIVITY ═══════════════════════════════════════════════ */}
      {recentHistory.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontFamily: C.fontDisplay,
            fontSize: '10px',
            fontWeight: 700,
            color: C.whiteGhost,
            letterSpacing: '0.2em',
            marginBottom: '8px',
          }}>
            RECENT
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {recentHistory.map((cmd, i) => (
              <RecentItem key={`${cmd}-${i}`} cmd={cmd} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}

      {/* ═══ 5. KEYBOARD HINTS BUTTON ═════════════════════════════════════════ */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setShowHints(prev => !prev)}
          style={{
            background: 'none',
            border: `1px solid ${C.border0}`,
            color: C.whiteGhost,
            fontFamily: C.fontMono,
            fontSize: '10px',
            cursor: 'pointer',
            padding: '3px 8px',
            letterSpacing: '0.05em',
            transition: 'border-color 200ms ease, color 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = C.border1
            e.currentTarget.style.color = C.whiteDim
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = C.border0
            e.currentTarget.style.color = C.whiteGhost
          }}
        >
          ? shortcuts
        </button>
      </div>

      {/* ═══ HINTS OVERLAY ════════════════════════════════════════════════════ */}
      {showHints && (
        <div style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          background: C.surface1,
          border: `1px solid ${C.border1}`,
          padding: '12px 16px',
          zIndex: 1000,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
            paddingBottom: '6px',
            borderBottom: `1px solid ${C.border0}`,
          }}>
            <span style={{
              fontFamily: C.fontDisplay,
              fontSize: '10px',
              fontWeight: 700,
              color: C.amber,
              letterSpacing: '0.1em',
            }}>
              KEYBOARD SHORTCUTS
            </span>
            <button
              onClick={() => setShowHints(false)}
              style={{
                background: 'none',
                border: 'none',
                color: C.whiteGhost,
                cursor: 'pointer',
                fontSize: '14px',
                lineHeight: 1,
                padding: '0 2px',
                fontFamily: C.fontMono,
              }}
            >
              x
            </button>
          </div>
          <div style={{
            fontFamily: C.fontMono,
            fontSize: '11px',
            color: C.whiteDim,
            lineHeight: 1.8,
          }}>
            F1&ndash;F10: Quick nav &middot; Enter: Execute &middot; Esc: Clear &middot; Tab: Autocomplete
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeScreenV3