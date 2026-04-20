import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import theme from '../../lib/theme'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { fetchEquity, fetchChart } from '../../lib/api'
import { useLivePrice } from '../../hooks/useLivePrice'
import ChangeIndicator from '../shared/ChangeIndicator'
import LiveDot from '../shared/LiveDot'
import Sparkline from '../shared/Sparkline'
import LoadingBar from '../shared/LoadingBar'

const { color, font } = theme

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

// ─── Price flash hook ──────────────────────────────────────────────────────────

function usePriceFlashStyle(): {
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
    transition: 'color 300ms ease-out',
    color: flash === 'up'
      ? color.accentPositive
      : flash === 'down'
      ? color.accentNegative
      : color.textPrimary,
  }

  return { flashStyle, triggerFlash }
}

// ─── Range bar ─────────────────────────────────────────────────────────────────

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
          color: color.textSecondary,
          fontSize: '11px',
          fontFamily: font.sans,
          fontWeight: 500,
        }}>
          {label}
        </span>
        <span style={{ fontSize: '12px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: color.textPrimary }}>{formatPrice(low)}</span>
          <span style={{ color: color.textTertiary, margin: '0 8px' }}>—</span>
          <span style={{ color: color.textPrimary }}>{formatPrice(high)}</span>
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: '3px',
          borderRadius: '4px',
          background: color.borderSubtle,
          overflow: 'visible',
        }}
      >
        {pct != null && (
          <div
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: '-4px',
              width: '11px',
              height: '11px',
              borderRadius: '50%',
              background: color.textPrimary,
              transform: 'translateX(-50%)',
              border: `1px solid ${color.borderMedium}`,
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Metric card ───────────────────────────────────────────────────────────────

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
        background: hovered ? color.bgHover : color.bgElevated,
        border: `1px solid ${color.borderSubtle}`,
        borderRadius: '8px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        transition: 'background 150ms ease',
      }}
    >
      <span
        style={{
          color: color.textSecondary,
          fontSize: '11px',
          fontFamily: font.sans,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: accent ? (accentColor ?? color.accentInfo) : color.textPrimary,
          fontSize: '15px',
          fontFamily: font.mono,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Action pill ───────────────────────────────────────────────────────────────

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
        background: hovered ? color.bgSurface : color.bgElevated,
        color: hovered ? color.textPrimary : color.textSecondary,
        border: `1px solid ${hovered ? color.borderMedium : color.borderSubtle}`,
        borderRadius: '100px',
        padding: '7px 18px',
        fontSize: '12px',
        fontFamily: font.mono,
        fontWeight: 600,
        letterSpacing: '0.04em',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        outline: 'none',
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
  const changeColor = isPositive ? color.accentPositive : color.accentNegative
  const volumeHighlight = liveVolume != null && equity?.avg_volume != null && liveVolume > equity.avg_volume * 2

  // ── Price flash ──
  const { flashStyle: priceFlashStyle, triggerFlash } = usePriceFlashStyle()
  const prevPriceRef = useRef<number | null>(null)
  useEffect(() => {
    if (livePrice != null && typeof livePrice === 'number') {
      triggerFlash(livePrice, prevPriceRef.current)
      prevPriceRef.current = livePrice
    }
  }, [livePrice, triggerFlash])

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
    { label: 'Recommendation', value: equity?.recommendation ? equity.recommendation : '—' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'transparent',
        overflow: 'auto',
      }}
    >
      {/* Loading bar */}
      <LoadingBar loading={isLoading} />

      {/* Error */}
      {error && !isLoading && (
        <div style={{
          padding: '10px 16px',
          color: color.accentNegative,
          fontSize: '12px',
          fontFamily: font.sans,
          borderBottom: `1px solid ${color.accentNegativeDim}`,
          background: color.accentNegativeDim,
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
          fontFamily: font.mono,
          fontWeight: 700,
          fontSize: '24px',
          color: color.ticker,
          letterSpacing: '0.02em',
        }}>
          {ticker}
        </span>
        {equity?.company_name && (
          <span style={{
            fontFamily: font.sans,
            fontWeight: 400,
            fontSize: '14px',
            color: color.textSecondary,
          }}>
            {equity.company_name}
          </span>
        )}
        {equity?.sector && (
          <span style={{
            background: color.bgSurface,
            color: color.textSecondary,
            border: `1px solid ${color.borderSubtle}`,
            borderRadius: '100px',
            padding: '3px 12px',
            fontSize: '11px',
            fontFamily: font.sans,
            fontWeight: 500,
          }}>
            {equity.sector}
          </span>
        )}
        <LiveDot active size={7} />
      </div>

      {/* ── PRICE HERO ── */}
      <div style={{
        margin: '0 20px 16px',
        padding: '20px 24px 16px',
        background: 'rgba(19, 22, 25, 0.6)',
        borderRadius: '8px',
        border: `1px solid ${color.borderSubtle}`,
      }}>
        {/* Price + Change */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginBottom: '16px' }}>
          <span
            style={{
              fontFamily: font.mono,
              fontWeight: 600,
              fontSize: isCompact ? '24px' : isExpanded ? '42px' : '32px',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              ...priceFlashStyle,
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
                fontFamily: font.mono,
                fontSize: '14px',
                fontWeight: 500,
                color: changeColor,
              }}
            >
              ({liveChangePct >= 0 ? '+' : ''}{liveChangePct.toFixed(2)}%)
            </span>
          )}
        </div>

        {/* Range bars */}
        <RangeBar
          label="Day range"
          low={liveDayLow ?? null}
          high={liveDayHigh ?? null}
          current={livePrice ?? null}
        />
        <RangeBar
          label="52-week range"
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
          background: 'rgba(19, 22, 25, 0.6)',
          borderRadius: '8px',
          border: `1px solid ${color.borderSubtle}`,
        }}>
          <span style={{
            color: color.textTertiary,
            fontSize: '11px',
            fontFamily: font.sans,
            fontWeight: 500,
          }}>
            5D price action
          </span>
          <div style={{ marginTop: '8px', textAlign: 'center' }}>
            <Sparkline
              data={sparklineData}
              width={320}
              height={70}
              color={isPositive ? color.accentPositive : color.accentNegative}
            />
          </div>
        </div>
      )}

      {/* ── METRICS GRID (3x4) ── */}
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '8px',
        }}>
          {metrics.map((m) => (
            <MetricCard
              key={m.label}
              label={m.label}
              value={m.value}
              accent={m.accent}
              accentColor={m.label === 'Volume' && volumeHighlight ? color.accentPositive : undefined}
            />
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
        {quickActions.map(({ label, cmd }) => (
          <ActionPill key={label} label={label} onClick={() => onNavigate(cmd)} />
        ))}
      </div>

      {/* ── COMPANY INFO (collapsible) ── */}
      <div style={{ padding: '0 20px 20px' }}>
        <button
          onClick={() => setInfoExpanded(v => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: color.textSecondary,
            fontSize: '12px',
            fontFamily: font.sans,
            fontWeight: 500,
            cursor: 'pointer',
            padding: '12px 0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            outline: 'none',
          }}
        >
          Company info {infoExpanded ? '▲' : '▼'}
        </button>

        {infoExpanded && (
          <div
            style={{
              background: 'rgba(19, 22, 25, 0.6)',
              border: `1px solid ${color.borderSubtle}`,
              borderLeft: `3px solid ${color.borderMedium}`,
              borderRadius: '8px',
              padding: '16px 20px',
              display: 'grid',
              gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr',
              gap: '12px 28px',
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
                  color: color.textSecondary,
                  fontSize: '11px',
                  fontFamily: font.sans,
                  fontWeight: 500,
                }}>
                  {label}
                </span>
                <span style={{
                  color: color.textPrimary,
                  fontSize: '13px',
                  fontFamily: font.sans,
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
