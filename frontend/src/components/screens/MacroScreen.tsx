import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMacroDashboard, fetchEcon } from '../../lib/api'
import type { MacroCard, EconSeries, EconObservation } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import TickerBadge from '../shared/TickerBadge'
import theme from '../../lib/theme'

const { color, font } = theme

const MONO: React.CSSProperties = { fontFamily: font.mono, letterSpacing: '0.03em' }
const UP_COLOR = color.accentPositive
const DOWN_COLOR = color.accentNegative
const FLAT_COLOR = color.textTertiary
const ROW_GRID = '1fr 100px 90px 120px'

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
        <line key={i} x1={PAD.left} y1={t.y.toFixed(2)} x2={PAD.left + innerW} y2={t.y.toFixed(2)} stroke={color.borderSubtle} strokeWidth="1" />
      ))}
      {yTicks.map((t, i) => (
        <text key={i} x={PAD.left - 4} y={t.y + 4} textAnchor="end" fill={color.textTertiary} fontSize="9" fontFamily="monospace">{t.label}</text>
      ))}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={PAD.top + innerH + 20} textAnchor="middle" fill={color.textTertiary} fontSize="9" fontFamily="monospace">{t.label}</text>
      ))}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke={color.borderMedium} strokeWidth="1" />
      <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke={color.borderMedium} strokeWidth="1" />
      <path d={d} fill="none" stroke={color.accentInfo} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
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
        position: 'fixed', inset: 0, background: `${color.bgBase}DA`,
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(19, 22, 25, 0.6)', border: `1px solid ${color.borderMedium}`,
          borderRadius: 8, minWidth: 520, maxWidth: 620, width: '90vw', padding: 0, position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${color.borderSubtle}` }}>
          <span style={{ color: color.textPrimary, fontFamily: font.sans, fontSize: 13, fontWeight: 600 }}>
            {card.label}&nbsp;
            <span style={{ color: color.textTertiary, fontSize: 10, fontFamily: font.mono }}>({card.series_id})</span>
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${color.borderSubtle}`, color: color.textSecondary, cursor: 'pointer', fontSize: 13, padding: '1px 8px', lineHeight: 1, borderRadius: 4, fontFamily: font.sans }}>
            x
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 16px', borderBottom: `1px solid ${color.borderSubtle}` }}>
          <span style={{ fontSize: 22, color: color.textPrimary, fontWeight: 600, fontFamily: font.sans }}>
            {card.value !== null ? card.value.toFixed(2) : '\u2014'}
          </span>
          <TickerBadge value={card.change} decimals={2} />
          <span style={{ color: color.textTertiary, fontSize: 11, fontFamily: font.sans }}>{card.units}</span>
          {data?.cached && (
            <span style={{ marginLeft: 'auto', color: color.textTertiary, fontSize: 10, fontFamily: font.mono }}>cached</span>
          )}
        </div>

        <div style={{ padding: '12px 16px 16px' }}>
          <LoadingBar loading={isLoading} />
          {isError && <div style={{ color: color.accentNegative, fontSize: 11, padding: 8, fontFamily: font.sans }}>Could not load series data.</div>}
          {!isLoading && !isError && data && <EconLineChart series={data} />}
          {!isLoading && !isError && !data && <div style={{ color: color.textTertiary, fontSize: 11, padding: 8, fontFamily: font.sans }}>No data available.</div>}
        </div>
      </div>
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────

const HeaderRow: React.FC = () => (
  <div style={{
    display: 'grid', gridTemplateColumns: ROW_GRID,
    padding: '4px 12px', gap: 0,
    borderBottom: `1px solid ${color.borderSubtle}`,
    ...MONO,
  }}>
    {['INDICATOR', 'VALUE', 'CHG', 'UNITS'].map(h => (
      <div key={h} style={{
        color: color.textTertiary, fontSize: 10,
        textAlign: h === 'INDICATOR' || h === 'UNITS' ? 'left' : 'right',
        paddingRight: h === 'INDICATOR' || h === 'UNITS' ? 0 : 8,
      }}>
        {h}
      </div>
    ))}
  </div>
)

const MacroRow: React.FC<{ card: MacroCard; onExpand: () => void }> = ({ card, onExpand }) => {
  const hasError = Boolean(card.error)
  const chg = card.change ?? 0
  const chgColor = hasError ? FLAT_COLOR : chg > 0 ? UP_COLOR : chg < 0 ? DOWN_COLOR : FLAT_COLOR

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: ROW_GRID,
        padding: '5px 12px', gap: 0,
        borderBottom: `1px solid ${color.bgElevated}`,
        alignItems: 'center',
        cursor: 'pointer',
        ...MONO,
      }}
      onClick={onExpand}
      onMouseEnter={e => (e.currentTarget.style.background = color.bgHover)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: color.textPrimary, fontSize: 11, fontWeight: 600 }}>{card.label}</span>
        <span style={{ color: color.textTertiary, fontSize: 9 }}>{card.series_id}</span>
      </div>
      <div style={{ color: hasError ? FLAT_COLOR : color.textPrimary, fontSize: 12, fontWeight: 600, textAlign: 'right', paddingRight: 8 }}>
        {hasError ? 'N/A' : card.value !== null ? card.value.toFixed(2) : '\u2014'}
      </div>
      <div style={{ textAlign: 'right', paddingRight: 8 }}>
        <TickerBadge value={hasError ? null : card.change} decimals={2} />
      </div>
      <div style={{ color: color.textTertiary, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {card.units}
      </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      <div
        className="bb-header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, padding: '6px 12px' }}
      >
        <span>MACRO DASHBOARD</span>
        <span style={{ color: color.textTertiary, fontSize: '11px' }}>
          {data?.cached && <span style={{ color: color.borderSubtle }}>CACHED</span>}
        </span>
      </div>

      {isError && (
        <div style={{ padding: '8px 12px', color: color.accentNegative, fontSize: '12px', borderBottom: `1px solid ${color.borderSubtle}`, flexShrink: 0 }}>
          Failed to load macro dashboard data.
        </div>
      )}

      {!isLoading && !isError && cards.length === 0 && (
        <div style={{ padding: '20px 12px', color: color.textTertiary, fontSize: 11 }}>
          No macro data available.
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {cards.length > 0 && <HeaderRow />}
        {isLoading && cards.length === 0 && (
          <div style={{ padding: '20px 12px', color: color.borderSubtle, fontSize: 11 }}>
            FETCHING MACRO DATA…
          </div>
        )}
        {cards.map(card => (
          <MacroRow
            key={card.series_id}
            card={card}
            onExpand={() => setExpandedId(card.series_id)}
          />
        ))}
      </div>

      {expandedCard && (
        <ExpandedCard
          card={expandedCard}
          onClose={() => setExpandedId(null)}
        />
      )}
    </div>
  )
}

export default MacroScreen
