import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchECST, fetchEcon } from '../../lib/api'
import type { ECSTEntry, EconSeries, EconObservation } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'

const { color, font } = theme

interface Props {
  onNavigate: (cmd: string) => void
}

const INVERTED_SERIES = new Set(['UNRATE', 'ICSA', 'U6RATE', 'MORTGAGE30US'])

function changeColor(seriesId: string, change: number | null): string {
  if (change === null || change === 0) return color.textTertiary
  const improving = INVERTED_SERIES.has(seriesId) ? change < 0 : change > 0
  return improving ? color.accentPositive : color.accentNegative
}

function formatValue(value: number | null): string {
  if (value === null) return '\u2014'
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

function formatChange(change: number | null): string {
  if (change === null) return '\u2014'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toLocaleString('en-US', { maximumFractionDigits: 3 })}`
}

interface ExpandedRowProps {
  entry: ECSTEntry
  colSpan: number
}

const ExpandedRow: React.FC<ExpandedRowProps> = ({ entry, colSpan }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['econ', entry.series_id, '2018'],
    queryFn: () => fetchEcon(entry.series_id, '2018-01-01'),
    staleTime: 5 * 60_000,
  })

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: 'rgba(19, 22, 25, 0.6)' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${color.borderSubtle}` }}>
          <LoadingBar loading={isLoading} />
          {isError && (
            <div style={{ color: color.accentNegative, fontSize: '11px' }}>
              ERROR: Could not load series data.
            </div>
          )}
          {!isLoading && !isError && data && <EconLineChartInline series={data} />}
        </div>
      </td>
    </tr>
  )
}

interface ChartProps {
  series: EconSeries
}

const EconLineChartInline: React.FC<ChartProps> = ({ series }) => {
  const obs = series.observations.filter(
    (o): o is EconObservation & { value: number } => typeof o.value === 'number' && isFinite(o.value)
  )
  if (obs.length < 2) {
    return <div style={{ color: color.textTertiary, fontSize: '11px' }}>Insufficient data.</div>
  }

  const width = 600
  const height = 140
  const PAD = { top: 12, right: 16, bottom: 28, left: 48 }
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

  const d = obs
    .map((o, i) => `${i === 0 ? 'M' : 'L'} ${toX(o.date).toFixed(1)} ${toY(o.value).toFixed(1)}`)
    .join(' ')

  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const v = minV + (i / 3) * rangeV
    return { y: toY(v), label: v.toLocaleString('en-US', { maximumFractionDigits: 2 }) }
  })

  const xTicks = Array.from({ length: 5 }, (_, i) => {
    const idx = Math.round((i / 4) * (obs.length - 1))
    return { x: toX(obs[idx].date), label: obs[idx].date.slice(0, 7) }
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', maxHeight: height }} aria-label={series.title}>
      {yTicks.map((t, i) => (
        <line key={i} x1={PAD.left} y1={t.y} x2={PAD.left + innerW} y2={t.y} stroke={color.borderSubtle} strokeWidth="1" />
      ))}
      {yTicks.map((t, i) => (
        <text key={i} x={PAD.left - 4} y={t.y + 3} textAnchor="end" fill={color.textTertiary} fontSize="8" fontFamily={font.mono}>{t.label}</text>
      ))}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={PAD.top + innerH + 18} textAnchor="middle" fill={color.textTertiary} fontSize="8" fontFamily={font.mono}>{t.label}</text>
      ))}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke={color.borderSubtle} strokeWidth="1" />
      <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke={color.borderSubtle} strokeWidth="1" />
      <path d={d} fill="none" stroke={color.textPrimary} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

interface RowProps {
  entry: ECSTEntry
  isExpanded: boolean
  onToggle: () => void
}

const ECSTRow: React.FC<RowProps> = ({ entry, isExpanded, onToggle }) => {
  const clr = changeColor(entry.series_id, entry.change)
  return (
    <tr
      style={{ cursor: 'pointer', background: isExpanded ? color.bgElevated : 'transparent' }}
      onClick={onToggle}
      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = color.bgHover }}
      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isExpanded ? color.bgElevated : 'transparent' }}
    >
      <td style={{ padding: '5px 12px', color: color.textPrimary, fontSize: '12px', borderBottom: '1px solid ' + color.borderSubtle, whiteSpace: 'nowrap' }}>
        {entry.label}
        <span style={{ color: color.textTertiary, fontSize: '10px', marginLeft: '6px' }}>
          {entry.series_id}
        </span>
      </td>
      <td style={{ padding: '5px 12px', color: color.textPrimary, fontSize: '12px', fontFamily: font.mono, textAlign: 'right', borderBottom: '1px solid ' + color.borderSubtle, whiteSpace: 'nowrap' }}>
        {formatValue(entry.value)}
      </td>
      <td style={{ padding: '5px 12px', color: color.textTertiary, fontSize: '11px', fontFamily: font.mono, textAlign: 'right', borderBottom: '1px solid ' + color.borderSubtle, whiteSpace: 'nowrap' }}>
        {formatValue(entry.prior)}
      </td>
      <td style={{ padding: '5px 12px', color: clr, fontSize: '12px', fontFamily: font.mono, textAlign: 'right', borderBottom: '1px solid ' + color.borderSubtle, whiteSpace: 'nowrap' }}>
        {formatChange(entry.change)}
      </td>
      <td style={{ padding: '5px 12px', color: color.textTertiary, fontSize: '10px', textAlign: 'center', borderBottom: '1px solid ' + color.borderSubtle }}>
        {entry.frequency || '\u2014'}
      </td>
      <td style={{ padding: '5px 12px', color: color.textSecondary, fontSize: '11px', fontFamily: font.mono, textAlign: 'right', borderBottom: '1px solid ' + color.borderSubtle, whiteSpace: 'nowrap' }}>
        {entry.next_release_date ?? '\u2014'}
      </td>
    </tr>
  )
}

const CategoryHeader: React.FC<{ label: string; colSpan: number }> = ({ label, colSpan }) => (
  <tr>
    <td
      colSpan={colSpan}
      style={{
        padding: '8px 12px 4px',
        color: color.textSecondary,
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: font.sans,
        borderBottom: `1px solid ${color.borderSubtle}`,
        borderTop: `1px solid ${color.borderSubtle}`,
        background: 'rgba(19, 22, 25, 0.6)',
      }}
    >
      {label}
    </td>
  </tr>
)

const COLUMN_COUNT = 6

const ECSTScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ecst'],
    queryFn: fetchECST,
    staleTime: 15 * 60_000,
  })

  const grouped = React.useMemo(() => {
    if (!data?.entries) return []
    const map = new Map<string, ECSTEntry[]>()
    for (const entry of data.entries) {
      if (!map.has(entry.category)) map.set(entry.category, [])
      map.get(entry.category)!.push(entry)
    }
    return Array.from(map.entries())
  }, [data?.entries])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      <div
        className="bb-header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, padding: '6px 12px' }}
      >
        <span>ECST ECONOMIC STATISTICS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {data?.cached && (
            <span style={{ color: color.textTertiary, fontSize: '10px' }}>CACHED</span>
          )}
          <button
            className="bb-btn"
            onClick={() => refetch()}
            style={{ fontSize: '10px', padding: '2px 8px' }}
          >
            REFRESH
          </button>
        </div>
      </div>

      {isError && (
        <div style={{ padding: '8px 12px', color: color.accentNegative, fontSize: '12px', borderBottom: `1px solid ${color.borderSubtle}`, flexShrink: 0 }}>
          ERROR: Failed to load economic statistics.
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, zIndex: 10, background: 'transparent' }}>
              {(['INDICATOR', 'LATEST', 'PRIOR', 'CHG', 'FREQ', 'NEXT RELEASE'] as const).map((col, i) => (
                <th
                  key={col}
                  style={{
                    padding: '6px 12px',
                    color: color.textSecondary,
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: font.sans,
                    textAlign: i === 0 ? 'left' : i === 4 ? 'center' : 'right',
                    borderBottom: `2px solid ${color.borderMedium}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && grouped.length === 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} style={{ padding: '24px 12px', color: color.textTertiary, textAlign: 'center', fontSize: '11px' }}>
                  LOADING ECONOMIC DATA...
                </td>
              </tr>
            )}
            {!isLoading && !isError && grouped.length === 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} style={{ padding: '24px 12px', color: color.textTertiary, textAlign: 'center', fontSize: '11px' }}>
                  NO DATA AVAILABLE.
                </td>
              </tr>
            )}
            {grouped.map(([category, entries]) => (
              <React.Fragment key={category}>
                <CategoryHeader label={category} colSpan={COLUMN_COUNT} />
                {entries.map(entry => (
                  <React.Fragment key={entry.series_id}>
                    <ECSTRow
                      entry={entry}
                      isExpanded={expandedId === entry.series_id}
                      onToggle={() => setExpandedId(prev => prev === entry.series_id ? null : entry.series_id)}
                    />
                    {expandedId === entry.series_id && (
                      <ExpandedRow entry={entry} colSpan={COLUMN_COUNT} />
                    )}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ECSTScreen