import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'
import { useBreakpoint } from '../../lib/useBreakpoint'
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

// Ticker keys must match backend's indices.py INDEX_TICKERS (yfinance format)
// Display labels shown to the user
const INDEX_DISPLAY: Record<string, string> = {
  '^GSPC':   'S&P 500',
  '^DJI':    'DOW',
  '^IXIC':   'NASDAQ',
  '^VIX':    'VIX',
  '^TNX':    '10Y',
  'GC=F':    'GOLD',
  'CL=F':    'OIL',
  'BTC-USD': 'BTC',
}

const INDEX_TICKERS = Object.keys(INDEX_DISPLAY)

const COMMANDS = [
  { cmd: 'AAPL',      desc: 'View equity overview',       icon: '◆' },
  { cmd: 'AAPL GP',   desc: 'Launch chart with indicators', icon: '◇' },
  { cmd: 'AAPL OPT',  desc: 'Options chain + surface',    icon: '△' },
  { cmd: 'SCR pe<15', desc: 'Screen stocks by fundamentals', icon: '⊞' },
  { cmd: 'BOND',      desc: 'Treasury yield curve',       icon: '═' },
  { cmd: 'ASK why...', desc: 'Ask AI about current screen', icon: '◈' },
]

// ─── Index pulse tile ────────────────────────────────────────────────────────────

function IndexPulseTile({ quote }: { quote: IndexQuote | undefined }) {
  const price = quote?.price ?? null
  const change = quote?.change ?? null
  const changePct = quote?.change_pct ?? null
  const isLoading = !quote
  const [hovered, setHovered] = useState(false)
  const changePctAbs = changePct !== null ? Math.abs(changePct * 100) : 0
  const isBigMove = changePctAbs > 3
  const isHugeMove = changePctAbs > 5

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
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        padding: '10px 12px',
        minWidth: 0,
        flex: '1 1 0',
        // Glass card effect
        background: hovered ? C.glassHover : C.glass,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderRadius: '8px',
        border: `1px solid ${hovered ? C.glassBorderHover : C.glassBorder}`,
        transition: 'all 200ms ease',
        boxShadow: hovered ? C.shadow1 : 'none',
        cursor: 'default',
      }}
    >
      <span style={{
        fontFamily: C.fontDisplay,
        fontSize: '10px',
        fontWeight: 700,
        color: C.amber,
        letterSpacing: '0.08em',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
      }}>
        {quote?.label ?? INDEX_DISPLAY[quote?.ticker ?? ''] ?? quote?.ticker ?? '--'}
      </span>
      <span style={{
        fontFamily: C.fontMono,
        fontSize: '16px',
        color: isLoading ? C.whiteGhost : (isHugeMove ? C.amberBright : C.white),
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        fontWeight: 600,
        animation: isHugeMove ? 'neonFlash 600ms ease-out' : 'none',
      }}>
        {price !== null
          ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '--'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {changePct !== null ? (
          <ChangeIndicator value={changePct} decimals={2} size="sm" bright={isBigMove} />
        ) : (
          <span style={{ fontFamily: C.fontMono, fontSize: '10px', color: C.whiteGhost }}>
            --
          </span>
        )}
        <Sparkline
          data={sparkData}
          width={28}
          height={9}
          color={change !== null ? (change >= 0 ? (isBigMove ? C.greenBright : C.green) : (isBigMove ? C.redBright : C.red)) : C.amber}
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
        background: hovered ? C.glassHover : 'transparent',
        border: 'none',
        borderLeft: hovered ? `2px solid ${C.amber}` : `2px solid transparent`,
        cursor: 'pointer',
        textAlign: 'left',
        padding: '6px 10px',
        width: '100%',
        fontFamily: C.fontMono,
        fontSize: '12px',
        color: hovered ? C.amber : C.whiteGhost,
        transition: 'all 150ms ease',
        borderRadius: '0 4px 4px 0',
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
  const bp = useBreakpoint()
  const isCompact = bp === 'compact'
  const isExpanded = bp === 'expanded'

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
    } catch {}
  }, [])

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore keys when focus is in an input/textarea (e.g. the command bar) —
    // otherwise Enter here would hijack the user's typed command and navigate
    // to COMMANDS[0] (AAPL), stomping commands like HOME, BOND, FX, etc.
    const active = document.activeElement
    const tag = active?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active as HTMLElement | null)?.isContentEditable) {
      return
    }

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
    }}>
      {/* Ambient background glow */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '30%',
        width: '40%',
        height: '40%',
        background: `radial-gradient(ellipse, ${C.amberGlow}, transparent 70%)`,
        pointerEvents: 'none',
        opacity: 0.6,
      }} />
      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '20%',
        width: '30%',
        height: '30%',
        background: `radial-gradient(ellipse, ${C.cyanGlow}, transparent 70%)`,
        pointerEvents: 'none',
        opacity: 0.4,
      }} />

      {/* Content wrapper */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '28px 28px 20px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}>

        {/* ═══ 1. WORDMARK — dramatic hero ═══════════════════════════════════ */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: '20px',
          paddingBottom: '28px',
        }}>
          <div style={{
            fontFamily: C.fontDisplay,
            fontSize: isCompact ? '28px' : isExpanded ? '48px' : '36px',
            fontWeight: 700,
            // Gradient text
            background: C.gradientHero,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '0.25em',
            lineHeight: 1,
            position: 'relative',
          }}>
            SPECTRA
            {/* Glow behind wordmark */}
            <div style={{
              position: 'absolute',
              inset: '-8px',
              background: C.amberGlow,
              filter: 'blur(20px)',
              opacity: 0.4,
              pointerEvents: 'none',
              borderRadius: '50%',
            }} />
          </div>
          <div style={{
            fontFamily: C.fontMono,
            fontSize: isCompact ? '9px' : '11px',
            fontWeight: 400,
            color: C.whiteGhost,
            letterSpacing: isCompact ? '0.5em' : '0.8em',
            marginTop: '10px',
            textTransform: 'uppercase',
          }}>
            Terminal
          </div>
          {/* Horizontal accent line */}
          <div style={{
            width: '120px',
            height: '1px',
            background: `linear-gradient(90deg, transparent, ${C.amber}60, transparent)`,
            marginTop: '16px',
          }} />
        </div>

        {/* ═══ 2. MARKET PULSE — glass card row ══════════════════════════════ */}
        <div style={{
          marginBottom: '24px',
          // Glass card container
          background: C.glass,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: '12px',
          border: `1px solid ${C.glassBorder}`,
          padding: '14px',
          boxShadow: C.shadow1,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px',
          }}>
            <span style={{
              fontFamily: C.fontDisplay,
              fontSize: '10px',
              fontWeight: 700,
              color: C.whiteGhost,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}>
              Market Pulse
            </span>
            <LiveDot size={5} color={indices ? C.green : C.whiteGhost} active={!!indices} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
            {INDEX_TICKERS.map((ticker, i) => (
              <div key={ticker} style={{ animation: 'fadeSlideUp 300ms ease both', animationDelay: `${Math.min(i * 30, 500)}ms` }}>
                <IndexPulseTile quote={indexMap[ticker]} />
              </div>
            ))}
          </div>
        </div>

        {/* ═══ 3. COMMAND SUGGESTIONS — interactive list ═════════════════════ */}
        <div style={{ marginBottom: '24px', flex: 1 }}>
          <div style={{
            fontFamily: C.fontDisplay,
            fontSize: '10px',
            fontWeight: 700,
            color: C.whiteGhost,
            letterSpacing: '0.18em',
            marginBottom: '10px',
            textTransform: 'uppercase',
          }}>
            Quick Launch
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : isExpanded ? '1fr 1fr 1fr' : '1fr 1fr',
            gap: '2px',
            background: C.glass,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderRadius: '12px',
            border: `1px solid ${C.glassBorder}`,
            overflow: 'hidden',
          }}>
            {COMMANDS.map((item, i) => {
              const isActive = i === selectedCmd
              return (
                <button
                  key={item.cmd}
                  onClick={() => onNavigate(item.cmd)}
                  onMouseEnter={() => setSelectedCmd(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    border: 'none',
                    borderLeft: isActive
                      ? `3px solid ${C.amber}`
                      : '3px solid transparent',
                    background: isActive ? C.amberGlow : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 200ms ease',
                    width: '100%',
                    animation: 'fadeSlideUp 300ms ease both',
                    animationDelay: `${Math.min(i * 30, 500)}ms`,
                  }}
                >
                  {/* Icon */}
                  <span style={{
                    fontFamily: C.fontMono,
                    fontSize: '12px',
                    color: isActive ? C.amberBright : C.amberMute,
                    width: '20px',
                    textAlign: 'center',
                    transition: 'color 200ms',
                  }}>
                    {item.icon}
                  </span>
                  <span style={{
                    fontFamily: C.fontMono,
                    fontSize: '13px',
                    color: isActive ? C.amberBright : C.amber,
                    whiteSpace: 'nowrap',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    transition: 'color 200ms',
                  }}>
                    {item.cmd}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    color: isActive ? C.whiteDim : C.whiteGhost,
                    transition: 'color 200ms',
                  }}>
                    {item.desc}
                  </span>
                  {/* Arrow indicator */}
                  {isActive && (
                    <span style={{
                      marginLeft: 'auto',
                      color: C.amber,
                      fontSize: '12px',
                      fontFamily: C.fontMono,
                      animation: 'fadeSlideUp 200ms ease',
                    }}>
                      ↵
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ═══ 4. RECENT ACTIVITY ═══════════════════════════════════════════ */}
        {recentHistory.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontFamily: C.fontDisplay,
              fontSize: '10px',
              fontWeight: 700,
              color: C.whiteGhost,
              letterSpacing: '0.18em',
              marginBottom: '8px',
              textTransform: 'uppercase',
            }}>
              Recent
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {recentHistory.map((cmd, i) => (
                <RecentItem key={`${cmd}-${i}-${cmd.length}`} cmd={cmd} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}

        {/* ═══ 5. KEYBOARD HINTS ═══════════════════════════════════════════ */}
        <div style={{ marginTop: 'auto', display: isCompact ? 'none' : 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {['F1-F10: Nav', '↑↓: Select', 'Enter: Go', '⇧Enter: New Panel', 'Tab: Complete'].map(hint => (
              <span key={hint} style={{
                fontFamily: C.fontMono,
                fontSize: '9px',
                color: C.whiteGhost,
                letterSpacing: '0.04em',
                padding: '3px 8px',
                background: C.glass,
                borderRadius: '4px',
                border: `1px solid ${C.glassBorder}`,
              }}>
                {hint}
              </span>
            ))}
          </div>

          {/* Help button */}
          <button
            onClick={() => setShowHints(prev => !prev)}
            style={{
              background: C.glass,
              border: `1px solid ${C.glassBorder}`,
              color: C.whiteGhost,
              fontFamily: C.fontMono,
              fontSize: '10px',
              cursor: 'pointer',
              padding: '4px 10px',
              letterSpacing: '0.06em',
              borderRadius: '6px',
              transition: 'all 200ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = C.amberDim
              e.currentTarget.style.color = C.amber
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = C.glassBorder
              e.currentTarget.style.color = C.whiteGhost
            }}
          >
            ? help
          </button>
        </div>

        {/* ═══ HINTS OVERLAY — glassmorphic floating panel ══════════════════ */}
        {showHints && (
          <div style={{
            position: 'absolute',
            bottom: '28px',
            right: '28px',
            background: 'rgba(8, 8, 26, 0.9)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${C.glassBorder}`,
            borderRadius: '12px',
            padding: '16px 20px',
            zIndex: 1000,
            boxShadow: C.shadow3,
            animation: 'fadeSlideUp 200ms ease',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: `1px solid ${C.glassBorder}`,
            }}>
              <span style={{
                fontFamily: C.fontDisplay,
                fontSize: '11px',
                fontWeight: 700,
                color: C.amber,
                letterSpacing: '0.12em',
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
                  padding: '0 4px',
                  fontFamily: C.fontMono,
                }}
              >
                ×
              </button>
            </div>
            <div style={{
              fontFamily: C.fontMono,
              fontSize: '11px',
              color: C.whiteDim,
              lineHeight: 2,
            }}>
              F1–F10: Quick nav · Enter: Execute · Esc: Clear · Tab: Autocomplete · ↑↓: Navigate
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default HomeScreenV3