import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'
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

// ─── Neon price flash hook (brightness-based) ──────────────────────────────────

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
    timerRef.current = setTimeout(() => setFlash('none'), 200)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  const filterValue =
    flash === 'up'
      ? 'brightness(2)'
      : flash === 'down'
        ? 'brightness(2)'
        : 'brightness(1)'

  const flashStyle: React.CSSProperties = {
    filter: filterValue,
    transition: 'filter 200ms ease-out',
  }

  return { flashStyle, triggerFlash }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Day/52W range bar with gradient fill and cyan position dot */
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
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ color: C.whiteDim, fontSize: '10px', fontFamily: C.fontMono, letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{ fontSize: '10px', fontFamily: C.fontMono }}>
          <span style={{ color: C.white }}>{formatPrice(low)}</span>
          <span style={{ color: C.whiteGhost, margin: '0 6px' }}>—</span>
          <span style={{ color: C.white }}>{formatPrice(high)}</span>
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: '3px',
          borderRadius: '2px',
          background: `linear-gradient(to right, ${C.amberDim}, ${C.amber}, ${C.amberDim})`,
          overflow: 'visible',
        }}
      >
        {pct != null && (
          <div
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: '-2.5px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: C.cyan,
              transform: 'translateX(-50%)',
              boxShadow: `0 0 6px ${C.cyanGlow.replace('0.12', '0.5')}`,
            }}
          />
        )}
      </div>
    </div>
  )
}

/** Single metric card for the 3x4 grid */
const MetricCard: React.FC<{
  label: string
  value: string
  accent?: boolean
}> = ({ label, value, accent = false }) => (
  <div
    style={{
      background: C.surface1,
      border: `1px solid ${C.border0}`,
      borderRadius: '4px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}
  >
    <span
      style={{
        color: C.whiteDim,
        fontSize: '10px',
        fontFamily: C.fontBody,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
    <span
      style={{
        color: accent ? C.cyan : C.white,
        fontSize: '14px',
        fontFamily: C.fontMono,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </span>
  </div>
)

/** Quick action pill button */
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
        background: hovered ? C.cyanGlow : C.surface2,
        color: hovered ? C.cyanBright : C.cyan,
        border: `1px solid ${C.cyanDim}`,
        borderRadius: '100px',
        padding: '6px 16px',
        fontSize: '11px',
        fontFamily: C.fontMono,
        fontWeight: 600,
        letterSpacing: '0.1em',
        cursor: 'pointer',
        boxShadow: hovered ? `0 0 8px ${C.cyanGlow}` : 'none',
        transition: 'background 150ms, color 150ms, box-shadow 150ms',
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
    { label: 'Volume', value: formatLarge(liveVolume) },
    { label: 'Avg Volume', value: formatLarge(equity?.avg_volume) },
    { label: 'Next Earnings', value: '—' },
    { label: 'Short Float', value: equity?.short_ratio != null ? formatPct(equity.short_ratio) : '—' },
    { label: 'Target Price', value: '—' },
    { label: 'Recommendation', value: '—' },
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
        <div
          style={{
            padding: '8px 16px',
            color: C.red,
            fontSize: '11px',
            fontFamily: C.fontMono,
            borderBottom: `1px solid ${C.redDim}`,
            background: C.surface1,
          }}
        >
          ERR: {(error as Error).message ?? 'Failed to load equity data'}
        </div>
      )}

      {/* ── TOP BAND ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${C.border0}`,
        }}
      >
        <span
          style={{
            fontFamily: C.fontDisplay,
            fontWeight: 700,
            fontSize: '24px',
            color: C.amber,
            letterSpacing: '0.03em',
          }}
        >
          {ticker}
        </span>
        {equity?.company_name && (
          <span
            style={{
              fontFamily: C.fontBody,
              fontWeight: 400,
              fontSize: '13px',
              color: C.whiteDim,
            }}
          >
            {equity.company_name}
          </span>
        )}
        {equity?.sector && (
          <span
            style={{
              background: C.surface2,
              color: C.cyan,
              border: `1px solid ${C.cyanDim}`,
              borderRadius: '100px',
              padding: '2px 10px',
              fontSize: '10px',
              fontFamily: C.fontMono,
              fontWeight: 500,
              letterSpacing: '0.06em',
            }}
          >
            {equity.sector}
          </span>
        )}
        <LiveDot active size={6} />
      </div>

      {/* ── PRICE HERO SECTION ─────────────────────────────────────────── */}
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.border0}` }}>
        {/* Price + Change */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '12px' }}>
          <span
            style={{
              fontFamily: C.fontMono,
              fontWeight: 700,
              fontSize: '36px',
              color: C.white,
              fontVariantNumeric: 'tabular-nums',
              ...neonFlashStyle,
            }}
          >
            {formatPrice(livePrice)}
          </span>
          {liveChange != null && typeof liveChange === 'number' && (
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <ChangeIndicator value={liveChange} decimals={2} size="md" />
            </span>
          )}
          {liveChangePct != null && typeof liveChangePct === 'number' && (
            <span
              style={{
                fontFamily: C.fontMono,
                fontSize: '13px',
                color: liveChangePct >= 0 ? C.green : C.red,
              }}
            >
              ({liveChangePct >= 0 ? '+' : ''}{(liveChangePct * 100).toFixed(2)}%)
            </span>
          )}
        </div>

        {/* Day range bar */}
        <RangeBar
          label="DAY"
          low={liveDayLow ?? null}
          high={liveDayHigh ?? null}
          current={livePrice ?? null}
        />

        {/* 52W range bar */}
        <RangeBar
          label="52W"
          low={equity?.low_52w ?? null}
          high={equity?.high_52w ?? null}
          current={livePrice ?? null}
        />
      </div>

      {/* ── SPARKLINE ──────────────────────────────────────────────────── */}
      {sparklineData.length >= 2 && (
        <div
          style={{
            padding: '10px 16px 8px',
            borderBottom: `1px solid ${C.border0}`,
          }}
        >
          <span
            style={{
              color: C.whiteGhost,
              fontSize: '10px',
              fontFamily: C.fontMono,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            5D PRICE
          </span>
          <div style={{ marginTop: '6px', textAlign: 'center' }}>
            <Sparkline
              data={sparklineData}
              width={280}
              height={60}
              color={isPositive ? C.greenBright : C.redBright}
            />
          </div>
        </div>
      )}

      {/* ── METRICS GRID (3x4) ─────────────────────────────────────────── */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border0}` }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
          }}
        >
          {metrics.map((m) => (
            <MetricCard key={m.label} label={m.label} value={m.value} accent={m.accent} />
          ))}
        </div>
      </div>

      {/* ── QUICK ACTIONS ROW ──────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '10px 16px',
          borderBottom: `1px solid ${C.border0}`,
          flexWrap: 'wrap',
        }}
      >
        {quickActions.map(({ label, cmd }) => (
          <ActionPill key={label} label={label} onClick={() => onNavigate(cmd)} />
        ))}
      </div>

      {/* ── COMPANY INFO (collapsible) ─────────────────────────────────── */}
      <div style={{ padding: '0 16px 16px' }}>
        <button
          onClick={() => setInfoExpanded(v => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: C.cyan,
            fontSize: '11px',
            fontFamily: C.fontMono,
            fontWeight: 600,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            padding: '10px 0 6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            outline: 'none',
          }}
        >
          INFO {infoExpanded ? '▲' : '▼'}
        </button>

        {infoExpanded && (
          <div
            style={{
              background: C.surface1,
              borderLeft: `2px solid ${C.cyan}`,
              borderRadius: '4px',
              padding: '12px 16px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px 24px',
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
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span
                  style={{
                    color: C.whiteDim,
                    fontSize: '10px',
                    fontFamily: C.fontBody,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    color: C.white,
                    fontSize: '12px',
                    fontFamily: C.fontBody,
                  }}
                >
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