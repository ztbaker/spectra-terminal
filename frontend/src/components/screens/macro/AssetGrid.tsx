import React from 'react'
import type { AssetScoreCard, BorderState } from './types'
import theme from '../../../lib/theme'
import TickerBadge from '../../shared/TickerBadge'

const { color, type, radius, font } = theme

const FACTOR_LABELS: Record<string, string> = {
  real_rate: 'REAL RATE',
  risk_appetite: 'RISK',
  dollar_liquidity: 'DOLLAR',
  growth_inflation: 'GROWTH',
}

const BORDER_COLORS: Record<BorderState, string> = {
  green: color.accentPositive,
  yellow: color.accentWarning,
  muted: color.borderSubtle,
}

function scoreColor(score: number): string {
  const clamped = Math.max(-2, Math.min(2, score))
  if (clamped === 0) return 'rgba(255, 255, 255, 0.08)'
  const abs = Math.abs(clamped)
  const t = abs / 2
  if (clamped > 0) {
    const r = Math.round(0 + (0 - 0) * t)
    const g = Math.round(200 + (217 - 200) * t)
    const b = Math.round(100 + (100 - 100) * t)
    const a = (0.35 + 0.65 * t).toFixed(2)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  } else {
    const r = Math.round(200 + (255 - 200) * t)
    const g = Math.round(80 + (82 - 80) * t)
    const b = Math.round(80 + (82 - 80) * t)
    const a = (0.35 + 0.65 * t).toFixed(2)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
}

function scoreTextColor(score: number): string {
  const clamped = Math.max(-2, Math.min(2, score))
  if (clamped === 0) return color.textTertiary
  const t = Math.abs(clamped) / 2
  if (clamped > 0) {
    return t > 0.5 ? color.accentPositive : color.textSecondary
  } else {
    return t > 0.5 ? color.accentNegative : color.textSecondary
  }
}

interface HorizonScoreBlockProps {
  score: number
  label: string
}

const HorizonScoreBlock: React.FC<HorizonScoreBlockProps> = ({ score, label }) => {
  const display = score > 0 ? `+${score.toFixed(0)}` : score === 0 ? '0' : score.toFixed(0)
  return (
    <div style={{
      width: 50,
      height: 36,
      borderRadius: radius.sm,
      background: scoreColor(score),
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <span style={{
        fontFamily: font.mono,
        fontSize: '13px',
        fontWeight: 700,
        color: scoreTextColor(score),
        lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {display}
      </span>
      <span style={{
        fontSize: '9px',
        color: color.textTertiary,
        lineHeight: 1.2,
        letterSpacing: '0.02em',
      }}>
        {label}
      </span>
    </div>
  )
}

interface AssetCardProps {
  card: AssetScoreCard
}

const AssetCard: React.FC<AssetCardProps> = ({ card }) => {
  const borderColor = BORDER_COLORS[card.border_state]
  const factorLabel = FACTOR_LABELS[card.dominant_factor] ?? card.dominant_factor.toUpperCase()
  const priceDisplay = card.price !== null
    ? card.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—'

  return (
    <div style={{
      background: color.bgElevated,
      borderRadius: radius.md,
      borderLeft: `4px solid ${borderColor}`,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minHeight: 200,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
      }}>
        <span style={{
          fontFamily: font.mono,
          fontSize: '14px',
          fontWeight: 700,
          color: color.ticker,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {card.asset}
        </span>
        <span style={{
          fontFamily: font.mono,
          fontSize: '14px',
          fontWeight: 400,
          color: color.textPrimary,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {priceDisplay}
        </span>
      </div>

      <div style={{
        display: 'flex',
        gap: 10,
        fontSize: '11px',
        color: color.textSecondary,
      }}>
        <span>1d <TickerBadge value={card.change_1d_pct} pct decimals={1} /></span>
        <span>5d <TickerBadge value={card.change_5d_pct} pct decimals={1} /></span>
        <span>21d <TickerBadge value={card.change_21d_pct} pct decimals={1} /></span>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <HorizonScoreBlock score={Math.round(card.score_5d)} label="5d" />
        <HorizonScoreBlock score={Math.round(card.score_10d)} label="10d" />
        <HorizonScoreBlock score={Math.round(card.score_21d)} label="21d" />
      </div>

      <div style={{
        ...type.caption,
        color: color.textTertiary,
        textTransform: 'none' as const,
      }}>
        IV Rank: {card.iv_rank !== null ? `${card.iv_rank}%` : 'N/A'}
      </div>

      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
      }}>
        <span style={{
          background: color.bgSurface,
          border: `1px solid ${color.borderSubtle}`,
          fontSize: '9px',
          padding: '2px 6px',
          borderRadius: radius.full,
          color: color.textSecondary,
          letterSpacing: '0.02em',
          fontWeight: 500,
        }}>
          {factorLabel}
        </span>
      </div>

      <div style={{
        ...type.bodySm,
        color: color.textSecondary,
      }}>
        {card.state_line}
      </div>
    </div>
  )
}

interface AssetGridProps {
  assets: Record<string, AssetScoreCard>
  loading?: boolean
}

const AssetGrid: React.FC<AssetGridProps> = ({ assets, loading }) => {
  const entries = Object.values(assets)

  if (!loading && entries.length === 0) {
    return (
      <div style={{
        ...type.bodySm,
        color: color.textTertiary,
        padding: 24,
        textAlign: 'center' as const,
      }}>
        No asset data
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: 12,
    }}>
      {entries.map(card => (
        <AssetCard key={card.asset} card={card} />
      ))}
    </div>
  )
}

export default AssetGrid