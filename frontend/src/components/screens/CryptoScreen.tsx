import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCrypto } from '../../lib/api'
import type { CryptoAsset } from '../../types'
import { usePolling } from '../../hooks/usePolling'
import LoadingBar from '../shared/LoadingBar'
import TickerBadge from '../shared/TickerBadge'

// ─── Formatting helpers ───────────────────────────────────────────────────────

const formatPrice = (n: number | null, decimals = 2): string => {
  if (n == null) return '—'
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

const formatLarge = (n: number | null): string => {
  if (n == null) return '—'
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M'
  return '$' + n.toLocaleString()
}

function getPriceDecimals(price: number | null): number {
  if (price == null) return 2
  // BTC/ETH tier: ≥ $100 → 2 decimals
  if (price >= 100) return 2
  // mid-tier: $10–$100 → 2 decimals
  if (price >= 10) return 2
  // sub-$10 altcoins → 4 decimals
  return 4
}

// ─── Crypto Card ─────────────────────────────────────────────────────────────

interface CryptoCardProps {
  asset: CryptoAsset
}

const CryptoCard: React.FC<CryptoCardProps> = ({ asset }) => {
  const isPositive = (asset.change ?? 0) >= 0
  const barColor = isPositive ? '#00ff41' : '#ff3333'
  const decimals = getPriceDecimals(asset.price)

  return (
    <div
      className="bb-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '200px',
        minHeight: '140px',
        padding: 0,
        boxSizing: 'border-box',
        border: '1px solid #2a2a2a',
        background: '#0d0d0d',
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: '6px 10px 4px',
          borderBottom: '1px solid #2a2a2a',
          background: '#1a1a00',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'baseline',
          gap: '6px',
        }}
      >
        <span style={{ color: '#ff9900', fontSize: '16px', fontWeight: 700, letterSpacing: '0.04em' }}>
          {asset.symbol}
        </span>
        <span style={{ color: '#554400', fontSize: '11px' }}>
          {asset.ticker}
        </span>
      </div>

      {/* Card body */}
      <div
        style={{
          padding: '8px 10px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
        }}
      >
        {/* Price */}
        <div style={{ fontSize: '22px', color: '#e0e0e0', fontWeight: 500, lineHeight: 1.1 }}>
          {formatPrice(asset.price, decimals)}
        </div>

        {/* Change badges */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', flexWrap: 'wrap' }}>
          <TickerBadge value={asset.change} decimals={decimals} prefix="$" />
          <TickerBadge value={asset.change_pct} pct decimals={2} />
        </div>

        {/* Market cap */}
        <div style={{ fontSize: '11px' }}>
          <span style={{ color: '#554400' }}>MKT CAP </span>
          <span style={{ color: '#cc7700' }}>{formatLarge(asset.market_cap)}</span>
        </div>

        {/* Volume */}
        <div style={{ fontSize: '11px' }}>
          <span style={{ color: '#554400' }}>VOL&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span>
          <span style={{ color: '#cc7700' }}>{formatLarge(asset.volume)}</span>
        </div>
      </div>

      {/* Color bar at bottom */}
      <div
        style={{
          height: '3px',
          width: '100%',
          background: barColor,
          flexShrink: 0,
        }}
      />
    </div>
  )
}

// ─── Skeleton placeholder ─────────────────────────────────────────────────────

const CryptoCardSkeleton: React.FC = () => (
  <div
    style={{
      width: '200px',
      minHeight: '140px',
      border: '1px solid #2a2a2a',
      background: '#0d0d0d',
      padding: '10px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}
  >
    <div style={{ width: '60px', height: '16px', background: '#1a1a00', borderRadius: '2px' }} />
    <div style={{ width: '130px', height: '22px', background: '#1a1200', borderRadius: '2px' }} />
    <div style={{ width: '90px', height: '12px', background: '#0d0d00', borderRadius: '2px' }} />
    <div style={{ width: '110px', height: '11px', background: '#0d0d00', borderRadius: '2px' }} />
    <div style={{ width: '100px', height: '11px', background: '#0d0d00', borderRadius: '2px' }} />
    <div style={{ flex: 1 }} />
    <div style={{ width: '100%', height: '3px', background: '#1a1a00', borderRadius: '1px' }} />
  </div>
)

// ─── Summary row ─────────────────────────────────────────────────────────────

interface SummaryRowProps {
  assets: CryptoAsset[]
}

const SummaryRow: React.FC<SummaryRowProps> = ({ assets }) => {
  const totalMarketCap = assets.reduce((sum, a) => {
    return sum + (a.market_cap ?? 0)
  }, 0)

  const totalVolume = assets.reduce((sum, a) => {
    return sum + (a.volume ?? 0)
  }, 0)

  const gainers = assets.filter(a => (a.change_pct ?? 0) >= 0).length
  const losers  = assets.filter(a => (a.change_pct ?? 0) < 0).length

  return (
    <div
      style={{
        display: 'flex',
        gap: '32px',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid #2a2a2a',
        flexShrink: 0,
        flexWrap: 'wrap',
        rowGap: '4px',
      }}
    >
      <div style={{ fontSize: '13px' }}>
        <span style={{ color: '#554400' }}>TOTAL MARKET CAP: </span>
        <span style={{ color: '#ff9900', fontWeight: 700, letterSpacing: '0.04em' }}>
          {formatLarge(totalMarketCap)}
        </span>
      </div>
      <div style={{ fontSize: '12px' }}>
        <span style={{ color: '#554400' }}>24H VOL: </span>
        <span style={{ color: '#cc7700' }}>{formatLarge(totalVolume)}</span>
      </div>
      <div style={{ fontSize: '12px', marginLeft: 'auto', display: 'flex', gap: '12px' }}>
        <span>
          <span className="bb-gain">{gainers}</span>
          <span style={{ color: '#554400' }}> UP</span>
        </span>
        <span>
          <span className="bb-loss">{losers}</span>
          <span style={{ color: '#554400' }}> DOWN</span>
        </span>
      </div>
    </div>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (cmd: string) => void
}

const CryptoScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['crypto'],
    queryFn: fetchCrypto,
    staleTime: 15_000,
  })

  usePolling(refetch, 15_000)

  const assets = data?.assets ?? []

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#000000',
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
        <span>CRYPTO MONITOR</span>
        <span style={{ color: '#554400', fontSize: '11px' }}>
          AUTO-REFRESH 60s
          {data?.cached && (
            <span style={{ color: '#2a2a2a', marginLeft: '8px' }}>CACHED</span>
          )}
        </span>
      </div>

      {/* Error */}
      {error && !isLoading && (
        <div
          style={{
            padding: '8px 12px',
            color: '#ff3333',
            fontSize: '12px',
            borderBottom: '1px solid #2a2a2a',
            flexShrink: 0,
          }}
        >
          ERR: {(error as Error).message ?? 'Failed to load crypto data'}
        </div>
      )}

      {/* Summary row */}
      {!isLoading && assets.length > 0 && <SummaryRow assets={assets} />}

      {/* Skeleton summary row placeholder */}
      {isLoading && assets.length === 0 && (
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #2a2a2a',
            flexShrink: 0,
            display: 'flex',
            gap: '32px',
          }}
        >
          <div style={{ width: '200px', height: '16px', background: '#1a1a00', borderRadius: '2px' }} />
          <div style={{ width: '120px', height: '16px', background: '#0d0d00', borderRadius: '2px' }} />
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
            gridTemplateColumns: 'repeat(4, 200px)',
            gap: '10px',
            width: 'fit-content',
          }}
        >
          {isLoading && assets.length === 0
            ? Array.from({ length: 8 }).map((_, i) => <CryptoCardSkeleton key={i} />)
            : assets.map(asset => (
                <CryptoCard key={asset.ticker} asset={asset} />
              ))}
        </div>
      </div>
    </div>
  )
}

export default CryptoScreen
