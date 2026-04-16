import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { fetchEquity, fetchChart } from '../../lib/api'
import { useLivePrice } from '../../hooks/useLivePrice'
import ChangeIndicator from '../shared/ChangeIndicator'
import LiveDot from '../shared/LiveDot'
import Sparkline from '../shared/Sparkline'
import LoadingBar from '../shared/LoadingBar'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatPrice(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—'
  return n.toFixed(decimals)
}

function formatLarge(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T'
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toFixed(2)
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return (n * 100).toFixed(2) + '%'
}

// ─── Neon price flash hook ──────────────────────────────────────────────────

function useNeonFlash(): {
  flashStyle: React.CSSProperties
  triggerFlash: (value: number, prevValue?: number | null) => void
} {
  const [flash, setFlash] = useState<'none' | 'up' | 'down'>('none')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const triggerFlash = useCallback((value: number, prevValue?: number | null) => {
    if (prevValue == null || value === prevValue) return
    clearTimer()
    const next: 'up' | 'down' = value > prevValue ? 'up' : 'down'
    setFlash(next)
    timerRef.current = setTimeout(() => setFlash('none'), 300)
  }, [clearTimer])

  useEffect(() => () => clearTimer(), [clearTimer])

  const flashStyle: React.CSSProperties = {
    filter: flash !== 'none' ? 'brightness(2.5) saturate(1.5)' : 'brightness(1) saturate(1)',
    transition: 'filter 300ms ease-out',
  }

  return { flashStyle, triggerFlash }
}

// ─── Range bar with gradient and glowing position dot ─────────────────────────

const RangeBar: React.FC<{
  low: number | null
  high: number | null
  current: number | null
  label: string
}> = ({ low, high, current, label }) => {
  const pct =
    low != null && high != null && current != null && high !== low
      ? Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100))
      : null

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{
          color: C.whiteDim,
          fontSize: '9px',
          fontFamily: C.fontDisplay,
          letterSpacing: '0.08em',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          {label}
        </span>
        <span style={{ fontSize: '10px', fontFamily: C.fontMono, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: C.white }}>{formatPrice(low)}</span>
          <span style={{ color: C.whiteGhost, margin: '0 8px' }}>—</span>
          <span style={{ color: C.white }}>{formatPrice(high)}</span>
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: '4px',
          borderRadius: '4px',
          // Gradient fill
          background: `linear-gradient(to right, ${C.amberDim}30, ${C.amber}80, ${C.amberDim}30)`,
          overflow: 'visible',
          boxShadow: `0 0 4px ${C.amberGlow}`,
        }}
      >
        {pct != null && (
          <div
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: '-4px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: C.cyan,
              transform: 'translateX(-50%)',
              boxShadow: `0 0 12px ${C.cyanGlow.replace('0.15', '0.6')}, 0 0 4px ${C.cyan}`,
              border: `1px solid ${C.cyanBright}`,
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Metric card — glassmorphic with hover effect ────────────────────────────

const MetricCard: React.FC<{
  label: string
  value: string
  accent?: boolean
  accentColor?: string
}> = ({ label, value, accent = false, accentColor }) => {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // Glass card
        background: hovered ? C.glassHover : C.glass,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${hovered ? C.glassBorderHover : C.glassBorder}`,
        borderRadius: '8px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        transition: 'all 200ms ease',
        boxShadow: hovered ? C.shadow1 : 'none',
      }}
    >
      <span
        style={{
          color: C.whiteDim,
          fontSize: '9px',
          fontFamily: C.fontDisplay,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: accent ? (accentColor ?? C.cyan) : C.white,
          fontSize: '15px',
          fontFamily: C.fontMono,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Action pill — gradient border with glow ─────────────────────────────────

const ActionPill: React.FC<{
  label: string
  onClick: () => void
}> = ({ label, onClick }) => {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? C.cyanGlow : C.glass,
        color: hovered ? C.cyanBright : C.cyan,
        border: `1px solid ${hovered ? C.cyan : C.cyanDim}40`,
        borderRadius: '100px',
        padding: '7px 18px',
        fontSize: '10px',
        fontFamily: C.fontMono,
        fontWeight: 700,
        letterSpacing: '0.12em',
        cursor: 'pointer',
        boxShadow: hovered ? `0 0 16px ${C.cyanGlow}` : 'none',
        transition: 'all 200ms ease',
        outline: 'none',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {label}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

const EquityScreenV3: React.FC<Props> = ({ ticker, onNavigate }) => {
  const [infoExpanded, setInfoExpanded] = useState(false)
  const bp = useBreakpoint()
  const isCompact = bp === 'compact'
  const isExpanded = bp === 'expanded'

  // ── Data fetching ──
  const { data: equity, isLoading, error } = useQuery({
    queryKey: ['equity', ticker],
    queryFn: () => fetchEquity(ticker),
    staleTime: 60_000,
  })

  const { data: liveData } = useLivePrice(ticker, 500, true)

  const { data: chartData } = useQuery({
    queryKey: ['chart', ticker, '5d', '15m'],
    queryFn: () => fetchChart(ticker, '5d', '15m'),
    staleTime: 60_000,
    enabled: !!ticker,
  })

  const sparklineData: number[] = chartData?.ohlcv?.map(b => b.close) ?? []

  // ── Derived live values ──
  const livePrice = liveData?.price ?? equity?.price
  const liveChange = liveData?.change ?? equity?.change
  const liveChangePct = liveData?.change_pct ?? equity?.change_pct
  const liveDayHigh = liveData?.day_high ?? equity?.day_high
  const liveDayLow = liveData?.day_low ?? equity?.day_low
  const liveVolume = liveData?.volume ?? equity?.volume

  const isPositive = (liveChange ?? 0) >= 0
  const changePctAbs = Math.abs(liveChangePct ?? 0)
  const isBigMove = changePctAbs > 3
  const isHugeMove = changePctAbs > 5
  const changeColor = isPositive
    ? (isBigMove ? C.greenBright : C.green)
    : (isBigMove ? C.redBright : C.red)
  const volumeHighlight = liveVolume != null && equity?.avg_volume != null && liveVolume > equity.avg_volume * 2

  // ── Neon price flash ──
  const { flashStyle: neonFlashStyle, triggerFlash: triggerNeonFlash } = useNeonFlash()
  const prevPriceRef = useRef<number | null>(null)
  useEffect(() => {
    if (livePrice != null && typeof livePrice === 'number') {
      triggerNeonFlash(livePrice, prevPriceRef.current)
      prevPriceRef.current = livePrice
    }
  }, [livePrice, triggerNeonFlash])

  // ── Quick actions ──
  const quickActions = [
    { label: 'GP', cmd: `${ticker} GP` },
    { label: 'OPT', cmd: `${ticker} OPT` },
    { label: 'NEWS', cmd: `${ticker} NEWS` },
    { label: 'FILINGS', cmd: `${ticker} FILINGS` },
    { label: 'QUANT', cmd: `${ticker} QUANT` },
  ]

  // ── Metrics grid data ──
  const metrics: { label: string; value: string; accent?: boolean }[] = [
    { label: 'P/E', value: formatPrice(equity?.pe_ratio) },
    { label: 'EPS', value: formatPrice(equity?.eps) },
    { label: 'Mkt Cap', value: formatLarge(equity?.market_cap) },
    { label: '52W Range', value: `${formatPrice(equity?.low_52w)} — ${formatPrice(equity?.high_52w)}` },
    { label: 'Div Yield', value: equity?.dividend_yield != null ? formatPct(equity.dividend_yield) : '—' },
    { label: 'Beta', value: formatPrice(equity?.beta) },
    { label: 'Volume', value: formatLarge(liveVolume), accent: volumeHighlight },
    { label: 'Avg Volume', value: formatLarge(equity?.avg_volume) },
    { label: 'Next Earnings', value: equity?.next_earnings || '—' },
    { label: 'Short Float', value: equity?.short_ratio != null ? equity.short_ratio.toFixed(1) : '—' },
    { label: 'Target Price', value: formatPrice(equity?.target_price) },
    { label: 'Recommendation', value: equity?.recommendation ? equity.recommendation.toUpperCase() : '—' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: C.surface0,
        overflow: 'auto',
      }}
    >
      {/* Loading bar */}
      <LoadingBar loading={isLoading} />

      {/* Error */}
      {error && !isLoading && (
        <div style={{
          padding: '10px 16px',
          color: C.red,
          fontSize: '11px',
          fontFamily: C.fontMono,
          borderBottom: `1px solid ${C.redDim}`,
          background: C.redGlow,
        }}>
          ERR: {(error as Error).message ?? 'Failed to load equity data'}
        </div>
      )}

      {/* ── TOP BAND — ticker + sector + live dot ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '16px 20px 12px',
      }}>
        <span style={{
          fontFamily: C.fontDisplay,
          fontWeight: 700,
          fontSize: '28px',
          color: C.amber,
          letterSpacing: '0.04em',
          textShadow: `0 0 20px ${C.amberGlow}`,
        }}>
          {ticker}
        </span>
        {equity?.company_name && (
          <span style={{
            fontFamily: C.fontBody,
            fontWeight: 400,
            fontSize: '14px',
            color: C.whiteDim,
          }}>
            {equity.company_name}
          </span>
        )}
        {equity?.sector && (
          <span style={{
            background: C.glass,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            color: C.cyan,
            border: `1px solid ${C.cyanDim}50`,
            borderRadius: '100px',
            padding: '3px 12px',
            fontSize: '10px',
            fontFamily: C.fontDisplay,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            {equity.sector}
          </span>
        )}
        <LiveDot active size={7} />
      </div>

      {/* ── PRICE HERO — dramatic glass section ── */}
      <div style={{
        margin: '0 20px 16px',
        padding: '20px 24px 16px',
        // Glass card
        background: C.glass,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: '12px',
        border: `1px solid ${C.glassBorder}`,
        boxShadow: C.shadow2,
      }}>
        {/* Price + Change */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginBottom: '16px' }}>
          <span
            style={{
              fontFamily: C.fontMono,
              fontWeight: 700,
              fontSize: isCompact ? '24px' : isExpanded ? '42px' : '32px',
              color: C.white,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              ...neonFlashStyle,
            }}
          >
            {formatPrice(livePrice)}
          </span>
          {liveChange != null && typeof liveChange === 'number' && (
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <ChangeIndicator value={liveChange} decimals={2} size="md" bright={isBigMove} />
            </span>
          )}
          {liveChangePct != null && typeof liveChangePct === 'number' && (
            <span
              style={{
                fontFamily: C.fontMono,
                fontSize: '14px',
                fontWeight: 600,
                color: changeColor,
                animation: isHugeMove ? 'neonFlash 600ms ease-out' : 'none',
              }}
            >
              ({liveChangePct >= 0 ? '+' : ''}{liveChangePct.toFixed(2)}%)
            </span>
          )}
        </div>

        {/* Range bars */}
        <RangeBar
          label="Day Range"
          low={liveDayLow ?? null}
          high={liveDayHigh ?? null}
          current={livePrice ?? null}
        />
        <RangeBar
          label="52W Range"
          low={equity?.low_52w ?? null}
          high={equity?.high_52w ?? null}
          current={livePrice ?? null}
        />
      </div>

      {/* ── SPARKLINE ── */}
      {sparklineData.length >= 2 && (
        <div style={{
          margin: '0 20px 16px',
          padding: '12px 16px',
          background: C.glass,
          borderRadius: '8px',
          border: `1px solid ${C.glassBorder}`,
        }}>
          <span style={{
            color: C.whiteGhost,
            fontSize: '9px',
            fontFamily: C.fontDisplay,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}>
            5D Price Action
          </span>
          <div style={{ marginTop: '8px', textAlign: 'center' }}>
            <Sparkline
              data={sparklineData}
              width={320}
              height={70}
              color={isPositive ? C.greenBright : C.redBright}
            />
          </div>
        </div>
      )}

      {/* ── METRICS GRID (3x4) — glass cards ── */}
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '8px',
        }}>
          {metrics.map((m, i) => (
            <div key={m.label} style={{ animation: 'fadeSlideUp 300ms ease both', animationDelay: `${Math.min(i * 30, 500)}ms` }}>
              <MetricCard label={m.label} value={m.value} accent={m.accent} accentColor={m.label === 'Volume' && volumeHighlight ? C.cyanBright : undefined} />
            </div>
          ))}
        </div>
      </div>

      {/* ── QUICK ACTIONS ROW ── */}
      <div style={{
        display: 'flex',
        gap: '6px',
        padding: '0 20px 16px',
        flexWrap: 'wrap',
      }}>
        {quickActions.map(({ label, cmd }, i) => (
          <div key={label} style={{ animation: 'fadeSlideUp 300ms ease both', animationDelay: `${Math.min(i * 30, 500)}ms` }}>
            <ActionPill label={label} onClick={() => onNavigate(cmd)} />
          </div>
        ))}
      </div>

      {/* ── COMPANY INFO (collapsible) ── */}
      <div style={{ padding: '0 20px 20px' }}>
        <button
          onClick={() => setInfoExpanded(v => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: C.cyan,
            fontSize: '10px',
            fontFamily: C.fontMono,
            fontWeight: 700,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            padding: '12px 0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            outline: 'none',
            textTransform: 'uppercase',
          }}
        >
          Company Info {infoExpanded ? '▲' : '▼'}
        </button>

        {infoExpanded && (
          <div
            style={{
              // Glass panel
              background: C.glass,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${C.glassBorder}`,
              borderLeft: `3px solid ${C.cyan}`,
              borderRadius: '8px',
              padding: '16px 20px',
              display: 'grid',
              gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr',
              gap: '12px 28px',
              boxShadow: C.shadow1,
            }}
          >
            {[
              { label: 'Sector', value: equity?.sector },
              { label: 'Industry', value: equity?.industry },
              { label: 'CEO', value: equity?.ceo },
              { label: 'Employees', value: equity?.employees != null ? equity.employees.toLocaleString() : '—' },
              { label: 'Website', value: equity?.website },
              { label: 'Exchange', value: equity?.exchange },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{
                  color: C.whiteDim,
                  fontSize: '9px',
                  fontFamily: C.fontDisplay,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}>
                  {label}
                </span>
                <span style={{
                  color: C.white,
                  fontSize: '12px',
                  fontFamily: C.fontBody,
                }}>
                  {value ?? '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default EquityScreenV3