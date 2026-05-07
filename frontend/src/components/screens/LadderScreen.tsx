import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLadder, type LadderResponse } from '../../lib/api'
import theme from '../../lib/theme'

const { color, font } = theme

type Lookback = 15 | 30 | 60 | 0

const LOOKBACK_OPTIONS: { label: string; value: Lookback }[] = [
  { label: '15M', value: 15 },
  { label: '30M', value: 30 },
  { label: '60M', value: 60 },
  { label: 'ALL', value: 0 },
]

function fmtVol(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K'
  return String(v)
}

export default function LadderScreen({ ticker }: { ticker?: string }) {
  const [lookback, setLookback] = useState<Lookback>(60)
  const t = (ticker || 'SPY').toUpperCase()
  const levelsParam = 20

  const { data, isLoading, error } = useQuery<LadderResponse>({
    queryKey: ['ladder', t, levelsParam, lookback],
    queryFn: () => fetchLadder(t, levelsParam, lookback || 9999),
    refetchInterval: 2000,
  })

  if (isLoading && !data) {
    return (
      <div style={{ background: color.bgBase, color: color.accentWarning, fontFamily: font.mono, padding: 16, height: '100%' }}>
        LOADING LADDER · {t}…
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ background: color.bgBase, color: color.accentNegative, fontFamily: font.mono, padding: 16, height: '100%' }}>
        LADDER UNAVAILABLE · {String((error as Error).message ?? error)}
      </div>
    )
  }

  const maxVol = data ? Math.max(...data.levels.map(l => l.volume), 1) : 1

  return (
    <div style={{ background: color.bgBase, fontFamily: font.mono, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header ~36px */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 36,
        padding: '0 12px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        background: color.bgElevated,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: color.ticker, fontSize: 13, fontWeight: 600, letterSpacing: '0.06em' }}>
            LADDER · {t}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {LOOKBACK_OPTIONS.map(opt => (
            <button
              key={opt.label}
              onClick={() => setLookback(opt.value)}
              style={{
                background: lookback === opt.value ? color.accentWarningDim : 'transparent',
                color: lookback === opt.value ? color.accentWarning : color.textSecondary,
                border: `1px solid ${lookback === opt.value ? color.accentWarning : color.borderSubtle}`,
                padding: '2px 8px',
                fontFamily: font.mono,
                fontSize: 11,
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
            >
              {opt.label}
            </button>
          ))}
          {data && (
            <span style={{ color: color.textTertiary, fontSize: 10, marginLeft: 4 }}>
              tick: ${data.tick.toFixed(2)}
            </span>
          )}
          {data?.cached && (
            <span style={{ color: color.textTertiary, fontSize: 9, marginLeft: 4, padding: '1px 5px', border: `1px solid ${color.borderSubtle}`, borderRadius: 2 }}>
              CACHED
            </span>
          )}
        </div>
      </div>

      {/* Top strip ~28px — bid/ask spread */}
      {data && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 28,
          borderBottom: `1px solid ${color.borderSubtle}`,
          background: color.bgElevated,
          flexShrink: 0,
          gap: 12,
        }}>
          <span style={{ color: color.accentPositive, fontSize: 11, letterSpacing: '0.04em' }}>
            BID  ${data.bid.toFixed(2)}
          </span>
          <span style={{ color: color.ticker, fontSize: 11, fontWeight: 600 }}>
            LAST ${data.current_price.toFixed(2)}
          </span>
          <span style={{ color: color.accentNegative, fontSize: 11, letterSpacing: '0.04em' }}>
            ASK  ${data.ask.toFixed(2)}
          </span>
        </div>
      )}

      {/* Ladder body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {data ? data.levels.map((level, idx) => {
          const isLast = level.side === 'last'
          const isBid = level.side === 'bid'
          const isAsk = level.side === 'ask'
          const volPct = maxVol > 0 ? (level.volume / maxVol) * 100 : 0

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                height: 22,
                background: isLast ? color.bgActive : undefined,
              }}
              onMouseEnter={e => { if (!isLast) (e.currentTarget.style.background = color.bgHover) }}
              onMouseLeave={e => { if (!isLast) (e.currentTarget.style.background = 'transparent') }}
            >
              {/* Left half — bid volume bar */}
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
                {isBid && (
                  <>
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: `${volPct}%`,
                      background: color.accentPositiveDim,
                      transition: 'width 0.15s ease',
                    }} />
                    <span style={{
                      position: 'relative',
                      zIndex: 1,
                      fontSize: 9,
                      color: color.accentPositive,
                      paddingRight: 4,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {fmtVol(level.volume)}
                    </span>
                  </>
                )}
              </div>

              {/* Price column ~96px */}
              <div style={{
                width: 96,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: font.mono,
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: isLast ? 700 : 400,
                color: isLast ? color.ticker : isBid ? color.accentPositive : isAsk ? color.accentNegative : color.textSecondary,
                background: isLast ? color.bgActive : undefined,
                flexShrink: 0,
              }}>
                {level.price.toFixed(2)}
              </div>

              {/* Right half — ask volume bar */}
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
                {isAsk && (
                  <>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${volPct}%`,
                      background: color.accentNegativeDim,
                      transition: 'width 0.15s ease',
                    }} />
                    <span style={{
                      position: 'relative',
                      zIndex: 1,
                      fontSize: 9,
                      color: color.accentNegative,
                      paddingLeft: 4,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {fmtVol(level.volume)}
                    </span>
                  </>
                )}
              </div>
            </div>
          )
        }) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color.textTertiary,
            fontSize: 12,
          }}>
            NO DATA
          </div>
        )}
      </div>
    </div>
  )
}