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
  type LogicalRange,
} from 'lightweight-charts'
import { fetchChart } from '../../lib/api'
import { useChartHistory } from '../../hooks/useChartHistory'
import { useLivePrice } from '../../hooks/useLivePrice'
import { useLiveBarUpdater } from '../../hooks/useLiveBarUpdater'
import LoadingBar from '../shared/LoadingBar'
import ExtendedHoursBadge from '../shared/ExtendedHoursBadge'
import C from '../../lib/colors'

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
      background: `${C.surface0}BF`, border: `1px solid ${C.border1}`,
      padding: '4px 8px', fontSize: 11, color: C.amberDim,
      pointerEvents: 'none', display: 'flex', gap: 10,
    }}>
      <span>O: {fmt(open)}</span>
      <span>H: {fmt(high)}</span>
      <span>L: {fmt(low)}</span>
      <span style={{ color: isUp ? C.green : C.red }}>C: {fmt(close)}</span>
      <span style={{ color: C.amberMute }}>V: {fmtVol(volume)}</span>
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
  const lastBarTimeRef = useRef<number>(0)

  const { period, interval } = PERIOD_MAP[activePeriod]

  const { data: chartData, isLoading, error } = useQuery({
    queryKey:  ['chart', ticker, period, interval],
    queryFn:   () => fetchChart(ticker, period, interval),
    staleTime: 60_000,
  })

  const {
    ohlcv: accumulatedOhlcv,
    hasMore,
    isLoadingOlder,
    loadOlder,
  } = useChartHistory(ticker, period, interval, chartData ?? null)

  const displayBars = accumulatedOhlcv.length > 0 ? accumulatedOhlcv : (chartData?.ohlcv ?? [])

  const { data: livePriceData } = useLivePrice(ticker, 1000, true)

  useLiveBarUpdater({
    series: mainRef.current,
    chartType,
    lastBarTimeRef,
    interval,
    livePrice: livePriceData,
    marketState: livePriceData?.market_state,
    allowPrePost: true,
  })

  // ── Chart init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: C.surface0 },
        textColor:  C.amberDim,
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: C.surfaceGlow },
        horzLines: { color: C.surfaceGlow },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: C.amber, width: 1, style: 1, labelBackgroundColor: C.surfaceGlow },
        horzLine: { color: C.amber, width: 1, style: 1, labelBackgroundColor: C.surfaceGlow },
      },
      rightPriceScale: { borderColor: C.border1, textColor: C.amberDim },
      timeScale:        { borderColor: C.border1, timeVisible: true, secondsVisible: false },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })
    chartRef.current = chart

    let panDebounceTimer: ReturnType<typeof setTimeout> | null = null
    const ts = chart.timeScale()
    const rangeHandler = (range: LogicalRange | null) => {
      if (!range) return
      if (range.from < 10) {
        if (panDebounceTimer) clearTimeout(panDebounceTimer)
        panDebounceTimer = setTimeout(() => {
          loadOlder()
        }, 250)
      }
    }
    ts.subscribeVisibleLogicalRangeChange(rangeHandler)

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      if (panDebounceTimer) clearTimeout(panDebounceTimer)
      try { ts.unsubscribeVisibleLogicalRangeChange(rangeHandler) } catch { /* chart already disposed */ }
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
        upColor:      C.amber,
        downColor:    C.red,
        priceScaleId: 'right',
      })
      const d: BarData[] = ohlcv.map(b => ({
        time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close,
      }))
      s.setData(d); mainRef.current = s

    } else if (chartType === 'CANDLE') {
      const s = addS(CandlestickSeries, {
        upColor: C.green, downColor: C.red,
        borderUpColor: C.green, borderDownColor: C.red,
        wickUpColor: C.green, wickDownColor: C.red,
        priceScaleId: 'right',
      })
      const d: CandlestickData[] = ohlcv.map(b => ({
        time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close,
      }))
      s.setData(d); mainRef.current = s

    } else {
      const s = addS(LineSeries, { color: C.amber, lineWidth: 2, priceScaleId: 'right' })
      const d: LineData[] = ohlcv.map(b => ({ time: toTime(b.time), value: b.close }))
      s.setData(d); mainRef.current = s
    }

    const lb = ohlcv[ohlcv.length - 1]
    if (lb) {
      const t = toTime(lb.time)
      lastBarTimeRef.current = typeof t === 'number' ? t : (Date.UTC((t as any).year, (t as any).month - 1, (t as any).day, 0, 0, 0) / 1000)
    }

    // Volume
    const volS = addS(HistogramSeries, {
      priceScaleId: 'vol', color: C.border1, priceFormat: { type: 'volume' },
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
      const idx = ohlcv.findIndex(b => JSON.stringify(toTime(b.time)) === JSON.stringify(param.time))
      if (idx === -1) return
      const b = ohlcv[idx]
      setCrosshair({ open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })
    }
    chart.subscribeCrosshairMove(handler)
    return () => { chart.unsubscribeCrosshairMove(handler) }
  }, [chartData, chartType])

  // ── Prepend older bars without full series recreate ──────────────────────
  const prevBarsLenRef = useRef(0)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartData) return
    const bars = displayBars
    if (bars.length === 0) return

    const initialLen = chartData.ohlcv?.length ?? 0
    if (bars.length <= initialLen && bars.length <= prevBarsLenRef.current) {
      prevBarsLenRef.current = bars.length
      return
    }

    const prevRange = chart.timeScale().getVisibleLogicalRange()
    prevBarsLenRef.current = bars.length

    const toTime = (t: string | number): Time => {
      if (typeof t === 'number') return t as UTCTimestamp
      const [year, month, day] = t.split('-').map(Number)
      return { year, month, day } as BusinessDay
    }

    if (mainRef.current) {
      if (chartType === 'BAR') {
        const d: BarData[] = bars.map(b => ({
          time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close,
        }))
        mainRef.current.setData(d as any)
      } else if (chartType === 'CANDLE') {
        const d: CandlestickData[] = bars.map(b => ({
          time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close,
        }))
        mainRef.current.setData(d as any)
      } else {
        const d: LineData[] = bars.map(b => ({ time: toTime(b.time), value: b.close }))
        mainRef.current.setData(d as any)
      }
    }

    if (volRef.current) {
      const volData: HistogramData[] = bars.map(b => ({
        time: toTime(b.time), value: b.volume,
        color: b.close >= b.open ? 'rgba(255,153,0,0.35)' : 'rgba(255,51,51,0.30)',
      }))
      volRef.current.setData(volData as any)
    }

    if (prevRange) {
      chart.timeScale().setVisibleLogicalRange(prevRange)
    }
  }, [displayBars, chartData, chartType])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface0, overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: 44,
        background: C.surface1, borderBottom: `1px solid ${C.border1}`,
        display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px',
      }}>
        {/* Ticker */}
        <span style={{ color: C.amber, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', marginRight: 8 }}>
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

        <span style={{ color: C.border1, margin: '0 4px' }}>|</span>

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

        <span style={{ marginLeft: 'auto', color: C.amberMute, fontSize: 10 }}>
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
            background: `${C.surface0}CC`, color: C.red, fontSize: 13, zIndex: 20,
          }}>
            ERR: {(error as Error).message ?? 'Failed to load chart data'}
          </div>
        )}

        <OhlcvOverlay {...crosshair} />
        <ExtendedHoursBadge marketState={livePriceData?.market_state} />
        {isLoadingOlder && (
          <div style={{
            position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            zIndex: 12, background: `${C.surface0}CC`, border: `1px solid ${C.border1}`,
            borderRadius: '4px', padding: '4px 12px',
            fontSize: '10px', color: C.amber, letterSpacing: '0.05em', pointerEvents: 'none',
          }}>
            LOADING OLDER BARS...
          </div>
        )}
        {!hasMore && !isLoadingOlder && (
          <div style={{
            position: 'absolute', bottom: 32, left: 8,
            zIndex: 12, fontSize: '9px', color: C.amberMute, letterSpacing: '0.05em',
          }}>
            EARLIEST DATA AVAILABLE
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

export default GPOScreen
