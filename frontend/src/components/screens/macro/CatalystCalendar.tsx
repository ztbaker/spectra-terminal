import React, { useState, useMemo } from 'react'
import { color, type as typeScale, font, radius, shadow } from '../../../lib/theme'
import type { CatalystEvent } from './types'

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const ASSET_COLOR_MAP: Record<string, string> = {
  SPY: color.accentInfo,
  VIX: color.accentInfo,
  GLD: color.accentWarning,
  SLV: color.accentWarning,
  DXY: color.textSecondary,
  WTI: color.accentNegative,
  BRENT: color.accentNegative,
}

function eventMarkerColor(event: CatalystEvent): string {
  const primary = event.assets_impacted[0]
  if (primary === 'WTI' || primary === 'BRENT') {
    return `${color.accentNegative}99`
  }
  return ASSET_COLOR_MAP[primary] ?? color.textSecondary
}

interface DayData {
  date: Date
  dateStr: string
  isWeekend: boolean
  isToday: boolean
  label: string
  sublabel: string
  events: CatalystEvent[]
}

function buildDays(catalysts: CatalystEvent[]): DayData[] {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const todayDate = today.getDate()

  const eventsByDate = new Map<string, CatalystEvent[]>()
  for (const c of catalysts) {
    const existing = eventsByDate.get(c.event_date) ?? []
    existing.push(c)
    eventsByDate.set(c.event_date, existing)
  }

  const days: DayData[] = []
  for (let i = 0; i < 21; i++) {
    const d = new Date(year, month, todayDate + i)
    const dow = d.getDay()
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({
      date: d,
      dateStr,
      isWeekend: dow === 0 || dow === 6,
      isToday: i === 0,
      label: DAY_ABBR[dow],
      sublabel: `${d.getMonth() + 1}/${d.getDate()}`,
      events: eventsByDate.get(dateStr) ?? [],
    })
  }
  return days
}

interface CatalystCalendarProps {
  catalysts: CatalystEvent[]
  loading?: boolean
}

const ALL_ASSETS = ['SPY', 'VIX', 'GLD', 'SLV', 'DXY', 'WTI', 'BRENT'] as const

function assetSummaryLine(asset: string, catalysts: CatalystEvent[]): string {
  const relevant = catalysts.filter(c => c.assets_impacted.includes(asset as CatalystEvent['assets_impacted'][number]))
  if (relevant.length === 0) return `${asset}: \u2014`
  const straddles = relevant.filter(c => c.straddle_implied_move != null)
  if (straddles.length > 0) {
    const avgStraddle = straddles.reduce((s, c) => s + (c.straddle_implied_move ?? 0), 0) / straddles.length
    return `${asset}: ${relevant.length} catalyst${relevant.length > 1 ? 's' : ''} \u00B7 ATM straddle ${avgStraddle.toFixed(1)}%`
  }
  return `${asset}: ${relevant.length} catalyst${relevant.length > 1 ? 's' : ''}`
}

const Tooltip: React.FC<{ event: CatalystEvent; onClose: () => void }> = ({ event, onClose }) => (
  <div
    onMouseLeave={onClose}
    style={{
      position: 'absolute',
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      background: color.bgSurface,
      border: `1px solid ${color.borderMedium}`,
      borderRadius: radius.sm,
      padding: '8px 10px',
      zIndex: 10,
      whiteSpace: 'nowrap',
      boxShadow: shadow.md,
      marginBottom: '4px',
    }}
  >
    <div style={{ ...typeScale.monoXs, color: color.textPrimary, fontWeight: 600, marginBottom: '2px' }}>
      {event.event_label}
    </div>
    {event.event_time && (
      <div style={{ ...typeScale.monoXs, color: color.textSecondary }}>
        {event.event_time}
      </div>
    )}
    {event.consensus_value != null && (
      <div style={{ ...typeScale.monoXs, color: color.textSecondary }}>
        Consensus: {event.consensus_value}
      </div>
    )}
    {event.prior_value != null && (
      <div style={{ ...typeScale.monoXs, color: color.textSecondary }}>
        Prior: {event.prior_value}
      </div>
    )}
  </div>
)

const EventMarker: React.FC<{ event: CatalystEvent }> = ({ event }) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const markerColor = eventMarkerColor(event)
  const hasHighSurprise = event.surprise_weight >= 1.5

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {showTooltip && <Tooltip event={event} onClose={() => setShowTooltip(false)} />}
      <div
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{
          width: '48px',
          height: '18px',
          borderRadius: radius.full,
          background: `${markerColor}22`,
          border: hasHighSurprise ? `1px solid ${markerColor}` : `1px solid ${markerColor}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'default',
          flexShrink: 0,
          ...(hasHighSurprise ? { boxShadow: `0 0 6px ${markerColor}44` } : {}),
        }}
      >
        <span
          style={{
            ...typeScale.monoXs,
            fontSize: '9px',
            color: markerColor,
            lineHeight: 1,
          }}
        >
          {event.event_type}
        </span>
      </div>
    </div>
  )
}

const CatalystCalendar: React.FC<CatalystCalendarProps> = ({ catalysts, loading }) => {
  const days = useMemo(() => buildDays(catalysts), [catalysts])

  if (loading) {
    return (
      <div
        style={{
          height: '160px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color.textTertiary,
          ...typeScale.body,
        }}
      >
        Loading catalyst calendar...
      </div>
    )
  }

  return (
    <div style={{ height: '160px', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            minWidth: `${21 * 60}px`,
            height: '100%',
          }}
        >
          {days.map((day) => (
            <div
              key={day.dateStr}
              style={{
                minWidth: day.isWeekend ? '48px' : '60px',
                flex: day.isWeekend ? '0 0 48px' : '1 0 60px',
                borderRight: `1px solid ${color.borderSubtle}`,
                background: day.isToday
                  ? color.accentPositiveDim
                  : day.isWeekend
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: '6px',
              }}
            >
              <div
                style={{
                  ...typeScale.monoXs,
                  color: day.isToday ? color.textPrimary : color.textSecondary,
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                <div>{day.label}</div>
                <div>{day.sublabel}</div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  marginTop: '4px',
                  alignItems: 'center',
                }}
              >
                {day.events.map((event, idx) => (
                  <EventMarker key={`${day.dateStr}-${idx}`} event={event} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          borderTop: `1px solid ${color.borderSubtle}`,
          padding: '4px 8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 12px',
        }}
      >
        {ALL_ASSETS.map((asset) => (
          <span key={asset} style={{ ...typeScale.monoXs, color: color.textSecondary }}>
            {assetSummaryLine(asset, catalysts)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default CatalystCalendar