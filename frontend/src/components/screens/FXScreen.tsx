import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFX } from '../../lib/api'
import type { FXPair } from '../../types'
import { usePolling } from '../../hooks/usePolling'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'
const { color, font } = theme

const MONO: React.CSSProperties = { fontFamily: font.mono, letterSpacing: '0.03em' }
const UP_COLOR = color.accentPositive
const DOWN_COLOR = color.accentNegative
const FLAT_COLOR = color.textTertiary
const ROW_GRID = '90px 110px 100px 80px 90px 90px'

function isJpyPair(pair: string): boolean {
  return pair.toUpperCase().includes('JPY')
}

function fmtRate(rate: number | null, pair: string): string {
  if (rate == null) return '—'
  const decimals = isJpyPair(pair) ? 2 : 4
  return rate.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtChange(n: number | null, pair: string): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  const decimals = isJpyPair(pair) ? 2 : 4
  return sign + n.toFixed(decimals)
}

function fmtPct(n: number | null): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

const HeaderRow: React.FC = () => (
  <div style={{
    display: 'grid', gridTemplateColumns: ROW_GRID,
    padding: '4px 12px', gap: 0,
    borderBottom: `1px solid ${color.borderSubtle}`,
    ...MONO,
  }}>
    {['PAIR', 'RATE', 'CHG', '%CHG', 'DAY LO', 'DAY HI'].map(h => (
      <div key={h} style={{
        color: color.textTertiary, fontSize: 10,
        textAlign: h === 'PAIR' ? 'left' : 'right',
        paddingRight: h === 'PAIR' ? 0 : 8,
      }}>
        {h}
      </div>
    ))}
  </div>
)

const FXRow: React.FC<{ pair: FXPair }> = ({ pair }) => {
  const isUp = (pair.change ?? 0) > 0
  const isDown = (pair.change ?? 0) < 0
  const chgColor = isUp ? UP_COLOR : isDown ? DOWN_COLOR : FLAT_COLOR

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: ROW_GRID,
        padding: '4px 12px', gap: 0,
        borderBottom: `1px solid ${color.bgElevated}`,
        alignItems: 'center',
        ...MONO,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = color.bgHover)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ color: color.textPrimary, fontSize: 11, fontWeight: 700 }}>{pair.label}</div>
      <div style={{ color: color.textPrimary, fontSize: 11, fontWeight: 600, textAlign: 'right', paddingRight: 8 }}>
        {fmtRate(pair.rate, pair.pair)}
      </div>
      <div style={{ color: chgColor, fontSize: 11, textAlign: 'right', paddingRight: 8 }}>
        {fmtChange(pair.change, pair.pair)}
      </div>
      <div style={{ color: chgColor, fontSize: 12, fontWeight: 600, textAlign: 'right', paddingRight: 8 }}>
        {fmtPct(pair.change_pct)}
      </div>
      <div style={{ color: color.textTertiary, fontSize: 10, textAlign: 'right', paddingRight: 8 }}>
        {pair.day_low != null ? fmtRate(pair.day_low, pair.pair) : '—'}
      </div>
      <div style={{ color: color.textTertiary, fontSize: 10, textAlign: 'right', paddingRight: 8 }}>
        {pair.day_high != null ? fmtRate(pair.day_high, pair.pair) : '—'}
      </div>
    </div>
  )
}

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
  const gainers = pairs.filter(p => (p.change_pct ?? 0) > 0).length
  const losers = pairs.filter(p => (p.change_pct ?? 0) < 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      <div
        className="bb-header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, padding: '6px 12px' }}
      >
        <span>FX MONITOR</span>
        <span style={{ color: color.textTertiary, fontSize: '11px' }}>
          AUTO-REFRESH 60s
          {data?.cached && <span style={{ color: color.borderSubtle, marginLeft: '8px' }}>CACHED</span>}
        </span>
      </div>

      {error && !isLoading && (
        <div style={{ padding: '8px 12px', color: color.accentNegative, fontSize: '12px', borderBottom: `1px solid ${color.borderSubtle}`, flexShrink: 0 }}>
          ERR: {(error as Error).message ?? 'Failed to load FX data'}
        </div>
      )}

      {!isLoading && pairs.length > 0 && (
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${color.borderSubtle}`, flexShrink: 0 }}>
          <div style={{ fontSize: '12px', display: 'flex', gap: '12px' }}>
            <span>
              <span className="bb-gain">{gainers}</span>
              <span style={{ color: color.textTertiary }}> UP</span>
            </span>
            <span>
              <span className="bb-loss">{losers}</span>
              <span style={{ color: color.textTertiary }}> DOWN</span>
            </span>
          </div>
          <div style={{ fontSize: '11px', color: color.textTertiary, marginLeft: 'auto' }}>
            {pairs.length} PAIRS
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <HeaderRow />
        {isLoading && pairs.length === 0 && (
          <div style={{ padding: '20px 12px', color: color.borderSubtle, fontSize: 11 }}>
            FETCHING FX RATES…
          </div>
        )}
        {pairs.map(pair => <FXRow key={pair.pair} pair={pair} />)}
      </div>
    </div>
  )
}

export default FXScreen
