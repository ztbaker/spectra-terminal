import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMemeCrypto } from '../../lib/api'
import type { CryptoAsset } from '../../types'
import { usePolling } from '../../hooks/usePolling'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'
const { color, font } = theme

const MONO: React.CSSProperties = { fontFamily: font.mono, letterSpacing: '0.03em' }
const UP_COLOR = color.accentPositive
const DOWN_COLOR = color.accentNegative
const FLAT_COLOR = color.textTertiary
const ROW_GRID = '100px 120px 100px 80px 100px 100px'

function fmtPrice(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  if (n >= 0.01) return '$' + n.toFixed(6)
  return '$' + n.toFixed(8)
}

function fmtPct(n: number | null): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function fmtChange(n: number | null): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  if (Math.abs(n) >= 1) return sign + n.toFixed(4)
  if (Math.abs(n) >= 0.01) return sign + n.toFixed(6)
  return sign + n.toFixed(8)
}

function fmtLarge(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  return '$' + n.toLocaleString()
}

const HeaderRow: React.FC = () => (
  <div style={{
    display: 'grid', gridTemplateColumns: ROW_GRID,
    padding: '4px 12px', gap: 0,
    borderBottom: `1px solid ${color.borderSubtle}`,
    ...MONO,
  }}>
    {['SYMBOL', 'LAST', 'CHG', '%CHG', 'MKT CAP', 'VOL 24H'].map(h => (
      <div key={h} style={{
        color: color.textTertiary, fontSize: 10,
        textAlign: h === 'SYMBOL' ? 'left' : 'right',
        paddingRight: h === 'SYMBOL' ? 0 : 8,
      }}>
        {h}
      </div>
    ))}
  </div>
)

const MemeRow: React.FC<{ asset: CryptoAsset }> = ({ asset }) => {
  const isUp = (asset.change ?? 0) > 0
  const isDown = (asset.change ?? 0) < 0
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
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: color.accentWarning, fontSize: 11, fontWeight: 700 }}>{asset.symbol}</span>
        {asset.name && (
          <span style={{ color: color.textTertiary, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {asset.name}
          </span>
        )}
      </div>
      <div style={{ color: color.textPrimary, fontSize: 11, fontWeight: 600, textAlign: 'right', paddingRight: 8 }}>
        {fmtPrice(asset.price)}
      </div>
      <div style={{ color: chgColor, fontSize: 11, textAlign: 'right', paddingRight: 8 }}>
        {fmtChange(asset.change)}
      </div>
      <div style={{ color: chgColor, fontSize: 12, fontWeight: 600, textAlign: 'right', paddingRight: 8 }}>
        {fmtPct(asset.change_pct)}
      </div>
      <div style={{ color: color.textTertiary, fontSize: 10, textAlign: 'right', paddingRight: 8 }}>
        {fmtLarge(asset.market_cap)}
      </div>
      <div style={{ color: color.textTertiary, fontSize: 10, textAlign: 'right', paddingRight: 8 }}>
        {fmtLarge(asset.volume)}
      </div>
    </div>
  )
}

interface Props {
  onNavigate: (cmd: string) => void
}

const MemeScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['crypto-meme'],
    queryFn: fetchMemeCrypto,
    staleTime: 15_000,
  })

  usePolling(refetch, 15_000)

  const assets = data?.assets ?? []
  const gainers = assets.filter(a => (a.change_pct ?? 0) >= 0).length
  const losers = assets.length - gainers

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      <div
        className="bb-header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, padding: '6px 12px' }}
      >
        <span>MEME COIN TRACKER</span>
        <span style={{ color: color.textTertiary, fontSize: '11px' }}>
          AUTO-REFRESH 15s
          {data?.cached && <span style={{ color: color.borderSubtle, marginLeft: '8px' }}>CACHED</span>}
        </span>
      </div>

      {error && !isLoading && (
        <div style={{ padding: '8px 12px', color: color.accentNegative, fontSize: '12px', borderBottom: `1px solid ${color.borderSubtle}`, flexShrink: 0 }}>
          ERR: {(error as Error).message ?? 'Failed to load meme coin data'}
        </div>
      )}

      {!isLoading && assets.length > 0 && (
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${color.borderSubtle}`, flexShrink: 0, flexWrap: 'wrap', rowGap: '4px' }}>
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
            {assets.length} COINS TRACKED
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <HeaderRow />
        {isLoading && assets.length === 0 && (
          <div style={{ padding: '20px 12px', color: color.borderSubtle, fontSize: 11 }}>
            FETCHING MEME COINS…
          </div>
        )}
        {assets.map(asset => <MemeRow key={asset.ticker} asset={asset} />)}
      </div>
    </div>
  )
}

export default MemeScreen
