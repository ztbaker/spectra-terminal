import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  AreaSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
  type AreaData,
  type LineData,
  type HistogramData,
  type MouseEventParams,
} from 'lightweight-charts'
import { fetchChart, fetchEquity } from '../../lib/api'
import type { OhlcvBar } from '../../types'
import LoadingBar from '../shared/LoadingBar'

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodKey = '1D' | '5D'

interface PeriodConfig { period: string; interval: string }

const PERIOD_MAP: Record<PeriodKey, PeriodConfig> = {
  '1D': { period: '1d',  interval: '5m'  },
  '5D': { period: '5d',  interval: '15m' },
}

const PERIODS: PeriodKey[] = ['1D', '5D']

// ─── VWAP (daily-anchored) ────────────────────────────────────────────────────

function computeVwap(ohlcv: OhlcvBar[]): (number | null)[] {
  let cumPV    = 0
  let cumVol   = 0
  let curDate  = ''

  return ohlcv.map(bar => {
    // Detect new trading day
    const date = typeof bar.time === 'number'
      ? new Date(bar.time * 1000).toLocaleDateString('en-CA') // YYYY-MM-DD
      : String(bar.time).slice(0, 10)

    if (date !== curDate) {
      cumPV   = 0
      cumVol  = 0
      curDate = date
    }

    if (!bar.volume || bar.volume === 0) {
      return cumVol > 0 ? cumPV / cumVol : null
    }

    const tp = (bar.high + bar.low + bar.close) / 3
    cumPV  += tp * bar.volume
    cumVol += bar.volume
    return cumPV / cumVol
  })
}

// ─── Number helpers ───────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return '—'
  return n.toFixed(d)
}

function fmtVol(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function fmtChange(chg: number | null, pct: number | null): string {
  if (chg == null || pct == null) return '—'
  const sign = chg >= 0 ? '+' : ''
  return `${sign}${chg.toFixed(2)} (${sign}${pct.toFixed(2)}%)`
}

// ─── Crosshair overlay ───────────────────────────────────────────────────────

interface BarInfo {
  time:   string | null
  price:  number | null
  vwap:   number | null
  volume: number | null
  open:   number | null
  high:   number | null
  low:    number | null
}

const BarOverlay: React.FC<BarInfo> = ({ time, price, vwap, volume, open, high, low }) => {
  if (price == null) return null
  return (
    <div style={{
      position:      'absolute',
      top:           '8px',
      left:          '8px',
      zIndex:        10,
      background:    'rgba(0,0,0,0.8)',
      border:        '1px solid #2a2a2a',
      padding:       '4px 10px',
      fontSize:      '11px',
      color:         '#cc7700',
      pointerEvents: 'none',
      display:       'flex',
      gap:           '12px',
    }}>
      {time && <span style={{ color: '#554400' }}>{time}</span>}
      <span>O: <span style={{ color: '#ff9900' }}>{fmt(open)}</span></span>
      <span>H: <span style={{ color: '#ff9900' }}>{fmt(high)}</span></span>
      <span>L: <span style={{ color: '#ff9900' }}>{fmt(low)}</span></span>
      <span>C: <span style={{ color: '#ff9900' }}>{fmt(price)}</span></span>
      {vwap != null && <span>VWAP: <span style={{ color: '#00ccff' }}>{fmt(vwap)}</span></span>}
      {volume != null && <span>V: <span style={{ color: '#554400' }}>{fmtVol(volume)}</span></span>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  ticker:     string
  onNavigate: (cmd: string) => void
}

const GIPScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('1D')
  const [chartError, setChartError] = useState<string | null>(null)
  const [barInfo, setBarInfo] = useState<BarInfo>({
    time: null, price: null, vwap: null, volume: null, open: null, high: null, low: null,
  })

  const containerRef    = useRef<HTMLDivElement>(null)
  const chartRef        = useRef<IChartApi | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySeries = ISeriesApi<any> | null
  const priceSeriesRef  = useRef<AnySeries>(null)
  const vwapSeriesRef   = useRef<AnySeries>(null)
  const volSeriesRef    = useRef<AnySeries>(null)

  const { period, interval } = PERIOD_MAP[activePeriod]

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey:  ['chart', ticker, period, interval],
    queryFn:   () => fetchChart(ticker, period, interval),
    staleTime: 30_000,
  })

  const { data: equityData } = useQuery({
    queryKey:  ['equity', ticker],
    queryFn:   () => fetchEquity(ticker),
    staleTime: 60_000,
  })

  const isLoading = chartLoading

  // ── Derived stats ──────────────────────────────────────────────────────────
  const ohlcv     = chartData?.ohlcv ?? []
  const vwapSeries = ohlcv.length ? computeVwap(ohlcv) : []
  const lastBar   = ohlcv[ohlcv.length - 1]
  const firstBar  = ohlcv[0]
  const prevClose = equityData?.prev_close ?? null
  const lastVwap  = vwapSeries[vwapSeries.length - 1] ?? null
  const totalVol  = ohlcv.reduce((s, b) => s + b.volume, 0)

  // Change from prev close
  const lastPrice   = lastBar?.close ?? null
  const changeAbs   = lastPrice != null && prevClose != null ? lastPrice - prevClose : null
  const changePct   = changeAbs != null && prevClose ? (changeAbs / prevClose) * 100 : null
  const isUp        = changeAbs != null ? changeAbs >= 0 : true

  // ── Chart init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background:  { color: '#000000' },
        textColor:   '#cc7700',
        fontFamily:  "'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace",
        fontSize:    11,
      },
      grid: {
        vertLines: { color: '#1a1a00' },
        horzLines: { color: '#1a1a00' },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: '#ff9900', width: 1, style: 1, labelBackgroundColor: '#1a1a00' },
        horzLine: { color: '#ff9900', width: 1, style: 1, labelBackgroundColor: '#1a1a00' },
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        textColor:   '#cc7700',
      },
      timeScale: {
        borderColor:    '#2a2a2a',
        timeVisible:    true,
        secondsVisible: false,
      },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })

    chartRef.current = chart

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      priceSeriesRef.current = null
      vwapSeriesRef.current  = null
      volSeriesRef.current   = null
    }
  }, [])

  // ── Redraw on data change ──────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartData?.ohlcv?.length) return

    try {
    const bars = chartData.ohlcv
    const vwap = computeVwap(bars)

    // Remove old series
    const removeSeries = (ref: React.MutableRefObject<AnySeries>) => {
      if (ref.current) {
        try { chart.removeSeries(ref.current) } catch { /* ignore */ }
        ref.current = null
      }
    }
    removeSeries(priceSeriesRef)
    removeSeries(vwapSeriesRef)
    removeSeries(volSeriesRef)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addS = (type: any, opts: any, pane = 0) => chart.addSeries(type, opts, pane)

    // GIPScreen is intraday-only: always return UTCTimestamp so all series use the
    // same time converter. The backend may emit a string "YYYY-MM-DD" for a bar
    // whose UTC hour happens to be 0 (e.g. 8 PM EDT = midnight UTC); converting
    // that to a BusinessDay object would cause v5's selectTimeConverter to pick
    // timestampConverter for the first bar and then throw on the BusinessDay bar.
    const toTime = (t: string | number): Time => {
      if (typeof t === 'number') return t as UTCTimestamp
      const [year, month, day] = t.split('-').map(Number)
      return (Date.UTC(year, month - 1, day, 0, 0, 0, 0) / 1000) as UTCTimestamp
    }

    // ── Price area ────────────────────────────────────────────────────────
    const priceSeries = addS(AreaSeries, {
      topColor:     'rgba(255, 153, 0, 0.20)',
      bottomColor:  'rgba(255, 153, 0, 0.0)',
      lineColor:    '#ff9900',
      lineWidth:    2,
      priceScaleId: 'right',
    }, 0)
    const priceData: AreaData[] = bars.map(b => ({
      time:  toTime(b.time),
      value: b.close,
    }))
    priceSeries.setData(priceData)

    // Prev close reference line
    if (prevClose != null) {
      priceSeries.createPriceLine({
        price:               prevClose,
        color:               '#555555',
        lineWidth:           1,
        lineStyle:           LineStyle.Dashed,
        axisLabelVisible:    true,
        title:               'PREV',
      })
    }

    // Day open reference line
    if (firstBar?.open != null) {
      priceSeries.createPriceLine({
        price:               firstBar.open,
        color:               '#cc7700',
        lineWidth:           1,
        lineStyle:           LineStyle.Dashed,
        axisLabelVisible:    true,
        title:               'OPEN',
      })
    }

    priceSeriesRef.current = priceSeries

    // ── VWAP ──────────────────────────────────────────────────────────────
    const vwapSer = addS(LineSeries, {
      color:        '#00ccff',
      lineWidth:    1,
      lineStyle:    LineStyle.Solid,
      priceScaleId: 'right',
    }, 0)
    const vwapData: LineData[] = bars
      .map((b, i) => ({ time: toTime(b.time), value: vwap[i] }))
      .filter((p): p is LineData => p.value != null)
    vwapSer.setData(vwapData)
    vwapSeriesRef.current = vwapSer

    // ── Volume ─────────────────────────────────────────────────────────────
    const volSer = addS(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat:  { type: 'volume' },
      color:        '#2a2a2a',
    }, 0)
    volSer.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    const volData: HistogramData[] = bars.map(b => ({
      time:  toTime(b.time),
      value: b.volume,
      color: b.close >= b.open ? 'rgba(0,255,65,0.25)' : 'rgba(255,51,51,0.25)',
    }))
    volSer.setData(volData)
    volSeriesRef.current = volSer

    chart.timeScale().fitContent()

    // ── Crosshair subscription ────────────────────────────────────────────
    const handleCrosshair = (param: MouseEventParams) => {
      if (!param.time || !priceSeriesRef.current) {
        setBarInfo({ time: null, price: null, vwap: null, volume: null, open: null, high: null, low: null })
        return
      }
      const idx = bars.findIndex(b => toTime(b.time) === param.time)
      if (idx === -1) return
      const bar = bars[idx]
      const timeLabel = typeof bar.time === 'number'
        ? new Date(bar.time * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : String(bar.time)
      setBarInfo({
        time:   timeLabel,
        price:  bar.close,
        vwap:   vwap[idx] ?? null,
        volume: bar.volume,
        open:   bar.open,
        high:   bar.high,
        low:    bar.low,
      })
    }

    chart.subscribeCrosshairMove(handleCrosshair)
    return () => { chart.unsubscribeCrosshairMove(handleCrosshair) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[GIPScreen] chart error:', msg, err)
      setChartError(msg)
    }
  }, [chartData, prevClose])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      background:    '#000',
      overflow:      'hidden',
    }}>
      <LoadingBar loading={isLoading} />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink:   0,
        background:   '#0d0d0d',
        borderBottom: '1px solid #2a2a2a',
        padding:      '5px 10px',
        display:      'flex',
        flexDirection: 'column',
        gap:          '4px',
      }}>
        {/* Row 1: Ticker + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <span style={{
            color:         '#ff9900',
            fontSize:      '14px',
            fontWeight:    700,
            letterSpacing: '0.05em',
          }}>
            {ticker}{' '}
            <span style={{ color: '#554400', fontSize: '10px', fontWeight: 400 }}>INTRADAY</span>
          </span>

          {lastPrice != null && (
            <span style={{ color: '#e0e0e0', fontSize: '14px', fontWeight: 700 }}>
              {lastPrice.toFixed(2)}
            </span>
          )}

          {changeAbs != null && changePct != null && (
            <span style={{
              color:    isUp ? '#00ff41' : '#ff3333',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              {fmtChange(changeAbs, changePct)}
            </span>
          )}

          <span style={{ color: '#cc7700', fontSize: '11px' }}>
            OPEN <span style={{ color: '#ff9900' }}>{fmt(firstBar?.open)}</span>
          </span>

          {prevClose != null && (
            <span style={{ color: '#cc7700', fontSize: '11px' }}>
              PREV <span style={{ color: '#cc7700' }}>{prevClose.toFixed(2)}</span>
            </span>
          )}

          {lastVwap != null && (
            <span style={{ color: '#00ccff', fontSize: '11px' }}>
              VWAP <span style={{ fontWeight: 600 }}>{fmt(lastVwap)}</span>
            </span>
          )}

          {totalVol > 0 && (
            <span style={{ color: '#554400', fontSize: '11px' }}>
              VOL <span style={{ color: '#cc7700' }}>{fmtVol(totalVol)}</span>
            </span>
          )}

          {/* Period buttons right-aligned */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            {PERIODS.map(p => (
              <button
                key={p}
                className={p === activePeriod ? 'bb-btn bb-btn-active' : 'bb-btn'}
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={() => setActivePeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: interval info */}
        <div style={{ color: '#554400', fontSize: '10px', display: 'flex', gap: '16px' }}>
          <span>{interval} BARS</span>
          {chartData?.ohlcv?.length && (
            <span>{chartData.ohlcv.length} BARS · {period.toUpperCase()}</span>
          )}
          <span style={{ color: '#00ccff', opacity: 0.7 }}>━ VWAP (daily anchored)</span>
          <span style={{ color: '#cc7700', opacity: 0.7 }}>╌ OPEN</span>
          <span style={{ color: '#555555', opacity: 0.7 }}>╌ PREV CLOSE</span>
        </div>
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {chartError ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#000', color: '#ff3333', fontSize: '12px', padding: '24px',
            fontFamily: 'monospace', textAlign: 'center', gap: '8px',
          }}>
            <div>CHART ERROR</div>
            <div style={{ color: '#cc3333', fontSize: '11px', maxWidth: '600px', wordBreak: 'break-all' }}>{chartError}</div>
          </div>
        ) : (
          <>
            <BarOverlay {...barInfo} />
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          </>
        )}
      </div>
    </div>
  )
}

export default GIPScreen
