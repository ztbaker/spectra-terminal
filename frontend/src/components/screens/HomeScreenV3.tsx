import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import theme from '../../lib/theme'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { fetchIndices } from '../../lib/api'
import type { IndexQuote } from '../../types'
import Sparkline from '../shared/Sparkline'

const { color, font, radius, motion } = theme

// ─── Glass panel style ──────────────────────────────────────────────────────────

const glass = {
  background: 'rgba(255, 255, 255, 0.04)',
  backdropFilter: 'blur(60px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(60px) saturate(1.4)',
  border: '1px solid rgba(255, 255, 255, 0.10)',
  borderRadius: radius.lg,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 0 40px rgba(0, 217, 100, 0.03), 0 0 40px rgba(59, 130, 246, 0.03)',
} as const

const glassInner = {
  background: 'rgba(255, 255, 255, 0.03)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.07)',
  borderRadius: radius.md,
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
} as const

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (cmd: string) => void
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const INDEX_DISPLAY: Record<string, { label: string; short: string }> = {
  '^GSPC':   { label: 'S&P 500',       short: 'SPX' },
  '^DJI':    { label: 'Dow Jones',      short: 'DJIA' },
  '^IXIC':   { label: 'Nasdaq',         short: 'COMP' },
  '^VIX':    { label: 'VIX',            short: 'VIX' },
  '^TNX':    { label: '10Y Treasury',   short: '10Y' },
  'GC=F':    { label: 'Gold',           short: 'GOLD' },
  'CL=F':    { label: 'Crude Oil',      short: 'CL' },
  'BTC-USD': { label: 'Bitcoin',        short: 'BTC' },
}

const INDEX_TICKERS = Object.keys(INDEX_DISPLAY)

const QUICK_ACTIONS = [
  { cmd: 'AAPL',       label: 'EQUI',     desc: 'Equity overview',  accent: '#00D964' },
  { cmd: 'AAPL GP',    label: 'GP',       desc: 'Price chart',      accent: '#3B82F6' },
  { cmd: 'AAPL OPT',   label: 'OPT',      desc: 'Options chain',    accent: '#A855F7' },
  { cmd: 'SCR pe<15',  label: 'SCR',      desc: 'Screener',         accent: '#F59E0B' },
  { cmd: 'BOND',       label: 'BOND',     desc: 'Yield curve',      accent: '#06B6D4' },
  { cmd: 'MACRO',      label: 'MACRO',    desc: 'Economic data',    accent: '#EF4444' },
  { cmd: 'N',          label: 'NEWS',     desc: 'Market news',      accent: '#EC4899' },
  { cmd: 'FX',         label: 'FX',       desc: 'Currencies',       accent: '#10B981' },
]

// ─── Index row ──────────────────────────────────────────────────────────────────

function IndexRow({ quote, ticker }: { quote: IndexQuote | undefined; ticker: string }) {
  const [hovered, setHovered] = useState(false)
  const info = INDEX_DISPLAY[ticker]
  const price = quote?.price ?? null
  const change = quote?.change ?? null
  const changePct = quote?.change_pct ?? null
  const isUp = (change ?? 0) >= 0
  const accentColor = change !== null ? (isUp ? color.accentPositive : color.accentNegative) : color.textTertiary

  const sparkData = useMemo<(number | null)[]>(() => {
    if (price === null || change === null) return []
    const dir = change >= 0 ? 1 : -1
    const pts: number[] = []
    for (let i = 0; i < 16; i++) {
      const noise = (Math.random() - 0.5) * Math.abs(change) * 0.25
      pts.push(price - dir * Math.abs(change) + dir * (i / 15) * Math.abs(change) + noise)
    }
    return pts
  }, [price, change])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr 60px 90px',
        alignItems: 'center',
        padding: '10px 16px',
        background: hovered ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
        borderRadius: radius.sm,
        transition: `background ${motion.fast} ease`,
        cursor: 'default',
        gap: '12px',
      }}
    >
      {/* Ticker */}
      <span style={{
        fontFamily: font.mono,
        fontSize: '12px',
        fontWeight: 600,
        color: color.textPrimary,
        letterSpacing: '0.02em',
      }}>
        {info.short}
      </span>

      {/* Sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        {sparkData.length >= 2 ? (
          <Sparkline data={sparkData} width={80} height={20} color={accentColor} />
        ) : (
          <div style={{ width: 80, height: 20 }} />
        )}
      </div>

      {/* Price */}
      <span style={{
        fontFamily: font.mono,
        fontSize: '12px',
        fontWeight: 400,
        color: color.textPrimary,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'right',
      }}>
        {price !== null
          ? price >= 10000
            ? price.toLocaleString('en-US', { maximumFractionDigits: 0 })
            : price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '—'}
      </span>

      {/* Change badge */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{
          fontFamily: font.mono,
          fontSize: '11px',
          fontWeight: 500,
          color: changePct !== null ? color.textInverse : color.textTertiary,
          background: changePct !== null ? accentColor : 'transparent',
          padding: '3px 8px',
          borderRadius: radius.sm,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'center',
          minWidth: '64px',
          display: 'inline-block',
        }}>
          {changePct !== null
            ? `${isUp ? '+' : ''}${changePct.toFixed(2)}%`
            : '—'}
        </span>
      </div>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────

const HomeScreenV3: React.FC<Props> = ({ onNavigate }) => {
  const [recentHistory, setRecentHistory] = useState<string[]>([])
  const bp = useBreakpoint()
  const isCompact = bp === 'compact'

  const { data: indices } = useQuery<IndexQuote[]>({
    queryKey: ['indices'],
    queryFn: fetchIndices,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const indexMap = useMemo(() => {
    const map: Record<string, IndexQuote> = {}
    if (Array.isArray(indices)) {
      for (const q of indices) map[q.ticker] = q
    }
    return map
  }, [indices])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('bb_cmd_history')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setRecentHistory(parsed.slice(-8).reverse())
      }
    } catch {}
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.key === '?' && e.shiftKey) {
      e.preventDefault()
      onNavigate('HELP')
    }
  }, [onNavigate])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Time-based market status
  const marketOpen = useMemo(() => {
    const now = new Date()
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const day = et.getDay()
    if (day === 0 || day === 6) return false
    const mins = et.getHours() * 60 + et.getMinutes()
    return mins >= 570 && mins < 960 // 9:30 - 16:00
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: color.bgBase,
      overflowY: 'auto',
      overflowX: 'hidden',
      position: 'relative',
    }}>
      {/* ═══ Ambient background glows ═══ */}
      <div style={{
        position: 'absolute',
        top: '-80px',
        left: '30%',
        transform: 'translateX(-50%)',
        width: '700px',
        height: '500px',
        background: 'radial-gradient(ellipse at center, rgba(0, 217, 100, 0.12) 0%, rgba(0, 217, 100, 0.04) 35%, transparent 65%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute',
        top: '60px',
        right: '-100px',
        width: '600px',
        height: '500px',
        background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.10) 0%, rgba(59, 130, 246, 0.03) 35%, transparent 65%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute',
        bottom: '0',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '800px',
        height: '300px',
        background: 'radial-gradient(ellipse at center, rgba(0, 217, 100, 0.05) 0%, rgba(59, 130, 246, 0.04) 40%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* ═══ SPECTRA TERMINAL wordmark — above everything ═══ */}
      <div style={{
        padding: '32px 20px 0 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: font.sans,
          fontSize: '26px',
          fontWeight: 700,
          color: color.textPrimary,
          letterSpacing: '0.2em',
          lineHeight: 1,
          background: 'linear-gradient(135deg, #00D964 0%, #FFFFFF 40%, #3B82F6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          SPECTRA
        </div>
        <div style={{
          fontFamily: font.sans,
          fontSize: '9px',
          fontWeight: 500,
          color: color.textTertiary,
          letterSpacing: '0.6em',
          marginTop: '5px',
        }}>
          TERMINAL
        </div>
        <div style={{
          marginTop: '12px',
          fontFamily: font.sans,
          fontSize: '11px',
          color: color.textTertiary,
          opacity: 0.7,
        }}>
          Type a command or ticker in the bar above
        </div>
      </div>

      {/* ═══ Content grid ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isCompact ? '1fr' : '2fr 320px',
        gap: '16px',
        padding: '20px',
        flex: 1,
        minHeight: 0,
        position: 'relative',
        zIndex: 1,
      }}>

        {/* ═══ Left column — Markets ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>

          {/* ── Market overview panel ── */}
          <div style={{ ...glass, padding: '0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Panel header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              flexShrink: 0,
              background: 'linear-gradient(90deg, rgba(0, 217, 100, 0.08) 0%, rgba(0, 217, 100, 0.02) 50%, transparent 100%)',
              borderRadius: `${radius.lg} ${radius.lg} 0 0`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontFamily: font.sans,
                  fontSize: '13px',
                  fontWeight: 600,
                  color: color.textPrimary,
                }}>
                  Markets
                </span>
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: marketOpen ? color.accentPositive : color.textTertiary,
                  display: 'inline-block',
                  boxShadow: marketOpen ? `0 0 10px ${color.accentPositive}, 0 0 20px ${color.accentPositive}40` : 'none',
                }} />
                <span style={{
                  fontFamily: font.sans,
                  fontSize: '11px',
                  color: marketOpen ? color.accentPositive : color.textTertiary,
                  fontWeight: 600,
                }}>
                  {marketOpen ? 'LIVE' : 'CLOSED'}
                </span>
              </div>
              <span style={{
                fontFamily: font.mono,
                fontSize: '10px',
                color: color.textTertiary,
              }}>
                30s refresh
              </span>
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 60px 90px',
              padding: '8px 16px',
              gap: '12px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
              flexShrink: 0,
            }}>
              {['SYMBOL', '', 'LAST', 'CHG %'].map((h, i) => (
                <span key={h || i} style={{
                  fontFamily: font.sans,
                  fontSize: '10px',
                  fontWeight: 600,
                  color: color.textTertiary,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em',
                  textAlign: i >= 2 ? 'right' : 'left',
                }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Index rows */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {INDEX_TICKERS.map(ticker => (
                <IndexRow key={ticker} quote={indexMap[ticker]} ticker={ticker} />
              ))}
            </div>
          </div>
        </div>

        {/* ═══ Right column ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0, alignSelf: 'start' }}>

          {/* ── Quick launch ── */}
          <div style={{ ...glass, padding: '0', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              flexShrink: 0,
              background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.02) 50%, transparent 100%)',
              borderRadius: `${radius.lg} ${radius.lg} 0 0`,
            }}>
              <span style={{
                fontFamily: font.sans,
                fontSize: '13px',
                fontWeight: 600,
                color: color.textPrimary,
              }}>
                Quick Launch
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}>
                {QUICK_ACTIONS.map(item => (
                  <QuickTile
                    key={item.cmd}
                    label={item.label}
                    desc={item.desc}
                    accent={item.accent}
                    onClick={() => onNavigate(item.cmd)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Recent ── */}
          {recentHistory.length > 0 && (
            <div style={{ ...glass, padding: '0', flexShrink: 0, maxHeight: '220px', overflow: 'hidden' }}>
              <div style={{
                padding: '12px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'linear-gradient(90deg, rgba(168, 85, 247, 0.08) 0%, rgba(168, 85, 247, 0.02) 50%, transparent 100%)',
                borderRadius: `${radius.lg} ${radius.lg} 0 0`,
              }}>
                <span style={{
                  fontFamily: font.sans,
                  fontSize: '13px',
                  fontWeight: 600,
                  color: color.textPrimary,
                }}>
                  Recent
                </span>
              </div>
              <div style={{ padding: '6px 8px' }}>
                {recentHistory.map((cmd, i) => (
                  <RecentRow key={`${cmd}-${i}`} cmd={cmd} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Quick launch tile ──────────────────────────────────────────────────────────

function QuickTile({ label, desc, accent, onClick }: { label: string; desc: string; accent: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...glassInner,
        padding: '14px 14px',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        position: 'relative',
        overflow: 'hidden',
        background: hovered ? 'rgba(255, 255, 255, 0.06)' : glassInner.background,
        border: hovered ? `1px solid ${accent}40` : glassInner.border,
        boxShadow: hovered
          ? `0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 0 20px ${accent}15`
          : glassInner.boxShadow,
        transition: `all ${motion.fast} ease`,
      }}
    >
      {/* Accent bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '3px',
        height: '100%',
        background: accent,
        opacity: hovered ? 1 : 0.4,
        transition: `opacity ${motion.fast} ease`,
        borderRadius: '2px 0 0 2px',
      }} />
      <span style={{
        fontFamily: font.mono,
        fontSize: '12px',
        fontWeight: 600,
        color: hovered ? accent : color.textSecondary,
        letterSpacing: '0.04em',
        transition: `color ${motion.fast} ease`,
        paddingLeft: '6px',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: font.sans,
        fontSize: '11px',
        color: color.textTertiary,
        paddingLeft: '6px',
      }}>
        {desc}
      </span>
    </button>
  )
}

// ─── Recent row ─────────────────────────────────────────────────────────────────

function RecentRow({ cmd, onNavigate }: { cmd: string; onNavigate: (cmd: string) => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={() => onNavigate(cmd)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        padding: '8px 12px',
        background: hovered ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
        border: 'none',
        borderRadius: radius.sm,
        cursor: 'pointer',
        textAlign: 'left',
        transition: `background ${motion.fast} ease`,
        gap: '8px',
      }}
    >
      <span style={{
        fontFamily: font.mono,
        fontSize: '11px',
        color: hovered ? color.accentPositive : color.textTertiary,
        transition: `color ${motion.fast} ease`,
      }}>
        {cmd}
      </span>
      {hovered && (
        <span style={{
          marginLeft: 'auto',
          fontFamily: font.mono,
          fontSize: '10px',
          color: color.accentPositive,
        }}>
          ↵
        </span>
      )}
    </button>
  )
}

export default HomeScreenV3
