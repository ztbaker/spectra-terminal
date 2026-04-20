import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import theme from '../../lib/theme'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { fetchIndices } from '../../lib/api'
import type { IndexQuote } from '../../types'
import ChangeIndicator from '../shared/ChangeIndicator'
import LiveDot from '../shared/LiveDot'
import Sparkline from '../shared/Sparkline'

const { color, font } = theme

// ─── Types ──────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (cmd: string) => void
}

interface QuickLink {
  label: string
  cmd: string
  desc: string
  icon: string
  column: 'markets' | 'tools'
}

// ─── Inline SVG icon factory ────────────────────────────────────────────────

const icons: Record<string, React.ReactElement> = {
  equity: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,12 4,8 7,10 15,3" />
      <polyline points="11,3 15,3 15,7" />
    </svg>
  ),
  chart: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="14" height="14" rx="1" />
      <polyline points="3,11 6,7 9,9 13,4" />
    </svg>
  ),
  options: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
      <circle cx="5" cy="4" r="1.5" fill={color.accentPositive} />
      <circle cx="10" cy="8" r="1.5" fill={color.accentPositive} />
      <circle cx="7" cy="12" r="1.5" fill={color.accentPositive} />
    </svg>
  ),
  etf: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="14" height="10" rx="1" />
      <line x1="1" y1="7" x2="15" y2="7" />
      <line x1="5.5" y1="3" x2="5.5" y2="13" />
    </svg>
  ),
  crypto: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <line x1="8" y1="3" x2="8" y2="13" />
      <path d="M5.5,6 C5.5,4.5 10.5,4.5 10.5,6 C10.5,7.5 5.5,7.5 5.5,9.5 C5.5,11.5 10.5,11.5 10.5,10" />
    </svg>
  ),
  fx: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="3" />
      <circle cx="11" cy="10" r="3" />
      <line x1="13" y1="2" x2="3" y2="14" />
    </svg>
  ),
  commodity: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <line x1="5" y1="6" x2="5" y2="10" />
      <line x1="8" y1="4" x2="8" y2="12" />
      <line x1="11" y1="7" x2="11" y2="10" />
    </svg>
  ),
  bond: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="14" x2="2" y2="2" />
      <line x1="14" y1="14" x2="14" y2="2" />
      <polyline points="2,12 5,9 8,11 11,6 14,4" />
    </svg>
  ),
  screener: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="8,1 15,5 15,11 8,15 1,11 1,5" />
      <line x1="8" y1="1" x2="8" y2="15" />
      <line x1="1" y1="5" x2="15" y2="5" />
      <line x1="1" y1="11" x2="15" y2="11" />
    </svg>
  ),
  portfolio: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  ),
  watchlist: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8,4 8,8 11,8" />
    </svg>
  ),
  earnings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="12" rx="1" />
      <line x1="1" y1="6" x2="15" y2="6" />
      <line x1="5" y1="2" x2="5" y2="6" />
      <line x1="11" y1="2" x2="11" y2="6" />
      <circle cx="8" cy="10.5" r="1.5" fill={color.accentPositive} />
    </svg>
  ),
  news: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="12" rx="1" />
      <line x1="4" y1="5" x2="12" y2="5" />
      <line x1="4" y1="8" x2="12" y2="8" />
      <line x1="4" y1="11" x2="9" y2="11" />
    </svg>
  ),
  filings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3,1 L10,1 L13,4 L13,15 L3,15 Z" />
      <polyline points="10,1 10,4 13,4" />
      <line x1="5" y1="7" x2="11" y2="7" />
      <line x1="5" y1="10" x2="11" y2="10" />
    </svg>
  ),
  congress: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="6" width="14" height="9" rx="1" />
      <line x1="8" y1="1" x2="8" y2="6" />
      <polygon points="5,1 8,1 11,1" fill={color.accentPositive} />
      <line x1="4" y1="6" x2="4" y2="15" />
      <line x1="12" y1="6" x2="12" y2="15" />
    </svg>
  ),
  quant: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.accentPositive} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <line x1="8" y1="2" x2="8" y2="8" />
      <line x1="8" y1="8" x2="13" y2="5" />
      <circle cx="8" cy="8" r="1.5" fill={color.accentPositive} />
    </svg>
  ),
}

// ─── Quick links data ───────────────────────────────────────────────────────

const QUICK_LINKS: QuickLink[] = [
  { label: 'Equity',    cmd: 'AAPL EQUITY', desc: 'Real-time stock data',         icon: 'equity',     column: 'markets' },
  { label: 'Chart',      cmd: 'AAPL GP',     desc: 'Candlestick & indicators',    icon: 'chart',       column: 'markets' },
  { label: 'Options',    cmd: 'AAPL OPT',    desc: 'Chain with full Greeks',       icon: 'options',     column: 'markets' },
  { label: 'ETF',        cmd: 'SPY ETF',     desc: 'Holdings & performance',       icon: 'etf',         column: 'markets' },
  { label: 'Crypto',     cmd: 'CRYPTO',      desc: 'Digital asset dashboard',      icon: 'crypto',      column: 'markets' },
  { label: 'FX',         cmd: 'FX',          desc: 'Foreign exchange rates',       icon: 'fx',          column: 'markets' },
  { label: 'Commodity',  cmd: 'COMD',        desc: 'Spot prices & futures',       icon: 'commodity',   column: 'markets' },
  { label: 'Bond',       cmd: 'BOND',         desc: 'Yield curve & rates',         icon: 'bond',        column: 'markets' },
  { label: 'Screener',   cmd: 'SCR',          desc: 'Filter & rank stocks',        icon: 'screener',    column: 'tools' },
  { label: 'Portfolio',  cmd: 'PORT',          desc: 'Track your holdings',         icon: 'portfolio',   column: 'tools' },
  { label: 'Watchlist',  cmd: 'WLT',           desc: 'Saved tickers',              icon: 'watchlist',   column: 'tools' },
  { label: 'Earnings',   cmd: 'EARN',          desc: 'Upcoming calendar',           icon: 'earnings',    column: 'tools' },
  { label: 'News',       cmd: 'N',             desc: 'Market headlines',            icon: 'news',        column: 'tools' },
  { label: 'Filings',    cmd: 'AAPL FILINGS',  desc: 'SEC document search',        icon: 'filings',     column: 'tools' },
  { label: 'Congress',   cmd: 'CONG',          desc: 'Bills & legislation',         icon: 'congress',    column: 'tools' },
  { label: 'Quant',      cmd: 'AAPL QUANT',    desc: 'Cointegration & factor',      icon: 'quant',       column: 'tools' },
]

const INDEX_TICKERS = ['SPX', 'NDX', 'DJI', 'VIX']

// ─── Keyboard shortcut tooltip ───────────────────────────────────────────────

const SHORTCUT_ENTRIES: [string, string][] = [
  ['F1', 'WLT'],
  ['F2', 'PORT'],
  ['F3', 'MACRO'],
  ['F4', 'ECON'],
  ['F5', 'N'],
  ['F6', 'EARN'],
  ['F7', 'SCR'],
  ['F8', 'FX'],
  ['F9', 'CRYPTO'],
  ['F10', 'MACRO'],
  ['ESC', 'Clear cmd'],
  ['Up/Dn', 'History'],
]

function ShortcutTooltip({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '48px',
        right: '24px',
        background: color.bgElevated,
        border: `1px solid ${color.borderSubtle}`,
        padding: '16px 20px',
        zIndex: 1000,
        minWidth: '240px',
        animation: 'fadeSlideUp 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
        paddingBottom: '8px',
        borderBottom: `1px solid ${color.borderSubtle}`,
      }}>
        <span style={{
          fontFamily: font.sans,
          fontSize: '11px',
          fontWeight: 700,
          color: color.textPrimary,
          letterSpacing: '0.1em',
        }}>
          KEYBOARD SHORTCUTS
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: color.textTertiary,
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            padding: '0 2px',
            fontFamily: font.mono,
          }}
        >
          x
        </button>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '4px 24px',
      }}>
        {SHORTCUT_ENTRIES.map(([key, cmd]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{
              fontFamily: font.mono,
              fontSize: '10px',
              color: color.textPrimary,
              minWidth: '38px',
            }}>
              [{key}]
            </span>
            <span style={{
              fontFamily: font.mono,
              fontSize: '10px',
              color: color.textSecondary,
            }}>
              {cmd}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Index tile ─────────────────────────────────────────────────────────────

function IndexTile({ quote }: { quote: IndexQuote | undefined }) {
  const loading = !quote
  const price = quote?.price ?? null
  const change = quote?.change ?? null
  const changePct = quote?.change_pct ?? null
  const changeColor = change !== null ? (change >= 0 ? color.accentPositive : color.accentNegative) : color.textSecondary

  const sparkData: (number | null)[] = React.useMemo(() => {
    if (price === null) return []
    const base = price
    const direction = change !== null && change >= 0 ? 1 : -1
    const points: number[] = []
    for (let i = 0; i < 20; i++) {
      const noise = (Math.random() - 0.5) * Math.abs(change ?? 1) * 0.3
      points.push(base + direction * (i / 20) * Math.abs(change ?? 0.5) + noise)
    }
    return points
  }, [price, change])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px',
      background: color.bgElevated,
      border: `1px solid ${color.borderSubtle}`,
      minWidth: '0',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '0' }}>
        <span style={{
          fontFamily: font.sans,
          fontSize: '12px',
          fontWeight: 700,
          color: color.textPrimary,
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
        }}>
          {quote?.ticker ?? '--'}
        </span>
        <span style={{
          fontFamily: font.mono,
          fontSize: '14px',
          color: loading ? color.textTertiary : color.textPrimary,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}>
          {price !== null ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
        {change !== null && changePct !== null ? (
          <>
            <ChangeIndicator value={changePct} decimals={2} size="sm" />
            <span style={{
              fontFamily: font.mono,
              fontSize: '10px',
              color: changeColor,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}
            </span>
          </>
        ) : (
          <span style={{ fontFamily: font.mono, fontSize: '10px', color: color.textTertiary }}>--</span>
        )}
      </div>
      <div style={{ flexShrink: 0, marginLeft: '2px' }}>
        <Sparkline
          data={sparkData}
          width={32}
          height={16}
          color={change !== null && change >= 0 ? color.accentPositive : change !== null ? color.accentNegative : color.textPrimary}
        />
      </div>
    </div>
  )
}

// ─── Quick link card ────────────────────────────────────────────────────────

function QuickCard({ link, onNavigate, delay }: { link: QuickLink; onNavigate: (cmd: string) => void; delay: number }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={() => onNavigate(link.cmd)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        background: hovered ? color.bgHover : color.bgSurface,
        border: `1px solid ${hovered ? color.borderMedium : color.borderSubtle}`,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 200ms ease, background 200ms ease',
        animation: `fadeSlideUp 400ms cubic-bezier(0.16, 1, 0.3, 1) both`,
        animationDelay: `${delay}ms`,
      }}
    >
      <div style={{ flexShrink: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icons[link.icon] ?? icons.equity}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <span style={{
          fontFamily: font.sans,
          fontSize: '13px',
          fontWeight: 700,
          color: color.textPrimary,
          transition: 'color 200ms ease',
          whiteSpace: 'nowrap',
        }}>
          {link.label}
        </span>
        <span style={{
          fontFamily: font.sans,
          fontSize: '11px',
          fontWeight: 400,
          color: color.textSecondary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {link.desc}
        </span>
      </div>
    </button>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

const HomeScreen: React.FC<Props> = ({ onNavigate }) => {
  const [showShortcuts, setShowShortcuts] = useState(false)
  const breakpoint = useBreakpoint()

  // Fetch market indices
  const { data: indices } = useQuery<IndexQuote[]>({
    queryKey: ['indices'],
    queryFn: fetchIndices,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  // Build a map for quick lookup
  const indexMap = React.useMemo(() => {
    const map: Record<string, IndexQuote> = {}
    if (indices) {
      for (const q of indices) {
        map[q.ticker] = q
      }
    }
    return map
  }, [indices])

  // Shift+? shortcut toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault()
        setShowShortcuts(prev => !prev)
      }
      if (e.key === 'Escape') {
        setShowShortcuts(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const marketLinks = QUICK_LINKS.filter(l => l.column === 'markets')
  const toolLinks = QUICK_LINKS.filter(l => l.column === 'tools')

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: color.bgBase,
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* ── Branding ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px 24px',
        position: 'relative',
        animation: 'fadeSlideUp 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        animationDelay: '0ms',
      }}>
        <div style={{
          fontFamily: font.sans,
          fontSize: breakpoint === 'compact' ? '24px' : '28px',
          fontWeight: 700,
          color: color.textPrimary,
          letterSpacing: '0.05em',
          lineHeight: 1,
          position: 'relative',
        }}>
          SPECTRA
        </div>
        <div style={{
          fontFamily: font.mono,
          fontSize: '12px',
          fontWeight: 400,
          color: color.textSecondary,
          letterSpacing: '0.1em',
          marginTop: '6px',
          position: 'relative',
        }}>
          TERMINAL
        </div>
      </div>

      {/* ── Market overview strip ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '0 32px 20px',
        animation: 'fadeSlideUp 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        animationDelay: '100ms',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginRight: '8px',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: font.sans,
            fontSize: '10px',
            fontWeight: 700,
            color: color.textTertiary,
            letterSpacing: '0.15em',
          }}>
            MARKET
          </span>
          <LiveDot size={5} color={indices ? color.accentPositive : color.textTertiary} active={!!indices} />
        </div>
        {INDEX_TICKERS.map(ticker => (
          <IndexTile key={ticker} quote={indexMap[ticker]} />
        ))}
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────────── */}
      <div style={{
        margin: '0 32px',
        height: '1px',
        background: color.borderSubtle,
      }} />

      {/* ── Quick access grid ──────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: breakpoint === 'compact' ? '1fr' : '1fr 1fr',
        gap: '12px',
        padding: '24px 32px',
      }}>
        {/* Left column: Markets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            fontFamily: font.sans,
            fontSize: '10px',
            fontWeight: 700,
            color: color.textTertiary,
            letterSpacing: '0.2em',
            marginBottom: '2px',
            animation: 'fadeSlideUp 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: '200ms',
          }}>
            MARKETS
          </div>
          {marketLinks.map((link, i) => (
            <QuickCard
              key={link.label}
              link={link}
              onNavigate={onNavigate}
              delay={200 + i * 30}
            />
          ))}
        </div>

        {/* Right column: Tools */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            fontFamily: font.sans,
            fontSize: '10px',
            fontWeight: 700,
            color: color.textTertiary,
            letterSpacing: '0.2em',
            marginBottom: '2px',
            animation: 'fadeSlideUp 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: '300ms',
          }}>
            TOOLS
          </div>
          {toolLinks.map((link, i) => (
            <QuickCard
              key={link.label}
              link={link}
              onNavigate={onNavigate}
              delay={300 + i * 30}
            />
          ))}
        </div>
      </div>

      {/* ── Bottom hint ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 32px',
        marginTop: 'auto',
        display: 'flex',
        justifyContent: 'flex-end',
      }}>
        <button
          onClick={() => setShowShortcuts(prev => !prev)}
          style={{
            background: 'none',
            border: `1px solid ${color.borderSubtle}`,
            color: color.textTertiary,
            fontFamily: font.mono,
            fontSize: '10px',
            cursor: 'pointer',
            padding: '3px 8px',
            letterSpacing: '0.05em',
            transition: 'border-color 200ms ease, color 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = color.borderMedium
            e.currentTarget.style.color = color.textSecondary
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = color.borderSubtle
            e.currentTarget.style.color = color.textTertiary
          }}
        >
          ? shortcuts
        </button>
      </div>

      {/* ── Shortcut tooltip ──────────────────────────────────────────────── */}
      <ShortcutTooltip visible={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  )
}

export default HomeScreen