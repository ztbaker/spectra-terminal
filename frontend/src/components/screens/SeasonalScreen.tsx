/**
 * SeasonalScreen v2 — Year-overlay (spaghetti) seasonality chart.
 * Historical years stacked on a Jan→Dec axis, rebased to 0% at year start.
 * Current year and historical mean drawn boldly on top.
 */

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  LineSeries,
  CrosshairMode,
  LineStyle,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type LineData,
} from 'lightweight-charts'
import {
  fetchSeasonals,
  type SeasonalsResponse,
  type YearPath,
} from '../../lib/api'
import theme from '../../lib/theme'

const { color } = theme

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LOOKBACKS = [5, 10, 20, 30] as const

const REF_YEAR_BASE = Date.UTC(2025, 0, 1) / 1000
function doyToTime(doy: number): UTCTimestamp {
  return (REF_YEAR_BASE + (doy - 1) * 86400) as UTCTimestamp
}
function pathToLineData(pts: { day_of_year: number; cum_return: number }[]): LineData[] {
  // Lightweight-charts requires strictly ascending unique time stamps.
  const seen = new Set<number>()
  const out: LineData[] = []
  for (const p of pts) {
    if (seen.has(p.day_of_year)) continue
    seen.add(p.day_of_year)
    out.push({ time: doyToTime(p.day_of_year), value: p.cum_return * 100 })
  }
  out.sort((a, b) => Number(a.time) - Number(b.time))
  return out
}

const PCT_FORMAT = {
  type: 'custom' as const,
  formatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
  minMove: 0.01,
}

interface Props { ticker?: string }

export default function SeasonalScreen({ ticker }: Props) {
  const [years, setYears] = useState<number>(20)
  const t = (ticker || 'SPY').toUpperCase()
  const [hidden, setHidden] = useState<Set<number>>(new Set())

  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const { data, isLoading, error } = useQuery<SeasonalsResponse>({
    queryKey: ['seasonals', t, years],
    queryFn: () => fetchSeasonals(t, years),
    staleTime: 60 * 60 * 1000,
  })

  useEffect(() => {
    const container = chartContainerRef.current
    if (!container || !data || !data.yearly_paths || data.yearly_paths.length === 0) return

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: color.bgBase },
        textColor: color.textSecondary,
        fontFamily: theme.font.mono,
      },
      grid: {
        vertLines: { color: color.borderSubtle, style: LineStyle.Dotted },
        horzLines: { color: color.borderSubtle, style: LineStyle.Dotted },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: color.borderSubtle,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        timeVisible: false,
        borderColor: color.borderSubtle,
        tickMarkFormatter: (t: UTCTimestamp) => {
          const d = new Date(Number(t) * 1000)
          return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
        },
      },
      width: container.clientWidth,
      height: container.clientHeight,
      autoSize: false,
    })
    chartRef.current = chart

    const yearsList = [...data.yearly_paths].sort((a, b) => a.year - b.year)
    const currentYear = yearsList[yearsList.length - 1]?.year
    const historical: YearPath[] = yearsList.filter((yp) => yp.year !== currentYear)

    // p25 / p75 envelope (drawn first, dimmest)
    if (data.seasonal_path && data.seasonal_path.length > 0) {
      const p25Series = chart.addSeries(LineSeries, {
        color: color.accentNegativeDim,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: PCT_FORMAT,
      })
      const p75Series = chart.addSeries(LineSeries, {
        color: color.accentPositiveDim,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: PCT_FORMAT,
      })
      p25Series.setData(
        pathToLineData(
          data.seasonal_path.map((e) => ({ day_of_year: e.day_of_year, cum_return: e.p25 })),
        ),
      )
      p75Series.setData(
        pathToLineData(
          data.seasonal_path.map((e) => ({ day_of_year: e.day_of_year, cum_return: e.p75 })),
        ),
      )
    }

    // Historical year lines — each year gets a distinct hue (golden-ratio
    // rotation gives evenly-spaced, perceptually-distinct colors). Hues
    // around the current-year green (~140°) and seasonal-mean amber (~40°)
    // are nudged so the bold lines stay readable on top.
    const historicalSeries: { year: number; series: ISeriesApi<'Line'> }[] = []
    for (const yp of historical) {
      if (hidden.has(yp.year)) continue
      let hue = (yp.year * 137.508) % 360
      if (Math.abs(hue - 40) < 18) hue = (hue + 24) % 360   // away from amber
      if (Math.abs(hue - 140) < 18) hue = (hue + 24) % 360 // away from green
      const yearColor = `hsl(${hue.toFixed(0)}, 60%, 58%)`
      const s = chart.addSeries(LineSeries, {
        color: yearColor,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: PCT_FORMAT,
      })
      s.setData(pathToLineData(yp.points))
      historicalSeries.push({ year: yp.year, series: s })
    }

    // Seasonal mean line — bold amber
    if (data.seasonal_path && data.seasonal_path.length > 0) {
      const meanSeries = chart.addSeries(LineSeries, {
        color: color.accentWarning,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: PCT_FORMAT,
      })
      meanSeries.setData(
        pathToLineData(
          data.seasonal_path.map((e) => ({ day_of_year: e.day_of_year, cum_return: e.mean_cum_return })),
        ),
      )
    }

    // Current year — bold cyan/green, drawn last
    const currentPath = yearsList.find((yp) => yp.year === currentYear)
    if (currentPath && !hidden.has(currentPath.year)) {
      const cur = chart.addSeries(LineSeries, {
        color: color.accentPositive,
        lineWidth: 3,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: PCT_FORMAT,
      })
      cur.setData(pathToLineData(currentPath.points))
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        chart.applyOptions({ width, height })
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [data, hidden])

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
    padding: '0 12px',
    borderBottom: `1px solid ${color.borderSubtle}`,
    background: color.bgElevated,
    flexShrink: 0,
  }

  const pillStyle = (active: boolean): React.CSSProperties => ({
    background: active ? color.accentWarningDim : 'transparent',
    color: active ? color.accentWarning : color.textSecondary,
    border: `1px solid ${active ? color.accentWarning : color.borderSubtle}`,
    padding: '2px 10px',
    marginLeft: 4,
    fontFamily: theme.font.mono,
    fontSize: 11,
    cursor: 'pointer',
    letterSpacing: '0.04em',
  })

  // Loading / error / empty
  if (isLoading) {
    return (
      <div style={{ background: color.bgBase, color: color.accentWarning, fontFamily: theme.font.mono, padding: 16, height: '100%' }}>
        LOADING SEAS · {t}…
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ background: color.bgBase, color: color.accentNegative, fontFamily: theme.font.mono, padding: 16, height: '100%' }}>
        SEAS UNAVAILABLE · {String((error as Error).message ?? error)}
      </div>
    )
  }
  if (!data || !data.yearly_paths || data.yearly_paths.length === 0) {
    return (
      <div style={{ background: color.bgBase, color: color.textSecondary, fontFamily: theme.font.mono, padding: 16, height: '100%' }}>
        INSUFFICIENT HISTORY FOR {t}
      </div>
    )
  }

  const monthlyMax = Math.max(...data.monthly.map((m) => Math.abs(m.avg_daily_return)), 0)
  const yearsList = [...data.yearly_paths].sort((a, b) => a.year - b.year)
  const currentYear = yearsList[yearsList.length - 1]?.year
  const visibleHistCount = yearsList.filter((yp) => yp.year !== currentYear && !hidden.has(yp.year)).length

  return (
    <div style={{ background: color.bgBase, fontFamily: theme.font.mono, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ color: color.ticker, fontSize: 13, fontWeight: 600, letterSpacing: '0.06em' }}>
            SEAS · {t}
          </span>
          <span style={{ color: color.textTertiary, fontSize: 10 }}>
            {data.years}Y LOOKBACK · {visibleHistCount} HIST + MEAN + {currentYear}
            {data.cached ? ' · CACHED' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: color.textSecondary }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 2, background: color.accentPositive, display: 'inline-block' }} />
              {currentYear}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 2, background: color.accentWarning, display: 'inline-block' }} />
              MEAN
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 1, background: color.accentWarningDim, display: 'inline-block' }} />
              YEARS
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: color.textTertiary }}>
              ⋯ p25/p75
            </span>
          </div>
          <div>
            {LOOKBACKS.map((y) => (
              <button key={y} onClick={() => setYears(y)} style={pillStyle(y === years)}>
                {y}Y
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Year toggle strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 12px',
        height: 24,
        borderBottom: `1px solid ${color.borderSubtle}`,
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        background: color.bgElevated,
      }}>
        {yearsList.map((yp) => {
          const isCurrent = yp.year === currentYear
          const isHidden = hidden.has(yp.year)
          let hue = (yp.year * 137.508) % 360
          if (Math.abs(hue - 40) < 18) hue = (hue + 24) % 360
          if (Math.abs(hue - 140) < 18) hue = (hue + 24) % 360
          const lineColor = `hsl(${hue.toFixed(0)}, 60%, 58%)`
          const chipColor = isHidden
            ? color.textTertiary
            : isCurrent
            ? color.accentPositive
            : lineColor
          return (
            <button
              key={yp.year}
              onClick={() => {
                setHidden((prev) => {
                  const next = new Set(prev)
                  if (next.has(yp.year)) next.delete(yp.year)
                  else next.add(yp.year)
                  return next
                })
              }}
              style={{
                background: 'transparent',
                color: chipColor,
                border: 'none',
                padding: '0 6px',
                fontSize: 10,
                fontFamily: theme.font.mono,
                cursor: 'pointer',
                opacity: isHidden ? 0.4 : 1,
                textDecoration: isHidden ? 'line-through' : 'none',
                letterSpacing: '0.04em',
              }}
            >
              {yp.year}
            </button>
          )
        })}
      </div>

      {/* Chart */}
      <div ref={chartContainerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }} />

      {/* Bottom monthly strip */}
      <div style={{
        height: 140,
        flexShrink: 0,
        borderTop: `1px solid ${color.borderSubtle}`,
        background: color.bgElevated,
        padding: '6px 12px',
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: 10,
          color: color.textTertiary,
          letterSpacing: '0.08em',
          marginBottom: 4,
        }}>
          AVG DAILY RETURN BY MONTH
          <span style={{ color: color.textSecondary, marginLeft: 12 }}>
            BEST: {data.best_months.map((m) => MONTHS[m.month]).join(' ')}
          </span>
          <span style={{ color: color.textSecondary, marginLeft: 8 }}>
            WORST: {data.worst_months.map((m) => MONTHS[m.month]).join(' ')}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2, height: 110 }}>
          {data.monthly.map((m) => {
            const w = monthlyMax > 0 ? (Math.abs(m.avg_daily_return) / monthlyMax) * 50 : 0
            const clr = m.avg_daily_return >= 0 ? color.accentPositive : color.accentNegative
            const sign = m.avg_daily_return >= 0 ? '+' : '-'
            return (
              <div key={m.month} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                fontSize: 9,
                color: color.textSecondary,
              }}>
                <div style={{ textAlign: 'center', color: color.textTertiary, marginBottom: 2 }}>{MONTHS[m.month]}</div>
                <div style={{ position: 'relative', flex: 1, background: 'transparent' }}>
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '50%',
                    height: 1,
                    background: color.borderSubtle,
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: m.avg_daily_return >= 0 ? `${50 - w}%` : '50%',
                    width: 8,
                    height: `${w}%`,
                    transform: 'translateX(-50%)',
                    background: clr,
                  }} />
                </div>
                <div style={{ textAlign: 'center', color: clr, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {sign}{(Math.abs(m.avg_daily_return) * 100).toFixed(2)}%
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
