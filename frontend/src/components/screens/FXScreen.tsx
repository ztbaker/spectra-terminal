import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFX } from '../../lib/api'
import type { FXPair } from '../../types'
import { usePolling } from '../../hooks/usePolling'
import LoadingBar from '../shared/LoadingBar'
import Sparkline from '../shared/Sparkline'
import theme from '../../lib/theme'
const { color, font } = theme

// ─── Formatting helpers ───────────────────────────────────────────────────────

function isJpyPair(pair: string): boolean {
  return pair.toUpperCase().includes('JPY')
}

function formatRate(rate: number | null, pair: string): string {
  if (rate == null) return '—'
  const decimals = isJpyPair(pair) ? 2 : 4
  return rate.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatDayRange(val: number | null, pair: string): string {
  if (val == null) return '—'
  const decimals = isJpyPair(pair) ? 2 : 4
  return val.toFixed(decimals)
}

// ─── FX Card ─────────────────────────────────────────────────────────────────

interface FXCardProps {
  pair: FXPair
}

const FXCard: React.FC<FXCardProps> = ({ pair }) => {
  const isPositive = (pair.change ?? 0) >= 0
  const sparkColor = isPositive ? color.accentPositive : color.accentNegative
  const changeColor = isPositive ? color.accentPositive : color.accentNegative

  const closeValues = pair.chart_data?.map(d => d.close) ?? []

  const changeSign = pair.change != null
    ? (pair.change >= 0 ? '+' : '')
    : ''

  const changePctSign = pair.change_pct != null
    ? (pair.change_pct >= 0 ? '+' : '')
    : ''

  return (
    <div
      className="bb-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '220px',
        minHeight: '160px',
        padding: 0,
        boxSizing: 'border-box',
        border: `1px solid ${color.borderSubtle}`,
        background: 'rgba(19, 22, 25, 0.6)',
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: '6px 10px 4px',
          borderBottom: `1px solid ${color.borderSubtle}`,
          background: 'rgba(19, 22, 25, 0.6)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: color.ticker, fontSize: '16px', fontWeight: 600, fontFamily: font.mono }}>
          {pair.label}
        </span>
      </div>

      {/* Card body */}
      <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>

        {/* Rate */}
        <div style={{ fontSize: '28px', color: color.textPrimary, fontWeight: 500, lineHeight: 1.1, fontFamily: font.mono }}>
          {formatRate(pair.rate, pair.pair)}
        </div>

        {/* Change row */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', fontFamily: font.mono }}>
          {pair.change != null ? (
            <span style={{ color: changeColor }}>
              {changeSign}{isJpyPair(pair.pair)
                ? pair.change.toFixed(2)
                : pair.change.toFixed(4)}
            </span>
          ) : (
            <span style={{ color: color.textTertiary }}>—</span>
          )}
          {pair.change_pct != null ? (
            <span style={{ color: changeColor }}>
              ({changePctSign}{pair.change_pct.toFixed(2)}%)
            </span>
          ) : (
            <span style={{ color: color.textTertiary }}>(—)</span>
          )}
        </div>

        {/* Day range */}
        <div style={{ fontSize: '11px', color: color.textTertiary, letterSpacing: '0.02em' }}>
          Lo:&nbsp;
          <span style={{ color: color.textSecondary, fontFamily: font.mono }}>
            {formatDayRange(pair.day_low, pair.pair)}
          </span>
          {'  '}
          Hi:&nbsp;
          <span style={{ color: color.textSecondary, fontFamily: font.mono }}>
            {formatDayRange(pair.day_high, pair.pair)}
          </span>
        </div>

      </div>

      {/* Sparkline — bottom of card */}
      {closeValues.length >= 2 && (
        <div style={{ flexShrink: 0, lineHeight: 0 }}>
          <Sparkline
            data={closeValues}
            width={220}
            height={40}
            color={sparkColor}
          />
        </div>
      )}
    </div>
  )
}

// ─── FX Skeleton placeholder ──────────────────────────────────────────────────

const FXCardSkeleton: React.FC = () => (
  <div
    style={{
      width: '220px',
      minHeight: '160px',
      border: `1px solid ${color.borderSubtle}`,
      background: 'rgba(19, 22, 25, 0.6)',
      padding: '10px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}
  >
    <div style={{ width: '80px', height: '16px', background: 'rgba(19, 22, 25, 0.6)', borderRadius: '2px' }} />
    <div style={{ width: '140px', height: '28px', background: 'rgba(19, 22, 25, 0.6)', borderRadius: '2px' }} />
    <div style={{ width: '100px', height: '12px', background: 'rgba(19, 22, 25, 0.6)', borderRadius: '2px' }} />
    <div style={{ width: '120px', height: '11px', background: 'rgba(19, 22, 25, 0.6)', borderRadius: '2px' }} />
    <div style={{ flex: 1 }} />
    <div style={{ width: '100%', height: '40px', background: 'rgba(19, 22, 25, 0.6)', borderRadius: '2px' }} />
  </div>
)

// ─── Main screen ─────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (cmd: string) => void
}

const FXScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fx'],
    queryFn: fetchFX,
    staleTime: 15_000,
  })

  usePolling(refetch, 15_000)

  const pairs = data?.pairs ?? []

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      {/* Loading bar */}
      <LoadingBar loading={isLoading} />

      {/* Screen header */}
      <div
        className="bb-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          padding: '6px 12px',
        }}
      >
        <span>FX MONITOR</span>
        <span style={{ color: color.textTertiary, fontSize: '11px' }}>
          AUTO-REFRESH 60s
          {data?.cached && (
            <span style={{ color: color.borderSubtle, marginLeft: '8px' }}>CACHED</span>
          )}
        </span>
      </div>

      {/* Error */}
      {error && !isLoading && (
        <div
          style={{
            padding: '8px 12px',
            color: color.accentNegative,
            fontSize: '12px',
            borderBottom: `1px solid ${color.borderSubtle}`,
            flexShrink: 0,
          }}
        >
          ERR: {(error as Error).message ?? 'Failed to load FX data'}
        </div>
      )}

      {/* Grid */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 220px)',
            gap: '10px',
            width: 'fit-content',
          }}
        >
          {isLoading && pairs.length === 0
            ? Array.from({ length: 9 }).map((_, i) => <FXCardSkeleton key={i} />)
            : pairs.map(pair => (
                <FXCard key={pair.pair} pair={pair} />
              ))}
        </div>
      </div>
    </div>
  )
}

export default FXScreen