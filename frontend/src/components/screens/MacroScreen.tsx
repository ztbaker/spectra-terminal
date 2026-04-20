import Panel from '../Terminal/Panel'
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMacroDashboard, fetchEcon } from '../../lib/api'
import type { MacroCard, EconSeries, EconObservation } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import Sparkline from '../shared/Sparkline'
import TickerBadge from '../shared/TickerBadge'
import theme from '../../lib/theme'

const { color, font } = theme

interface Props {
  onNavigate: (cmd: string) => void
}

// ─── SVG line chart for expanded card ────────────────────────────────────────

interface LineChartProps {
  series: EconSeries
  width?: number
  height?: number
}

const EconLineChart: React.FC<LineChartProps> = ({
  series,
  width = 480,
  height = 200,
}) => {
  const obs = series.observations.filter(
    (o): o is EconObservation & { value: number } => typeof o.value === 'number' && isFinite(o.value)
  )
  if (obs.length < 2) {
    return (
      <div style={{ color: color.textTertiary, padding: 8, fontSize: 11 }}>
        Insufficient data to render chart.
      </div>
    )
  }

  const PAD = { top: 16, right: 16, bottom: 36, left: 52 }
  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom

  const values = obs.map(o => o.value)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const rangeV = maxV - minV || 1

  const firstDate = new Date(obs[0].date).getTime()
  const lastDate = new Date(obs[obs.length - 1].date).getTime()
  const rangeT = lastDate - firstDate || 1

  const toX = (date: string) =>
    PAD.left + ((new Date(date).getTime() - firstDate) / rangeT) * innerW
  const toY = (v: number) =>
    PAD.top + innerH - ((v - minV) / rangeV) * innerH

  const pathParts = obs.map((o, i) => {
    const x = toX(o.date).toFixed(2)
    const y = toY(o.value).toFixed(2)
    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
  })
  const d = pathParts.join(' ')

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (i / 4) * rangeV
    return { y: toY(v), label: v.toFixed(2) }
  })

  const xTickCount = Math.min(6, obs.length)
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx = Math.round((i / (xTickCount - 1)) * (obs.length - 1))
    const o = obs[idx]
    return { x: toX(o.date), label: o.date.slice(0, 7) }
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: 'block', maxHeight: height }}
      aria-label={`Chart for ${series.title}`}
    >
      {yTicks.map((t, i) => (
        <line
          key={i}
          x1={PAD.left}
          y1={t.y.toFixed(2)}
          x2={PAD.left + innerW}
          y2={t.y.toFixed(2)}
          stroke={color.borderSubtle}
          strokeWidth="1"
        />
      ))}

      {yTicks.map((t, i) => (
        <text
          key={i}
          x={PAD.left - 4}
          y={t.y + 4}
          textAnchor="end"
          fill={color.textTertiary}
          fontSize="9"
          fontFamily="monospace"
        >
          {t.label}
        </text>
      ))}

      {xTicks.map((t, i) => (
        <text
          key={i}
          x={t.x}
          y={PAD.top + innerH + 20}
          textAnchor="middle"
          fill={color.textTertiary}
          fontSize="9"
          fontFamily="monospace"
        >
          {t.label}
        </text>
      ))}

      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={PAD.top + innerH}
        stroke={color.borderMedium}
        strokeWidth="1"
      />
      <line
        x1={PAD.left}
        y1={PAD.top + innerH}
        x2={PAD.left + innerW}
        y2={PAD.top + innerH}
        stroke={color.borderMedium}
        strokeWidth="1"
      />

      <path
        d={d}
        fill="none"
        stroke={color.accentInfo}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ─── Expanded card detail ─────────────────────────────────────────────────────

interface ExpandedCardProps {
  card: MacroCard
  onClose: () => void
}

const ExpandedCard: React.FC<ExpandedCardProps> = ({ card, onClose }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['econ', card.series_id],
    queryFn: () => fetchEcon(card.series_id),
    staleTime: 5 * 60_000,
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: `${color.bgBase}DA`,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(19, 22, 25, 0.6)',
          border: `1px solid ${color.borderMedium}`,
          borderRadius: 8,
          minWidth: 520,
          maxWidth: 620,
          width: '90vw',
          padding: 0,
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderBottom: `1px solid ${color.borderSubtle}`,
          }}
        >
          <span style={{ color: color.textPrimary, fontFamily: font.sans, fontSize: 13, fontWeight: 600 }}>
            {card.label}&nbsp;
            <span style={{ color: color.textTertiary, fontSize: 10, fontFamily: font.mono }}>({card.series_id})</span>
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: `1px solid ${color.borderSubtle}`,
              color: color.textSecondary,
              cursor: 'pointer',
              fontSize: 13,
              padding: '1px 8px',
              lineHeight: 1,
              borderRadius: 4,
              fontFamily: font.sans,
            }}
          >
            ×
          </button>
        </div>

        {/* Summary row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            padding: '8px 16px',
            borderBottom: `1px solid ${color.borderSubtle}`,
          }}
        >
          <span style={{ fontSize: 22, color: color.textPrimary, fontWeight: 600, fontFamily: font.sans }}>
            {card.value !== null ? card.value.toFixed(2) : '—'}
          </span>
          <TickerBadge value={card.change} decimals={2} />
          <span style={{ color: color.textTertiary, fontSize: 11, fontFamily: font.sans }}>{card.units}</span>
          {data?.cached && (
            <span style={{ marginLeft: 'auto', color: color.textTertiary, fontSize: 10, fontFamily: font.mono }}>
              cached
            </span>
          )}
        </div>

        {/* Chart area */}
        <div style={{ padding: '12px 16px 16px' }}>
          <LoadingBar loading={isLoading} />
          {isError && (
            <div style={{ color: color.accentNegative, fontSize: 11, padding: 8, fontFamily: font.sans }}>
              Could not load series data.
            </div>
          )}
          {!isLoading && !isError && data && <EconLineChart series={data} />}
          {!isLoading && !isError && !data && (
            <div style={{ color: color.textTertiary, fontSize: 11, padding: 8, fontFamily: font.sans }}>
              No data available.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Single macro metric card ─────────────────────────────────────────────────

interface MacroCardViewProps {
  card: MacroCard
  onExpand: () => void
}

const MacroCardView: React.FC<MacroCardViewProps> = ({ card, onExpand }) => {
  const hasError = Boolean(card.error)
  const sparkData = card.sparkline.slice(-24)

  return (
    <div
      style={{
        background: 'rgba(19, 22, 25, 0.6)',
        border: `1px solid ${color.borderSubtle}`,
        borderRadius: 8,
        padding: '12px 14px',
        cursor: 'pointer',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onClick={onExpand}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = color.borderMedium
        ;(e.currentTarget as HTMLDivElement).style.background = color.bgSurface
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = color.borderSubtle
        ;(e.currentTarget as HTMLDivElement).style.background = color.bgElevated
      }}
    >
      {/* Label */}
      <div
        style={{
          color: color.textSecondary,
          fontSize: 11,
          fontFamily: font.sans,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {card.label}
      </div>

      {/* Current value */}
      <div
        style={{
          fontSize: 24,
          color: hasError ? color.textTertiary : color.textPrimary,
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          fontFamily: font.sans,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {hasError ? 'N/A' : card.value !== null ? card.value.toFixed(2) : '—'}
      </div>

      {/* Change badge */}
      <div style={{ fontSize: 12 }}>
        <TickerBadge value={hasError ? null : card.change} decimals={2} />
      </div>

      {/* Units */}
      <div
        style={{
          color: color.textTertiary,
          fontSize: 10,
          fontFamily: font.sans,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {card.units}
      </div>

      {/* Sparkline */}
      {!hasError && sparkData.length >= 2 && (
        <div style={{ marginTop: 2 }}>
          <Sparkline
            data={sparkData}
            width={120}
            height={28}
            color={
              card.change !== null && card.change < 0 ? color.accentNegative
              : card.change !== null && card.change > 0 ? color.accentPositive
              : color.accentInfo
            }
          />
        </div>
      )}
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const MacroScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['macro-dashboard'],
    queryFn: fetchMacroDashboard,
    staleTime: 5 * 60_000,
  })

  const cards = data?.cards?.slice(0, 12) ?? []
  const expandedCard = cards.find(c => c.series_id === expandedId) ?? null

  return (
    <Panel
      title="Macro dashboard"
      actions={
        data?.cached ? (
          <span style={{ color: color.textTertiary, fontSize: 10, fontFamily: font.mono }}>
            cached
          </span>
        ) : undefined
      }
    >
      <LoadingBar loading={isLoading} />

      {isError && (
        <div style={{ padding: 16, color: color.accentNegative, fontFamily: font.sans, fontSize: 13 }}>
          Failed to load macro dashboard data.
        </div>
      )}

      {!isLoading && !isError && cards.length === 0 && (
        <div style={{ padding: 16, color: color.textTertiary, fontFamily: font.sans, fontSize: 13 }}>
          No macro data available.
        </div>
      )}

      {cards.length > 0 && (
        <div
          style={{
            padding: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 8,
            overflowY: 'auto',
          }}
        >
          {cards.map(card => (
            <MacroCardView
              key={card.series_id}
              card={card}
              onExpand={() => setExpandedId(card.series_id)}
            />
          ))}
        </div>
      )}

      {expandedCard && (
        <ExpandedCard
          card={expandedCard}
          onClose={() => setExpandedId(null)}
        />
      )}
    </Panel>
  )
}

export default MacroScreen
