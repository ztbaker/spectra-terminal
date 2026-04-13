import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type BusinessDay,
  type UTCTimestamp,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type AreaData,
  type MouseEventParams,
} from 'lightweight-charts'
import { fetchChart } from '../../lib/api'
import { useLivePrice } from '../../hooks/useLivePrice'
import LoadingBar from '../shared/LoadingBar'

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodKey = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'MAX'
type ChartType = 'CANDLE' | 'LINE' | 'AREA'
type IndicatorKey = 'SMA20' | 'SMA50' | 'SMA200' | 'RSI' | 'MACD' | 'BB'

interface PeriodConfig {
  period: string
  interval: string
}

const PERIOD_MAP: Record<PeriodKey, PeriodConfig> = {
  '1D':  { period: '1d',  interval: '5m'  },
  '5D':  { period: '5d',  interval: '15m' },
  '1M':  { period: '1mo', interval: '1h'  },
  '3M':  { period: '3mo', interval: '1d'  },
  '6M':  { period: '6mo', interval: '1d'  },
  '1Y':  { period: '1y',  interval: '1d'  },
  '2Y':  { period: '2y',  interval: '1wk' },
  '5Y':  { period: '5y',  interval: '1wk' },
  'MAX': { period: 'max', interval: '1mo' },
}

const PERIODS: PeriodKey[] = ['1D', '5D', '1M', '3M', '6M', '1Y', '2Y', '5Y', 'MAX']
const CHART_TYPES: ChartType[] = ['CANDLE', 'LINE', 'AREA']
const INDICATORS: IndicatorKey[] = ['SMA20', 'SMA50', 'SMA200', 'RSI', 'MACD', 'BB']

// ─── Number helpers ───────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—'
  return n.toFixed(decimals)
}

function fmtVol(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

// ─── Crosshair overlay ───────────────────────────────────────────────────────

interface OhlcvOverlayProps {
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

const OhlcvOverlay: React.FC<OhlcvOverlayProps> = ({ open, high, low, close, volume }) => {
  if (open == null && high == null && low == null && close == null) return null
  const isUp = close != null && open != null ? close >= open : true
  return (
    <div
      style={{
        position: 'absolute',
        top: '8px',
        left: '8px',
        zIndex: 10,
        background: 'rgba(0,0,0,0.75)',
        border: '1px solid #2a2a2a',
        padding: '4px 8px',
        fontSize: '11px',
        color: '#cc7700',
        pointerEvents: 'none',
        display: 'flex',
        gap: '10px',
        fontFamily: 'inherit',
      }}
    >
      <span><span className="bb-label">O: </span><span className="bb-value">{fmt(open)}</span></span>
      <span><span className="bb-label">H: </span><span className="bb-value">{fmt(high)}</span></span>
      <span><span className="bb-label">L: </span><span className="bb-value">{fmt(low)}</span></span>
      <span>
        <span className="bb-label">C: </span>
        <span style={{ color: isUp ? '#00ff41' : '#ff3333' }}>{fmt(close)}</span>
      </span>
      <span><span className="bb-label">V: </span><span className="bb-value">{fmtVol(volume)}</span></span>
    </div>
  )
}

// ─── Period stats overlay ─────────────────────────────────────────────────────

function formatStatDate(t: string | number): string {
  if (typeof t === 'number') {
    const d = new Date(t * 1000)
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
  }
  const [yr, mo, dy] = t.split('-')
  return `${mo}/${dy}/${yr.slice(2)}`
}

interface ChartStats {
  last:  number
  prev:  number
  high:  { value: number; date: string }
  low:   { value: number; date: string }
  avg:   number
}

interface LivePrice {
  price: number | null
  change: number | null
  change_pct: number | null
}

// ─── Price sidebar ────────────────────────────────────────────────────────────

interface SidebarProps {
  stats:     ChartStats | null
  crosshair: OhlcvOverlayProps
  period:    string
  livePrice?: LivePrice
}

const PriceSidebar: React.FC<SidebarProps> = ({ stats, crosshair, period, livePrice }) => {
  if (!stats) return null

  const dp     = stats.last >= 100 ? 2 : stats.last >= 10 ? 3 : 4
  const last   = crosshair.close ?? livePrice?.price ?? stats.last
  const prev   = stats.prev
  const chg    = livePrice?.change ?? (last - prev)
  const pct    = livePrice?.change_pct ?? (chg / prev * 100)
  const isUp   = chg >= 0
  const chgCol = isUp ? '#00ff41' : '#ff3333'

  const fv = (n: number, decimals = dp): string => n.toFixed(decimals)
  const fvSigned = (n: number, decimals = dp): string => `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}`

  const Row = ({ label, value, color = '#cccccc' }: { label: string; value: string; color?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ color: '#554400', fontSize: 9, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ color, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>{value}</span>
    </div>
  )

  return (
    <div style={{
      position:      'absolute',
      top:           8,
      right:         8,
      zIndex:        5,
      width:         148,
      background:    'rgba(8,8,8,0.88)',
      border:        '1px solid #2a2a2a',
      padding:       '8px 10px',
      fontFamily:    "'JetBrains Mono','Courier New',monospace",
      display:       'flex',
      flexDirection: 'column',
      pointerEvents: 'none',
    }}>
      {/* Title */}
      <div style={{
        color:         '#ff9900',
        fontSize:      10,
        letterSpacing: '0.1em',
        marginBottom:  10,
        paddingBottom: 6,
        borderBottom:  '1px solid #2a2a2a',
      }}>
        PRICE SUMMARY
      </div>

      {/* Last */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#554400', fontSize: 9, letterSpacing: '0.08em', marginBottom: 3 }}>LAST</div>
        <div style={{ color: chgCol, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
          {fv(last)}
        </div>
      </div>

      {/* Stats rows */}
      <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 8 }}>
        <Row label="Chg"  value={fvSigned(chg)}          color={chgCol} />
        <Row label="Chg%" value={fvSigned(pct, 2) + '%'} color={chgCol} />
        <Row label="High" value={fv(stats.high.value)}    color="#e0e0e0" />
        <Row label="Low"  value={fv(stats.low.value)}     color="#e0e0e0" />
        <Row label="Avg"  value={fv(stats.avg)}           color="#cc7700" />
      </div>

      {/* Period label */}
      <div style={{ marginTop: 'auto', paddingTop: 8, color: '#2a2a2a', fontSize: 9 }}>
        {period.toUpperCase()} PERIOD
      </div>
    </div>
  )
}

// ─── Toolbar button styles ────────────────────────────────────────────────────

const TAB_ACTIVE: React.CSSProperties = {
  background: '#ff9900', color: '#000', border: 'none',
  fontWeight: 700, padding: '2px 8px', fontSize: '11px',
  fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.04em',
}
const TAB_INACTIVE: React.CSSProperties = {
  background: 'transparent', color: '#554400', border: 'none',
  padding: '2px 8px', fontSize: '11px',
  fontFamily: 'inherit', cursor: 'pointer',
}
const IND_ACTIVE: React.CSSProperties = {
  background: '#ff9900', color: '#000', border: 'none',
  fontWeight: 700, padding: '1px 6px', fontSize: '10px',
  fontFamily: 'inherit', cursor: 'pointer',
}
const IND_INACTIVE: React.CSSProperties = {
  background: 'transparent', color: '#554400', border: 'none',
  padding: '1px 6px', fontSize: '10px',
  fontFamily: 'inherit', cursor: 'pointer',
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

const ChartScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('1Y')
  const [chartType, setChartType] = useState<ChartType>('LINE')
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(
    new Set(['SMA20', 'SMA50'])
  )

  const [crosshairOhlcv, setCrosshairOhlcv] = useState<OhlcvOverlayProps>({
    open: null, high: null, low: null, close: null, volume: null,
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)

  // Series refs — typed as any to accommodate LW Charts v5 generic addSeries return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySeries = ISeriesApi<any> | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyPriceLine = any
  const mainSeriesRef   = useRef<AnySeries>(null)
  const priceLineRef    = useRef<AnyPriceLine>(null)
  const sma20Ref        = useRef<AnySeries>(null)
  const sma50Ref        = useRef<AnySeries>(null)
  const sma200Ref       = useRef<AnySeries>(null)
  const bbUpperRef      = useRef<AnySeries>(null)
  const bbMidRef        = useRef<AnySeries>(null)
  const bbLowerRef      = useRef<AnySeries>(null)
  const rsiSeriesRef    = useRef<AnySeries>(null)
  const macdLineRef     = useRef<AnySeries>(null)
  const macdSignalRef   = useRef<AnySeries>(null)
  const macdHistRef     = useRef<AnySeries>(null)

  const { period, interval } = PERIOD_MAP[activePeriod]

  const { data: chartData, isLoading, error } = useQuery({
    queryKey: ['chart', ticker, period, interval],
    queryFn: () => fetchChart(ticker, period, interval),
    staleTime: 60_000,
  })

  const { data: livePriceData } = useLivePrice(ticker, 500, true)

  // ── Period stats derived from chart data ──────────────────────────────────
  const chartStats = useMemo<ChartStats | null>(() => {
    const bars = chartData?.ohlcv
    if (!bars?.length) return null
    const last = bars[bars.length - 1].close
    const prev = bars.length > 1 ? bars[bars.length - 2].close : last
    const avg  = bars.reduce((s, b) => s + b.close, 0) / bars.length
    const highBar = bars.reduce((best, b) => b.high > best.high ? b : best, bars[0])
    const lowBar  = bars.reduce((best, b) => b.low  < best.low  ? b : best, bars[0])
    return {
      last, prev, avg,
      high: { value: highBar.high, date: formatStatDate(highBar.time) },
      low:  { value: lowBar.low,   date: formatStatDate(lowBar.time)  },
    }
  }, [chartData])

  // ── Update live price line when live price changes ───────────────────────────
  useEffect(() => {
    if (!livePriceData?.price) return
    const series = mainSeriesRef.current
    if (!series) return
    // Remove old price line and create new one with updated price
    if (priceLineRef.current) {
      try { series.removePriceLine(priceLineRef.current) } catch (_) {}
    }
    try {
      priceLineRef.current = series.createPriceLine({
        price: livePriceData.price,
        color: '#ffcc00',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '',
      })
    } catch (_) {}
  }, [livePriceData?.price])

  const toggleIndicator = useCallback((ind: IndicatorKey) => {
    setActiveIndicators(prev => {
      const next = new Set(prev)
      if (next.has(ind)) next.delete(ind)
      else next.add(ind)
      return next
    })
  }, [])

  // ── Chart initialization ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#000000' },
        textColor: '#cc7700',
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a1a00' },
        horzLines: { color: '#1a1a00' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#ff9900', width: 1, style: 1, labelBackgroundColor: '#1a1a00' },
        horzLine: { color: '#ff9900', width: 1, style: 1, labelBackgroundColor: '#1a1a00' },
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        textColor: '#cc7700',
      },
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })

    chartRef.current = chart

    // Resize observer
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      mainSeriesRef.current   = null
      priceLineRef.current   = null
      sma20Ref.current        = null
      sma50Ref.current        = null
      sma200Ref.current       = null
      bbUpperRef.current      = null
      bbMidRef.current        = null
      bbLowerRef.current      = null
      rsiSeriesRef.current    = null
      macdLineRef.current     = null
      macdSignalRef.current   = null
      macdHistRef.current     = null
    }
  }, []) // only on mount

  // ── Re-draw all series when data or config changes ────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartData) return

    const ohlcv = chartData.ohlcv ?? []
    if (ohlcv.length === 0) return

    // Helper to normalize time values
    const toTime = (t: string | number): Time => {
      if (typeof t === 'number') return t as UTCTimestamp
      const [year, month, day] = t.split('-').map(Number)
      return { year, month, day } as BusinessDay
    }

    // ── Remove old series if present ────────────────────────────────────────
    const removeSeries = <T extends ISeriesApi<any>>(ref: React.MutableRefObject<T | null>) => {
      if (ref.current) {
        try { chart.removeSeries(ref.current) } catch (_) {}
        ref.current = null
      }
    }
    removeSeries(mainSeriesRef as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(sma20Ref as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(sma50Ref as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(sma200Ref as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(bbUpperRef as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(bbMidRef as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(bbLowerRef as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(rsiSeriesRef as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(macdLineRef as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(macdSignalRef as React.MutableRefObject<ISeriesApi<any> | null>)
    removeSeries(macdHistRef as React.MutableRefObject<ISeriesApi<any> | null>)

    // ── Determine pane indices ───────────────────────────────────────────────
    // pane 0: main price + volume
    // pane 1: RSI  (if active)
    // pane 2: MACD (if active)
    const showRSI  = activeIndicators.has('RSI')
    const showMACD = activeIndicators.has('MACD')
    const rsiPane  = 1
    const macdPane = showRSI ? 2 : 1

    // LW Charts v5: pane index is the 3rd arg to addSeries, NOT part of options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addS = (type: any, opts: any, pane = 0) => chart.addSeries(type, opts, pane)

    // ── Main price series ────────────────────────────────────────────────────
    if (chartType === 'CANDLE') {
      const series = addS(CandlestickSeries, {
        upColor:          '#00ff41',
        downColor:        '#ff3333',
        borderUpColor:    '#00ff41',
        borderDownColor:  '#ff3333',
        wickUpColor:      '#00ff41',
        wickDownColor:    '#ff3333',
        priceScaleId:     'right',
      }, 0)
      const data: CandlestickData[] = ohlcv.map(b => ({
        time:  toTime(b.time),
        open:  b.open,
        high:  b.high,
        low:   b.low,
        close: b.close,
      }))
      series.setData(data)
      mainSeriesRef.current = series
    } else if (chartType === 'LINE') {
      const series = addS(LineSeries, {
        color:        '#e0e0e0',
        lineWidth:    2,
        priceScaleId: 'right',
      }, 0)
      const data: LineData[] = ohlcv.map(b => ({
        time:  toTime(b.time),
        value: b.close,
      }))
      series.setData(data)
      mainSeriesRef.current = series as unknown as ISeriesApi<'Line'>
    } else {
      // AREA — white line with subtle fill, Bloomberg GP style
      const series = addS(AreaSeries, {
        topColor:     'rgba(220,220,220,0.15)',
        bottomColor:  'rgba(220,220,220,0.0)',
        lineColor:    '#e0e0e0',
        lineWidth:    2,
        priceScaleId: 'right',
      }, 0)
      const data: AreaData[] = ohlcv.map(b => ({
        time:  toTime(b.time),
        value: b.close,
      }))
      series.setData(data)
      mainSeriesRef.current = series as unknown as ISeriesApi<'Area'>
    }

    // ── SMA20 ────────────────────────────────────────────────────────────────
    if (activeIndicators.has('SMA20') && chartData.sma20?.length) {
      const s = addS(LineSeries, {
        color:     '#0088ff',
        lineWidth: 1,
        priceScaleId: 'right',
      }, 0)
      const d: LineData[] = ohlcv
        .map((b, i) => ({ time: toTime(b.time), value: chartData.sma20[i] }))
        .filter((p): p is LineData => p.value != null)
      s.setData(d)
      sma20Ref.current = s
    }

    // ── SMA50 ────────────────────────────────────────────────────────────────
    if (activeIndicators.has('SMA50') && chartData.sma50?.length) {
      const s = addS(LineSeries, {
        color:     '#ffcc00',
        lineWidth: 1,
        priceScaleId: 'right',
      }, 0)
      const d: LineData[] = ohlcv
        .map((b, i) => ({ time: toTime(b.time), value: chartData.sma50[i] }))
        .filter((p): p is LineData => p.value != null)
      s.setData(d)
      sma50Ref.current = s
    }

    // ── SMA200 ───────────────────────────────────────────────────────────────
    if (activeIndicators.has('SMA200') && chartData.sma200?.length) {
      const s = addS(LineSeries, {
        color:     '#cc7700',
        lineWidth: 1,
        lineStyle: 2, // dashed
        priceScaleId: 'right',
      }, 0)
      const d: LineData[] = ohlcv
        .map((b, i) => ({ time: toTime(b.time), value: chartData.sma200[i] }))
        .filter((p): p is LineData => p.value != null)
      s.setData(d)
      sma200Ref.current = s
    }

    // ── Bollinger Bands ───────────────────────────────────────────────────────
    if (activeIndicators.has('BB')) {
      if (chartData.bb_upper?.length) {
        const s = addS(LineSeries, {
          color:     '#ff9900',
          lineWidth: 1,
          lineStyle: 2,
          priceScaleId: 'right',
        }, 0)
        const d: LineData[] = ohlcv
          .map((b, i) => ({ time: toTime(b.time), value: chartData.bb_upper[i] }))
          .filter((p): p is LineData => p.value != null)
        s.setData(d)
        bbUpperRef.current = s
      }
      if (chartData.bb_mid?.length) {
        const s = addS(LineSeries, {
          color:     '#cc7700',
          lineWidth: 1,
          lineStyle: 1,
          priceScaleId: 'right',
        }, 0)
        const d: LineData[] = ohlcv
          .map((b, i) => ({ time: toTime(b.time), value: chartData.bb_mid[i] }))
          .filter((p): p is LineData => p.value != null)
        s.setData(d)
        bbMidRef.current = s
      }
      if (chartData.bb_lower?.length) {
        const s = addS(LineSeries, {
          color:     '#ff9900',
          lineWidth: 1,
          lineStyle: 2,
          priceScaleId: 'right',
        }, 0)
        const d: LineData[] = ohlcv
          .map((b, i) => ({ time: toTime(b.time), value: chartData.bb_lower[i] }))
          .filter((p): p is LineData => p.value != null)
        s.setData(d)
        bbLowerRef.current = s
      }
    }

    // ── RSI ───────────────────────────────────────────────────────────────────
    if (showRSI && chartData.rsi?.length) {
      const s = addS(LineSeries, {
        color:        '#0088ff',
        lineWidth:    1,
        priceScaleId: 'rsi',
      }, rsiPane)
      s.priceScale().applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.1 },
      })
      const d: LineData[] = ohlcv
        .map((b, i) => ({ time: toTime(b.time), value: chartData.rsi[i] }))
        .filter((p): p is LineData => p.value != null)
      s.setData(d)
      rsiSeriesRef.current = s
    }

    // ── MACD ──────────────────────────────────────────────────────────────────
    if (showMACD) {
      if (chartData.macd_line?.length) {
        const s = addS(LineSeries, {
          color:        '#ff9900',
          lineWidth:    1,
          priceScaleId: 'macd',
        }, macdPane)
        s.priceScale().applyOptions({
          scaleMargins: { top: 0.1, bottom: 0.1 },
        })
        const d: LineData[] = ohlcv
          .map((b, i) => ({ time: toTime(b.time), value: chartData.macd_line[i] }))
          .filter((p): p is LineData => p.value != null)
        s.setData(d)
        macdLineRef.current = s
      }
      if (chartData.macd_signal?.length) {
        const s = addS(LineSeries, {
          color:        '#ffcc00',
          lineWidth:    1,
          priceScaleId: 'macd',
        }, macdPane)
        const d: LineData[] = ohlcv
          .map((b, i) => ({ time: toTime(b.time), value: chartData.macd_signal[i] }))
          .filter((p): p is LineData => p.value != null)
        s.setData(d)
        macdSignalRef.current = s
      }
      if (chartData.macd_hist?.length) {
        const s = addS(HistogramSeries, {
          priceScaleId: 'macd',
          color:        '#554400',
        }, macdPane)
        const d: HistogramData[] = ohlcv
          .map((b, i) => {
            const v = chartData.macd_hist[i]
            if (v == null) return null
            return {
              time:  toTime(b.time),
              value: v,
              color: v >= 0 ? 'rgba(0,255,65,0.5)' : 'rgba(255,51,51,0.5)',
            } as HistogramData
          })
          .filter((p): p is HistogramData => p !== null)
        s.setData(d)
        macdHistRef.current = s
      }
    }

    // ── Fit content ──────────────────────────────────────────────────────────
    chart.timeScale().fitContent()

    // ── Crosshair subscription ────────────────────────────────────────────────
    const handleCrosshair = (param: MouseEventParams) => {
      if (!param.time || !mainSeriesRef.current) {
        setCrosshairOhlcv({ open: null, high: null, low: null, close: null, volume: null })
        return
      }

      // Find matching bar by time
      const idx = ohlcv.findIndex(b => toTime(b.time) === param.time)
      if (idx === -1) {
        setCrosshairOhlcv({ open: null, high: null, low: null, close: null, volume: null })
        return
      }
      const bar = ohlcv[idx]
      setCrosshairOhlcv({
        open:   bar.open,
        high:   bar.high,
        low:    bar.low,
        close:  bar.close,
        volume: bar.volume,
      })
    }

    chart.subscribeCrosshairMove(handleCrosshair)

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshair)
    }
  }, [chartData, chartType, activeIndicators])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#000',
        overflow: 'hidden',
      }}
    >
      {/* Loading bar */}
      <LoadingBar loading={isLoading} />

      {/* Toolbar */}
      <div style={{ flexShrink: 0, background: '#0d0d0d', borderBottom: '1px solid #2a2a2a' }}>
        {/* Row 1: ticker + period tabs + chart type */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px', height: 32 }}>
          <span style={{ color: '#ff9900', fontSize: 13, fontWeight: 700, marginRight: 8, letterSpacing: '0.05em' }}>
            {ticker}
          </span>
          <span style={{ color: '#2a2a2a', fontSize: 11, margin: '0 6px' }}>|</span>
          {PERIODS.map(p => (
            <button key={p} style={p === activePeriod ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setActivePeriod(p)}>
              {p}
            </button>
          ))}
          <span style={{ color: '#2a2a2a', fontSize: 11, margin: '0 6px' }}>|</span>
          {CHART_TYPES.map(t => (
            <button key={t} style={t === chartType ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setChartType(t)}>
              {t}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', color: '#2a2a2a', fontSize: 10 }}>
            {period.toUpperCase()} · {interval}{chartData?.ohlcv?.length ? ` · ${chartData.ohlcv.length}` : ''}
          </span>
        </div>
        {/* Row 2: indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 8px 4px', height: 24 }}>
          <span style={{ color: '#2a2a2a', fontSize: 9, letterSpacing: '0.06em', marginRight: 6 }}>INDICATORS</span>
          {INDICATORS.map(ind => (
            <button
              key={ind}
              style={activeIndicators.has(ind) ? IND_ACTIVE : IND_INACTIVE}
              onClick={() => toggleIndicator(ind)}
            >
              {ind}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Error overlay */}
        {error && !isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              background: 'rgba(0,0,0,0.8)',
              color: '#ff3333',
              fontSize: '13px',
            }}
          >
            ERR: {(error as Error).message ?? 'Failed to load chart data'}
          </div>
        )}

        {/* Loading skeleton overlay */}
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 15,
              background: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span style={{ color: '#ff9900', fontSize: '12px', opacity: 0.6 }}>
              LOADING {ticker} · {period.toUpperCase()} · {interval}
            </span>
            <div className="bb-loading-bg" style={{ width: '200px' }}>
              <div className="bb-loading-bar" />
            </div>
          </div>
        )}

        {/* Crosshair OHLCV overlay */}
        <OhlcvOverlay {...crosshairOhlcv} />

        {/* Price stats overlay (top-right) */}
        <PriceSidebar stats={chartStats} crosshair={crosshairOhlcv} period={activePeriod} livePrice={livePriceData ?? undefined} />

        {/* Lightweight-charts mount point */}
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}

export default ChartScreen
