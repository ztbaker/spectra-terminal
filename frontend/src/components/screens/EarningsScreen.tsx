import Panel from '../Terminal/Panel'
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEarnings } from '../../lib/api'
import type { EarningsEntry } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'

const { color, font } = theme

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function formatColumnDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  const dayName = DAY_NAMES[d.getDay()]
  const monthName = MONTH_NAMES[d.getMonth()]
  return `${dayName} ${monthName} ${String(day).padStart(2, '0')}`
}

function formatEps(n: number | null | undefined): string {
  if (n == null) return ''
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`
}

interface WhenBadgeProps {
  when: 'BMO' | 'AMC' | 'unknown'
}

const WhenBadge: React.FC<WhenBadgeProps> = ({ when }) => {
  if (when === 'BMO') {
    return (
      <span
        style={{
          background: color.accentPositive,
          color: color.textInverse,
          fontSize: '9px',
          padding: '1px 4px',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        BMO
      </span>
    )
  }
  if (when === 'AMC') {
    return (
      <span
        style={{
          background: color.accentInfo,
          color: color.textInverse,
          fontSize: '9px',
          padding: '1px 4px',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        AMC
      </span>
    )
  }
  return (
    <span
      style={{
        background: color.bgSurface,
        color: color.textTertiary,
        fontSize: '9px',
        padding: '1px 4px',
        flexShrink: 0,
      }}
    >
      {'\u2014'}
    </span>
  )
}

interface EntryCardProps {
  entry: EarningsEntry
  onNavigate: (cmd: string) => void
}

const EntryCard: React.FC<EntryCardProps> = ({ entry, onNavigate }) => {
  const epsEst = formatEps(entry.eps_estimate)
  const epsActual = formatEps(entry.eps_actual)

  return (
    <button
      onClick={() => onNavigate(`${entry.ticker} EQUITY`)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: `1px solid ${color.borderSubtle}`,
        borderRadius: 0,
        padding: '5px 6px',
        cursor: 'pointer',
        marginBottom: '3px',
        fontFamily: 'inherit',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLButtonElement).style.background = color.bgHover
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = color.borderMedium
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = color.borderSubtle
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
        <WhenBadge when={entry.when_market} />
        <span style={{ color: color.ticker, fontSize: '12px', fontWeight: 600, fontFamily: font.mono }}>
          {entry.ticker}
        </span>
      </div>

      {entry.company_name && (
        <div
          style={{
            color: color.textSecondary,
            fontSize: '10px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
            marginBottom: '2px',
          }}
        >
          {entry.company_name}
        </div>
      )}

      {(epsEst || epsActual) && (
        <div style={{ display: 'flex', gap: '8px', fontSize: '10px', marginTop: '1px' }}>
          {epsEst && (
            <span>
              <span style={{ color: color.textTertiary }}>EST </span>
              <span style={{ color: color.textSecondary }}>{epsEst}</span>
            </span>
          )}
          {epsActual && (
            <span>
              <span style={{ color: color.textTertiary }}>ACT </span>
              <span
                style={{
                  color:
                    entry.eps_actual != null && entry.eps_estimate != null
                      ? entry.eps_actual >= entry.eps_estimate
                        ? color.accentPositive
                        : color.accentNegative
                      : color.textPrimary,
                }}
              >
                {epsActual}
              </span>
            </span>
          )}
        </div>
      )}
    </button>
  )
}

const LOOKAHEAD_OPTIONS: { label: string; value: number }[] = [
  { label: '7 DAYS',  value: 7 },
  { label: '14 DAYS', value: 14 },
  { label: '30 DAYS', value: 30 },
]

interface Props {
  onNavigate: (cmd: string) => void
}

const EarningsScreen: React.FC<Props> = ({ onNavigate }) => {
  const [lookahead, setLookahead] = useState<number>(14)

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['earnings', lookahead],
    queryFn: () => fetchEarnings(lookahead),
    staleTime: 5 * 60_000,
  })

  const days = data?.days ?? []

  const weekdays = days.filter(d => {
    const [year, month, day] = d.date.split('-').map(Number)
    const dow = new Date(year, month - 1, day).getDay()
    return dow >= 1 && dow <= 5
  })

  const totalEntries = days.reduce((sum, d) => sum + d.entries.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent' }}>
      <LoadingBar loading={isLoading || isFetching} />

      <Panel
        title="EARNINGS CALENDAR"
        actions={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {LOOKAHEAD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={lookahead === opt.value ? 'bb-btn bb-btn-active' : 'bb-btn'}
                onClick={() => setLookahead(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      >
        {error && !isLoading && (
          <div style={{ padding: '12px', color: color.accentNegative, fontSize: '12px', borderBottom: `1px solid ${color.borderSubtle}` }}>
            ERR: {(error as Error).message ?? 'Failed to load earnings calendar'}
          </div>
        )}

        {isLoading && !data && (
          <div style={{ padding: '16px', color: color.textTertiary, fontSize: '12px', textAlign: 'center' }}>
            LOADING EARNINGS DATA...
          </div>
        )}

        {!isLoading && days.length > 0 && (
          <div style={{ padding: '8px', overflowX: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.max(1, weekdays.length)}, minmax(160px, 1fr))`,
                gap: '6px',
                minWidth: weekdays.length * 166 + 'px',
              }}
            >
              {weekdays.map(day => (
                <div key={day.date} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div
                    style={{
                      background: 'rgba(19, 22, 25, 0.6)',
                      borderBottom: `2px solid ${color.accentPositive}`,
                      padding: '4px 6px',
                      marginBottom: '6px',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ color: color.textSecondary, fontSize: '11px', fontWeight: 600, fontFamily: font.sans }}>
                      {formatColumnDate(day.date)}
                    </span>
                    <span style={{ color: color.textTertiary, fontSize: '10px', marginLeft: '6px' }}>
                      ({day.entries.length})
                    </span>
                  </div>

                  {day.entries.length === 0 ? (
                    <div
                      style={{
                        color: color.textTertiary,
                        fontSize: '11px',
                        textAlign: 'center',
                        padding: '12px 0',
                      }}
                    >
                      NO EARNINGS
                    </div>
                  ) : (
                    day.entries.map(entry => (
                      <EntryCard
                        key={`${entry.ticker}-${entry.earnings_date}`}
                        entry={entry}
                        onNavigate={onNavigate}
                      />
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading && !error && weekdays.length === 0 && (
          <div style={{ padding: '32px', color: color.textTertiary, fontSize: '12px', textAlign: 'center' }}>
            NO EARNINGS DATA FOR THIS PERIOD
          </div>
        )}

        {!isLoading && days.length > 0 && (
          <div
            style={{
              borderTop: `1px solid ${color.borderSubtle}`,
              padding: '4px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              color: color.textTertiary,
              fontSize: '10px',
            }}
          >
            <span>
              {totalEntries} EARNINGS OVER NEXT {lookahead} DAYS
            </span>
            {data?.cached && (
              <span style={{ color: color.textTertiary }}>CACHED</span>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}

export default EarningsScreen