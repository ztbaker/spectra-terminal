/**
 * GPOScreen — Price Bar Chart (GPO command)
 *
 * Classic OHLC bar chart for any security.
 * Defaults to BAR (vertical OHLC bar) style; switchable to CANDLE/LINE.
 * Uses the same /chart/{ticker} endpoint as GP.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  BarSeries,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type BusinessDay,
  type UTCTimestamp,
  type BarData,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type MouseEventParams,
} from 'lightweight-charts'
import { fetchChart } from '../../lib/api'
import LoadingBar from '../shared/LoadingBar'

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartType = 'BAR' | 'CANDLE' | 'LINE'
type PeriodKey = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'MAX'

interface PeriodConfig { period: string; interval: string }

const PERIOD_MAP: Record<PeriodKey, PeriodConfig> = {
  '1D':  { period: '1d',  interval: '5m'  },
  '5D':  { period: '5d',  interval: '15m' },
  '1M':  { period: '1mo', interval: '1d'  },
  '3M':  { period: '3mo', interval: '1d'  },
  '6M':  { period: '6mo', interval: '1d'  },
  '1Y':  { period: '1y',  interval: '1d'  },
  '2Y':  { period: '2y',  interval: '1wk' },
  '5Y':  { period: '5y',  interval: '1wk' },
  'MAX': { period: 'max', interval: '1mo' },
}

const PERIODS:     PeriodKey[] = ['1D', '5D', '1M', '3M', '6M', '1Y', '2Y', '5Y', 'MAX']
const CHART_TYPES: ChartType[] = ['BAR', 'CANDLE', 'LINE']

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

// ─── OHLCV crosshair overlay ──────────────────────────────────────────────────

interface OhlcvState {
  open: number | null; high: number | null
  low:  number | null; close: number | null
  volume: number | null
}

const OhlcvOverlay: React.FC<OhlcvState> = ({ open, high, low, close, volume }) => {
  if (open == null && close == null) return null
  const isUp = close != null && open != null ? close >= open : true
  return (
    <div style={{
      position: 'absolute', top: 8, left: 8, zIndex: 10,
      background: 'rgba(0,0,0,0.75)', border: '1px solid #2a2a2a',
      padding: '4px 8px', fontSize: 11, color: '#cc7700',
      pointerEvents: 'none', display: 'flex', gap: 10,
    }}>
      <span>O: {fmt(open)}</span>
      <span>H: {fmt(high)}</span>
      <span>L: {fmt(low)}</span>
      <span style={{ color: isUp ? '#00ff41' : '#ff3333' }}>C: {fmt(close)}</span>
      <span style={{ color: '#554400' }}>V: {fmtVol(volume)}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  ticker:     string
  onNavigate: (cmd: string) => void
}

const GPOScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('1Y')
  const [chartType,    setChartType]    = useState<ChartType>('BAR')
  const [crosshair,    setCrosshair]    = useState<OhlcvState>({
    open: null, high: null, low: null, close: null, volume: null,
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySeries = ISeriesApi<any> | null
  const mainRef  = useRef<AnySeries>(null)
  const volRef   = useRef<AnySeries>(null)

  const { period, interval } = PERIOD_MAP[activePeriod]

  const { data: chartData, isLoading, error } = useQuery({
    queryKey:  ['chart', ticker, period, interval],
    queryFn:   () => fetchChart(ticker, period, interval),
    staleTime: 60_000,
  })

  // ── Chart init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#000000' },
        textColor:  '#cc7700',
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace",
        fontSize:   11,
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
      rightPriceScale: { borderColor: '#2a2a2a', textColor: '#cc7700' },
      timeScale:        { borderColor: '#2a2a2a', timeVisible: true, secondsVisible: false },
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
      ro.disconnect(); chart.remove(); chartRef.current = null
      mainRef.current = null; volRef.current = null
    }
  }, [])

  // ── Series update ──────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartData?.ohlcv?.length) return

    const ohlcv = chartData.ohlcv
    const toTime = (t: string | number): Time => {
      if (typeof t === 'number') return t as UTCTimestamp
      const [year, month, day] = t.split('-').map(Number)
      return { year, month, day } as BusinessDay
    }

    // Remove old series
    ;[mainRef, volRef].forEach(ref => {
      if (ref.current) {
        try { chart.removeSeries(ref.current) } catch { /* ignore */ }
        ref.current = null
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addS = (type: any, opts: any, pane = 0) => chart.addSeries(type, opts, pane)

    if (chartType === 'BAR') {
      // Classic OHLC bar chart — up bars in amber, down bars in red
      const s = addS(BarSeries, {
        upColor:      '#ff9900',
        downColor:    '#ff3333',
        priceScaleId: 'right',
      })
      const d: BarData[] = ohlcv.map(b => ({
        time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close,
      }))
      s.setData(d); mainRef.current = s

    } else if (chartType === 'CANDLE') {
      const s = addS(CandlestickSeries, {
        upColor: '#00ff41', downColor: '#ff3333',
        borderUpColor: '#00ff41', borderDownColor: '#ff3333',
        wickUpColor: '#00ff41', wickDownColor: '#ff3333',
        priceScaleId: 'right',
      })
      const d: CandlestickData[] = ohlcv.map(b => ({
        time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close,
      }))
      s.setData(d); mainRef.current = s

    } else {
      const s = addS(LineSeries, { color: '#ff9900', lineWidth: 2, priceScaleId: 'right' })
      const d: LineData[] = ohlcv.map(b => ({ time: toTime(b.time), value: b.close }))
      s.setData(d); mainRef.current = s
    }

    // Volume
    const volS = addS(HistogramSeries, {
      priceScaleId: 'vol', color: '#2a2a2a', priceFormat: { type: 'volume' },
    })
    volS.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0 } })
    const volData: HistogramData[] = ohlcv.map(b => ({
      time:  toTime(b.time),
      value: b.volume,
      color: b.close >= b.open ? 'rgba(255,153,0,0.35)' : 'rgba(255,51,51,0.30)',
    }))
    volS.setData(volData); volRef.current = volS

    chart.timeScale().fitContent()

    // Crosshair
    const handler = (param: MouseEventParams) => {
      if (!param.time || !mainRef.current) {
        setCrosshair({ open: null, high: null, low: null, close: null, volume: null }); return
      }
      const idx = ohlcv.findIndex(b => toTime(b.time) === param.time)
      if (idx === -1) return
      const b = ohlcv[idx]
      setCrosshair({ open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })
    }
    chart.subscribeCrosshairMove(handler)
    return () => { chart.unsubscribeCrosshairMove(handler) }
  }, [chartData, chartType])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000', overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: 44,
        background: '#0d0d0d', borderBottom: '1px solid #2a2a2a',
        display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px',
      }}>
        {/* Ticker */}
        <span style={{ color: '#ff9900', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', marginRight: 8 }}>
          {ticker}
        </span>

        {/* Periods */}
        {PERIODS.map(p => (
          <button
            key={p}
            className={p === activePeriod ? 'bb-btn bb-btn-active' : 'bb-btn'}
            style={{ padding: '2px 6px', fontSize: 11 }}
            onClick={() => setActivePeriod(p)}
          >
            {p}
          </button>
        ))}

        <span style={{ color: '#2a2a2a', margin: '0 4px' }}>|</span>

        {/* Chart type toggle */}
        {CHART_TYPES.map(t => (
          <button
            key={t}
            className={t === chartType ? 'bb-btn bb-btn-active' : 'bb-btn'}
            style={{ padding: '2px 6px', fontSize: 11 }}
            onClick={() => setChartType(t)}
          >
            {t}
          </button>
        ))}

        <span style={{ marginLeft: 'auto', color: '#554400', fontSize: 10 }}>
          {period.toUpperCase()} · {interval}
          {chartData?.ohlcv?.length ? ` · ${chartData.ohlcv.length} bars` : ''}
        </span>
      </div>

      {/* ── Chart container ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>

        {error && !isLoading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.8)', color: '#ff3333', fontSize: 13, zIndex: 20,
          }}>
            ERR: {(error as Error).message ?? 'Failed to load chart data'}
          </div>
        )}

        <OhlcvOverlay {...crosshair} />
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

export default GPOScreen
