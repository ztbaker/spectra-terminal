import Panel from '../Terminal/Panel'
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMacroDashboard, fetchEcon } from '../../lib/api'
import type { MacroCard, EconSeries, EconObservation } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import Sparkline from '../shared/Sparkline'
import TickerBadge from '../shared/TickerBadge'
import C from '../../lib/colors'

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
      <div style={{ color: C.amberMute, padding: 8, fontSize: 11 }}>
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

  // Build SVG path
  const pathParts = obs.map((o, i) => {
    const x = toX(o.date).toFixed(2)
    const y = toY(o.value).toFixed(2)
    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
  })
  const d = pathParts.join(' ')

  // Y-axis ticks (5 evenly spaced)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (i / 4) * rangeV
    return { y: toY(v), label: v.toFixed(2) }
  })

  // X-axis ticks (up to 6 dates)
  const xTickCount = Math.min(6, obs.length)
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx = Math.round((i / (xTickCount - 1)) * (obs.length - 1))
    const o = obs[idx]
    return { x: toX(o.date), label: o.date.slice(0, 7) } // YYYY-MM
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: 'block', maxHeight: height }}
      aria-label={`Chart for ${series.title}`}
    >
      {/* Grid lines */}
      {yTicks.map((t, i) => (
        <line
          key={i}
          x1={PAD.left}
          y1={t.y.toFixed(2)}
          x2={PAD.left + innerW}
          y2={t.y.toFixed(2)}
          stroke={C.border0}
          strokeWidth="1"
        />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((t, i) => (
        <text
          key={i}
          x={PAD.left - 4}
          y={t.y + 4}
          textAnchor="end"
          fill={C.amberMute}
          fontSize="9"
          fontFamily="monospace"
        >
          {t.label}
        </text>
      ))}

      {/* X-axis labels */}
      {xTicks.map((t, i) => (
        <text
          key={i}
          x={t.x}
          y={PAD.top + innerH + 20}
          textAnchor="middle"
          fill={C.amberMute}
          fontSize="9"
          fontFamily="monospace"
        >
          {t.label}
        </text>
      ))}

      {/* Axes */}
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={PAD.top + innerH}
        stroke={C.border1}
        strokeWidth="1"
      />
      <line
        x1={PAD.left}
        y1={PAD.top + innerH}
        x2={PAD.left + innerW}
        y2={PAD.top + innerH}
        stroke={C.border1}
        strokeWidth="1"
      />

      {/* Line */}
      <path
        d={d}
        fill="none"
        stroke={C.amber}
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
        background: `${C.surface0}DA`,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface1,
          border: `1px solid ${C.border1}`,
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
          className="bb-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            {card.label}&nbsp;
            <span style={{ color: C.amberMute, fontSize: 10 }}>({card.series_id})</span>
          </span>
          <button
            className="bb-btn"
            onClick={onClose}
            style={{ fontSize: 13, padding: '1px 8px', border: 'none', lineHeight: 1 }}
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
            padding: '8px 12px',
            borderBottom: '1px solid ' + C.border0,
          }}
        >
          <span style={{ fontSize: 22, color: C.white, fontWeight: 'bold' }}>
            {card.value !== null ? card.value.toFixed(2) : '—'}
          </span>
          <TickerBadge value={card.change} decimals={2} />
          <span style={{ color: C.amberMute, fontSize: 11 }}>{card.units}</span>
          {data?.cached && (
            <span style={{ marginLeft: 'auto', color: C.amberMute, fontSize: 10 }}>
              CACHED
            </span>
          )}
        </div>

        {/* Chart area */}
        <div style={{ padding: '12px 12px 16px' }}>
          <LoadingBar loading={isLoading} />
          {isError && (
            <div style={{ color: C.red, fontSize: 11, padding: 8 }}>
              ERROR: Could not load series data.
            </div>
          )}
          {!isLoading && !isError && data && <EconLineChart series={data} />}
          {!isLoading && !isError && !data && (
            <div style={{ color: C.amberMute, fontSize: 11, padding: 8 }}>
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
      className="bb-panel"
      style={{
        padding: '8px 10px',
        cursor: 'pointer',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        transition: 'border-color 0.15s',
      }}
      onClick={onExpand}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = C.amber
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = C.border1
      }}
    >
      {/* Label */}
      <div
        style={{
          color: C.amberBright,
          fontSize: 11,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
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
          color: hasError ? C.amberMute : C.white,
          fontWeight: 'bold',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
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
          color: C.amberMute,
          fontSize: 10,
          letterSpacing: '0.04em',
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
              card.change !== null && card.change < 0 ? C.red
              : card.change !== null && card.change > 0 ? C.green
              : C.amber
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
      title="MACRO DASHBOARD"
      actions={
        data?.cached ? (
          <span style={{ color: C.amberMute, fontSize: 10, letterSpacing: '0.05em' }}>
            CACHED
          </span>
        ) : undefined
      }
    >
      <LoadingBar loading={isLoading} />

      {isError && (
        <div style={{ padding: 16, color: C.red }}>
          ERROR: Failed to load macro dashboard data.
        </div>
      )}

      {!isLoading && !isError && cards.length === 0 && (
        <div style={{ padding: 16, color: C.amberMute }}>
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

      {/* Expanded overlay */}
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
