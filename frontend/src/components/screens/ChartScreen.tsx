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
  type MouseEventParams,
  type LogicalRange,
} from 'lightweight-charts'
import { fetchChart } from '../../lib/api'
import { useChartHistory } from '../../hooks/useChartHistory'
import { useLivePrice } from '../../hooks/useLivePrice'
import { useLiveBarUpdater, getActivePrice } from '../../hooks/useLiveBarUpdater'
import LoadingBar from '../shared/LoadingBar'
import ExtendedHoursBadge from '../shared/ExtendedHoursBadge'
import OdometerNumber from '../shared/OdometerNumber'
import theme from '../../lib/theme'

const TH = theme

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
        background: TH.color.bgSurface,
        border: `1px solid ${TH.color.borderMedium}`,
        borderRadius: '4px',
        padding: '4px 8px',
        fontSize: '11px',
        color: TH.color.textSecondary,
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
        <span style={{ color: isUp ? TH.color.accentPositive : TH.color.accentNegative }}>{fmt(close)}</span>
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

// ─── Session shading ────────────────────────────────────────────────────────────

const INTRADAY_INTERVALS_SET = new Set(['1m', '5m', '15m', '30m', '1h'])

interface SessionShadingProps {
  chart: IChartApi | null
  ohlcv: { time: string | number; close: number }[]
  interval: string
}

const SessionShading: React.FC<SessionShadingProps> = ({ chart, ohlcv, interval }) => {
  const [shades, setShades] = useState<{ left: number; width: number }[]>([])

  useEffect(() => {
    if (!chart || !ohlcv.length || !INTRADAY_INTERVALS_SET.has(interval)) {
      setShades([])
      return
    }

    const compute = () => {
      const ts = chart.timeScale()
      const result: { left: number; width: number }[] = []

      for (let i = 0; i < ohlcv.length; i++) {
        const bar = ohlcv[i]
        const nextBar = ohlcv[i + 1]

        const barTime = typeof bar.time === 'number' ? bar.time * 1000 : new Date(String(bar.time)).getTime()
        const d = new Date(barTime)
        const hour = d.getHours()
        const minute = d.getMinutes()
        const totalMin = hour * 60 + minute

        const isExtended = totalMin < 570 || totalMin >= 960

        if (!isExtended) continue

        const x1 = ts.timeToCoordinate((typeof bar.time === 'number' ? bar.time : bar.time) as unknown as Time)
        let x2: number | null
        if (nextBar) {
          x2 = ts.timeToCoordinate((typeof nextBar.time === 'number' ? nextBar.time : nextBar.time) as unknown as Time)
        } else {
          x2 = x1 != null ? x1 + 4 : null
        }

        if (x1 == null || x2 == null) continue
        const left = Math.min(x1, x2)
        const width = Math.abs(x2 - x1) || 2
        result.push({ left, width })
      }

      setShades(result)
    }

    compute()

    const ts = chart.timeScale()
    const handler = () => compute()
    ts.subscribeVisibleTimeRangeChange(handler)
    return () => { try { ts.unsubscribeVisibleTimeRangeChange(handler) } catch { /* chart already disposed */ } }
  }, [chart, ohlcv, interval])

  if (!shades.length) return null

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 1,
      overflow: 'hidden',
    }}>
      {shades.map((s, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: s.left,
          width: s.width,
          background: 'rgba(245,158,11,0.04)',
        }} />
      ))}
    </div>
  )
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
  market_state?: 'PRE' | 'OPEN' | 'POST' | 'CLOSED'
  pre_market_price?: number | null
  pre_market_change?: number | null
  pre_market_change_pct?: number | null
  post_market_price?: number | null
  post_market_change?: number | null
  post_market_change_pct?: number | null
  regular_close?: number | null
}

// ─── Price sidebar ────────────────────────────────────────────────────────────

interface SidebarProps {
  stats:     ChartStats | null
  crosshair: OhlcvOverlayProps
  period:    string
  livePrice?: LivePrice
}

const PriceSidebar: React.FC<SidebarProps> = ({ stats, crosshair, period, livePrice }) => {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Animate open/close
  useEffect(() => {
    if (open) {
      setVisible(true)
      requestAnimationFrame(() => {
        if (panelRef.current) {
          panelRef.current.style.maxHeight = panelRef.current.scrollHeight + 'px'
          panelRef.current.style.opacity = '1'
        }
      })
    } else if (panelRef.current) {
      panelRef.current.style.maxHeight = '0px'
      panelRef.current.style.opacity = '0'
      const timer = setTimeout(() => setVisible(false), 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  if (!stats) return null

  const dp     = stats.last >= 100 ? 2 : stats.last >= 10 ? 3 : 4
  const last   = crosshair.close ?? livePrice?.price ?? stats.last
  const prev   = stats.prev
  const chg    = livePrice?.change ?? (last - prev)
  const pct    = livePrice?.change_pct ?? (chg / prev * 100)
  const isUp   = chg >= 0
  const chgCol = isUp ? TH.color.accentPositive : TH.color.accentNegative

  const ms = livePrice?.market_state
  const regularClose   = livePrice?.regular_close ?? null
  const prePrice       = livePrice?.pre_market_price ?? null
  const preChgPct      = livePrice?.pre_market_change_pct ?? null
  const postPrice      = livePrice?.post_market_price ?? null
  const postChgPct     = livePrice?.post_market_change_pct ?? null

  const fv = (n: number, decimals = dp): string => n.toFixed(decimals)
  const fvSigned = (n: number, decimals = dp): string => `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}`

  const Row = ({ label, value, color = TH.color.textPrimary }: { label: string; value: string; color?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ color: TH.color.textTertiary, fontSize: 9, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ color, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>{value}</span>
    </div>
  )

  const showRthRow = regularClose != null && (ms === 'PRE' || ms === 'POST' || ms === 'CLOSED')
  const showExtRow = (ms === 'PRE' && prePrice != null) || (ms === 'POST' && postPrice != null)

  return (
    <div style={{
      position:      'absolute',
      top:           36,
      right:         8,
      zIndex:        25,
      fontFamily:    "'JetBrains Mono','Courier New',monospace",
    }}>
      {/* Toggle button */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          background:    TH.color.bgSurface,
          border: `1px solid ${TH.color.borderMedium}`,
          borderRadius:  '4px',
          padding:       '5px 10px',
          cursor:        'pointer',
          display:       'inline-flex',
          alignItems:    'center',
          gap:           6,
          userSelect:    'none',
        }}
      >
        <span style={{ color: TH.color.textSecondary, fontSize: 10, letterSpacing: '0.1em' }}>
          PRICE SUMMARY
        </span>
        <span style={{
          color: TH.color.textTertiary,
          fontSize: 9,
          transition: 'transform 0.2s ease',
          display: 'inline-block',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          {'\u25BC'}
        </span>
      </div>

      {/* Dropdown panel */}
      {visible && (
        <div
          ref={panelRef}
          style={{
            marginTop:     2,
            width:         168,
            background:    TH.color.bgSurface,
            border: `1px solid ${TH.color.borderMedium}`,
            borderRadius:  '4px',
            padding:       '8px 10px',
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
            maxHeight:     0,
            opacity:       0,
            transition:    'max-height 0.2s ease, opacity 0.15s ease',
          }}
        >
          {/* Last */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: TH.color.textTertiary, fontSize: 9, letterSpacing: '0.08em', marginBottom: 3 }}>LAST</div>
            <div style={{ color: chgCol, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
              {crosshair.close != null ? fv(last) : <OdometerNumber value={last} decimals={dp} />}
            </div>
          </div>

          {/* Stats rows */}
          <div style={{ borderTop: `1px solid ${TH.color.borderSubtle}`, paddingTop: 8 }}>
            <Row label="Chg"  value={fvSigned(chg)}          color={chgCol} />
            <Row label="Chg%" value={fvSigned(pct, 2) + '%'} color={chgCol} />
            <Row label="High" value={fv(stats.high.value)}    color={TH.color.textPrimary} />
            <Row label="Low"  value={fv(stats.low.value)}     color={TH.color.textPrimary} />
            <Row label="Avg"  value={fv(stats.avg)}           color={TH.color.textSecondary} />
          </div>

          {/* RTH Close row */}
          {showRthRow && regularClose != null && (
            <div style={{ borderTop: `1px solid ${TH.color.borderSubtle}`, paddingTop: 6, marginTop: 4 }}>
              <Row label="RTH CLOSE" value={fv(regularClose)} color={TH.color.textSecondary} />
            </div>
          )}

          {/* Extended-hours price row */}
          {showExtRow && (
            <div>
              {ms === 'PRE' && prePrice != null && (
                <>
                  <Row label="PRE" value={fv(prePrice)} color={TH.color.accentWarning} />
                  {preChgPct != null && regularClose != null && (
                    <Row label="PRE \u0394%" value={fvSigned((prePrice - regularClose) / regularClose * 100, 2) + '%'} color={TH.color.accentWarning} />
                  )}
                </>
              )}
              {ms === 'POST' && postPrice != null && (
                <>
                  <Row label="POST" value={fv(postPrice)} color={TH.color.accentInfo} />
                  {postChgPct != null && regularClose != null && (
                    <Row label="POST \u0394%" value={fvSigned((postPrice - regularClose) / regularClose * 100, 2) + '%'} color={TH.color.accentInfo} />
                  )}
                </>
              )}
            </div>
          )}

          {/* Period label */}
          <div style={{ marginTop: 'auto', paddingTop: 8, color: TH.color.textTertiary, fontSize: 9 }}>
            {period.toUpperCase()} PERIOD
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Toolbar button styles ────────────────────────────────────────────────────

const TAB_ACTIVE: React.CSSProperties = {
  background: TH.color.bgSurface, color: TH.color.textPrimary, border: 'none',
  fontWeight: 600, padding: '3px 10px', fontSize: '11px',
  fontFamily: TH.font.sans, cursor: 'pointer',
  borderRadius: '4px',
}
const TAB_INACTIVE: React.CSSProperties = {
  background: 'transparent', color: TH.color.textTertiary, border: 'none',
  padding: '3px 10px', fontSize: '11px',
  fontFamily: TH.font.sans, cursor: 'pointer',
  borderRadius: '4px',
}
const IND_ACTIVE: React.CSSProperties = {
  background: TH.color.accentPositiveDim, color: TH.color.accentPositive, border: 'none',
  fontWeight: 600, padding: '2px 8px', fontSize: '10px',
  fontFamily: TH.font.sans, cursor: 'pointer', borderRadius: '3px',
}
const IND_INACTIVE: React.CSSProperties = {
  background: 'transparent', color: TH.color.textTertiary, border: 'none',
  padding: '2px 8px', fontSize: '10px',
  fontFamily: TH.font.sans, cursor: 'pointer', borderRadius: '3px',
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

const ChartScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('1Y')
  const [chartType, setChartType] = useState<ChartType>('AREA')
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
  const lastBarTimeRef = useRef<number>(0)
  const didFitRef     = useRef(false)
  const firstBarTimeRef = useRef<string | number | null>(null)
  const suppressRangeHandlerRef = useRef(false)
  const prevBarsLenRef = useRef(0)

  const { period, interval } = PERIOD_MAP[activePeriod]

  const { data: chartData, isLoading, error } = useQuery({
    queryKey: ['chart', ticker, period, interval],
    queryFn: () => fetchChart(ticker, period, interval),
    staleTime: 60_000,
  })

  const {
    ohlcv: accumulatedOhlcv,
    hasMore,
    isLoadingOlder,
    loadOlder,
  } = useChartHistory(ticker, period, interval, chartData ?? null)

  const loadOlderRef = useRef(loadOlder)
  useEffect(() => { loadOlderRef.current = loadOlder }, [loadOlder])

  useEffect(() => {
    didFitRef.current = false
    firstBarTimeRef.current = null
    prevBarsLenRef.current = 0
  }, [ticker, period, interval])

  const { data: livePriceData } = useLivePrice(ticker, 500, true)

  useLiveBarUpdater({
    series: mainSeriesRef.current,
    chartType,
    lastBarTimeRef,
    interval,
    livePrice: livePriceData,
    marketState: livePriceData?.market_state,
    allowPrePost: true,
  })

  // ── Period stats derived from chart data ──────────────────────────────────
  const chartStats = useMemo<ChartStats | null>(() => {
    const bars = accumulatedOhlcv.length > 0 ? accumulatedOhlcv : (chartData?.ohlcv ?? [])
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
  }, [chartData, accumulatedOhlcv])

  // ── Update live price line when live price changes ───────────────────────────
  useEffect(() => {
    if (!livePriceData) return
    const activePrice = getActivePrice(livePriceData).price
    if (!activePrice) return
    const series = mainSeriesRef.current
    if (!series) return
    if (priceLineRef.current) {
      try {
        priceLineRef.current.applyOptions({ price: activePrice })
      } catch (_) {}
      return
    }
    try {
      priceLineRef.current = series.createPriceLine({
        price: activePrice,
        color: TH.color.accentWarning,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '',
      })
    } catch (_) {}
  }, [livePriceData?.price, livePriceData?.pre_market_price, livePriceData?.post_market_price, livePriceData?.market_state])

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
        background: { color: TH.color.bgElevated },
        textColor: TH.color.textTertiary,
        fontFamily: TH.font.mono,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255, 255, 255, 0.20)', width: 1, style: 1, labelBackgroundColor: TH.color.bgSurface },
        horzLine: { color: 'rgba(255, 255, 255, 0.20)', width: 1, style: 1, labelBackgroundColor: TH.color.bgSurface },
      },
      rightPriceScale: {
        borderColor: TH.color.borderSubtle,
        textColor: TH.color.textTertiary,
      },
      timeScale: {
        borderColor: TH.color.borderSubtle,
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: false,
        rightOffset: 5,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })

    chartRef.current = chart

    let panDebounceTimer: ReturnType<typeof setTimeout> | null = null
    const ts = chart.timeScale()

    const rangeHandler = (range: LogicalRange | null) => {
      if (!range) return
      if (suppressRangeHandlerRef.current) return
      if (!didFitRef.current) return
      if (range.from < 10) {
        if (panDebounceTimer) clearTimeout(panDebounceTimer)
        panDebounceTimer = setTimeout(() => {
          loadOlderRef.current()
        }, 250)
      }
    }
    ts.subscribeVisibleLogicalRangeChange(rangeHandler)

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
      if (panDebounceTimer) clearTimeout(panDebounceTimer)
      try { ts.unsubscribeVisibleLogicalRangeChange(rangeHandler) } catch { /* chart already disposed */ }
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
  const displayBars = accumulatedOhlcv.length > 0 ? accumulatedOhlcv : (chartData?.ohlcv ?? [])
  const indicatorsKey = [...activeIndicators].sort().join(',')

  // ── Structure effect: create/remove series when chartType or indicator structure changes
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const removeSeries = <T extends ISeriesApi<any>>(ref: React.MutableRefObject<T | null>) => {
      if (ref.current) {
        try { chart.removeSeries(ref.current) } catch (_) {}
        ref.current = null
      }
    }
    removeSeries(mainSeriesRef as React.MutableRefObject<ISeriesApi<any> | null>)
    priceLineRef.current = null
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

    const showRSI  = activeIndicators.has('RSI')
    const showMACD = activeIndicators.has('MACD')
    const rsiPane  = 1
    const macdPane = showRSI ? 2 : 1

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addS = (type: any, opts: any, pane = 0) => chart.addSeries(type, opts, pane)

    if (chartType === 'CANDLE') {
      const series = addS(CandlestickSeries, {
        upColor: TH.color.accentPositive, downColor: TH.color.accentNegative,
        borderUpColor: TH.color.accentPositive, borderDownColor: TH.color.accentNegative,
        wickUpColor: TH.color.accentPositive, wickDownColor: TH.color.accentNegative,
        priceScaleId: 'right',
      }, 0)
      mainSeriesRef.current = series
    } else if (chartType === 'LINE') {
      const series = addS(LineSeries, {
        color: TH.color.textPrimary, lineWidth: 2, priceScaleId: 'right',
      }, 0)
      mainSeriesRef.current = series as unknown as ISeriesApi<'Line'>
    } else {
      const series = addS(AreaSeries, {
        topColor: 'rgba(0, 217, 100, 0.08)', bottomColor: 'rgba(0, 217, 100, 0.0)',
        lineColor: TH.color.accentPositive, lineWidth: 2, priceScaleId: 'right',
      }, 0)
      mainSeriesRef.current = series as unknown as ISeriesApi<'Area'>
    }

    if (activeIndicators.has('SMA20')) {
      sma20Ref.current = addS(LineSeries, {
        color: TH.color.accentInfo, lineWidth: 1, priceScaleId: 'right',
      }, 0)
    }
    if (activeIndicators.has('SMA50')) {
      sma50Ref.current = addS(LineSeries, {
        color: TH.color.accentWarning, lineWidth: 1, priceScaleId: 'right',
      }, 0)
    }
    if (activeIndicators.has('SMA200')) {
      sma200Ref.current = addS(LineSeries, {
        color: TH.color.textSecondary, lineWidth: 1, lineStyle: 2, priceScaleId: 'right',
      }, 0)
    }
    if (activeIndicators.has('BB')) {
      bbUpperRef.current = addS(LineSeries, {
        color: TH.color.accentWarning, lineWidth: 1, lineStyle: 2, priceScaleId: 'right',
      }, 0)
      bbMidRef.current = addS(LineSeries, {
        color: TH.color.textSecondary, lineWidth: 1, lineStyle: 1, priceScaleId: 'right',
      }, 0)
      bbLowerRef.current = addS(LineSeries, {
        color: TH.color.accentWarning, lineWidth: 1, lineStyle: 2, priceScaleId: 'right',
      }, 0)
    }
    if (showRSI) {
      const s = addS(LineSeries, {
        color: TH.color.accentInfo, lineWidth: 1, priceScaleId: 'rsi',
      }, rsiPane)
      s.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } })
      rsiSeriesRef.current = s
    }
    if (showMACD) {
      const s = addS(LineSeries, {
        color: TH.color.accentWarning, lineWidth: 1, priceScaleId: 'macd',
      }, macdPane)
      s.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } })
      macdLineRef.current = s

      macdSignalRef.current = addS(LineSeries, {
        color: TH.color.textSecondary, lineWidth: 1, priceScaleId: 'macd',
      }, macdPane)

      macdHistRef.current = addS(HistogramSeries, {
        priceScaleId: 'macd', color: TH.color.textTertiary,
      }, macdPane)
    }
  }, [chartType, indicatorsKey])

  // ── Data effect: push data into existing series, manage visible range
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartData) return
    const ohlcv = displayBars
    if (ohlcv.length === 0) return

    const origLen = chartData.ohlcv?.length ?? 0
    const offset = Math.max(0, ohlcv.length - origLen)

    const isFirstArrival = !didFitRef.current

    const prevRange = chart.timeScale().getVisibleLogicalRange()
    const prevLen = prevBarsLenRef.current
    const newFirstTime = ohlcv[0]?.time ?? null
    const oldFirstTime = firstBarTimeRef.current
    const delta = ohlcv.length - prevLen
    const wasPrepended =
      oldFirstTime !== null &&
      newFirstTime !== oldFirstTime &&
      delta > 0
    firstBarTimeRef.current = newFirstTime
    prevBarsLenRef.current = ohlcv.length

    const toTime = (t: string | number): Time => {
      if (typeof t === 'number') return t as UTCTimestamp
      const [year, month, day] = t.split('-').map(Number)
      return { year, month, day } as BusinessDay
    }

    const mainSeries = mainSeriesRef.current
    if (mainSeries) {
      if (chartType === 'CANDLE') {
        const data: CandlestickData[] = ohlcv.map(b => ({
          time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close,
        }))
        mainSeries.setData(data)
      } else {
        const data: LineData[] = ohlcv.map(b => ({ time: toTime(b.time), value: b.close }))
        mainSeries.setData(data as any)
      }
    }

    const lastBar = ohlcv[ohlcv.length - 1]
    if (lastBar) {
      const t = toTime(lastBar.time)
      lastBarTimeRef.current = typeof t === 'number' ? t : (Date.UTC((t as any).year, (t as any).month - 1, (t as any).day, 0, 0, 0) / 1000)
    }

    const updateLineSeries = (
      ref: React.MutableRefObject<AnySeries>,
      values: (number | null)[] | undefined,
    ) => {
      if (!ref.current || !values?.length) return
      const d: LineData[] = values
        .map((v, i) => v == null ? null : { time: toTime(ohlcv[offset + i].time), value: v })
        .filter((p): p is LineData => p !== null)
      ref.current.setData(d as any)
    }

    updateLineSeries(sma20Ref, chartData.sma20)
    updateLineSeries(sma50Ref, chartData.sma50)
    updateLineSeries(sma200Ref, chartData.sma200)
    updateLineSeries(bbUpperRef, chartData.bb_upper)
    updateLineSeries(bbMidRef, chartData.bb_mid)
    updateLineSeries(bbLowerRef, chartData.bb_lower)

    if (activeIndicators.has('RSI')) updateLineSeries(rsiSeriesRef, chartData.rsi)
    if (activeIndicators.has('MACD')) {
      updateLineSeries(macdLineRef, chartData.macd_line)
      updateLineSeries(macdSignalRef, chartData.macd_signal)
      if (macdHistRef.current && chartData.macd_hist?.length) {
        const d: HistogramData[] = (chartData.macd_hist ?? [])
          .map((v, i) => {
            if (v == null) return null
            return { time: toTime(ohlcv[offset + i].time), value: v, color: v >= 0 ? 'rgba(0,255,65,0.5)' : 'rgba(255,51,51,0.5)' } as HistogramData
          })
          .filter((p): p is HistogramData => p !== null)
        macdHistRef.current.setData(d as any)
      }
    }

    suppressRangeHandlerRef.current = true
    if (isFirstArrival) {
      didFitRef.current = true
      chart.timeScale().fitContent()
    } else if (prevRange && wasPrepended) {
      chart.timeScale().setVisibleLogicalRange({
        from: prevRange.from + delta,
        to: prevRange.to + delta,
      })
    } else if (prevRange) {
      chart.timeScale().setVisibleLogicalRange(prevRange)
    }
    // Clear the suppression after the event loop has dispatched the
    // resulting visibleLogicalRangeChange so we don't re-trigger loadOlder.
    requestAnimationFrame(() => {
      suppressRangeHandlerRef.current = false
    })
  }, [displayBars, chartData, chartType, activeIndicators])

  // ── Crosshair subscription (separate so it survives data updates) ───────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const handleCrosshair = (param: MouseEventParams) => {
      if (!param.time || !mainSeriesRef.current) {
        const bars = accumulatedOhlcv.length > 0 ? accumulatedOhlcv : (chartData?.ohlcv ?? [])
        const last = bars[bars.length - 1]
        if (last) {
          setCrosshairOhlcv({
            open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume,
          })
        } else {
          setCrosshairOhlcv({ open: null, high: null, low: null, close: null, volume: null })
        }
        return
      }

      const ohlcv = accumulatedOhlcv.length > 0 ? accumulatedOhlcv : (chartData?.ohlcv ?? [])
      const toTime = (t: string | number): Time => {
        if (typeof t === 'number') return t as UTCTimestamp
        const [year, month, day] = t.split('-').map(Number)
        return { year, month, day } as BusinessDay
      }

      const idx = ohlcv.findIndex(b => JSON.stringify(toTime(b.time)) === JSON.stringify(param.time))
      if (idx === -1) {
        setCrosshairOhlcv({ open: null, high: null, low: null, close: null, volume: null })
        return
      }
      const bar = ohlcv[idx]
      setCrosshairOhlcv({
        open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume,
      })
    }

    chart.subscribeCrosshairMove(handleCrosshair)
    return () => { chart.unsubscribeCrosshairMove(handleCrosshair) }
  }, [chartData, accumulatedOhlcv])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: TH.color.bgBase,
        overflow: 'hidden',
      }}
    >
      {/* Loading bar */}
      <LoadingBar loading={isLoading} />

      {/* Toolbar */}
      <div style={{ flexShrink: 0, background: TH.color.bgElevated, borderBottom: `1px solid ${TH.color.borderSubtle}` }}>
        {/* Row 1: ticker + period tabs + chart type */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 12px', height: 34 }}>
          <span style={{ color: TH.color.ticker, fontSize: 13, fontWeight: 600, marginRight: 10, fontFamily: TH.font.mono }}>
            {ticker}
          </span>
          <span style={{ color: TH.color.borderMedium, fontSize: 11, margin: '0 6px' }}>|</span>
          {PERIODS.map(p => (
            <button key={p} style={p === activePeriod ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setActivePeriod(p)}>
              {p}
            </button>
          ))}
          <span style={{ color: TH.color.borderMedium, fontSize: 11, margin: '0 6px' }}>|</span>
          {CHART_TYPES.map(t => (
            <button key={t} style={t === chartType ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setChartType(t)}>
              {t}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', color: TH.color.textTertiary, fontSize: 10, fontFamily: TH.font.mono }}>
            {period.toUpperCase()} · {interval}{chartData?.ohlcv?.length ? ` · ${chartData.ohlcv.length}` : ''}
          </span>
        </div>
        {/* Row 2: indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 12px 6px', height: 26 }}>
          <span style={{ color: TH.color.textTertiary, fontSize: 10, fontWeight: 500, marginRight: 6, fontFamily: TH.font.sans }}>Indicators</span>
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
          margin: '0',
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
              background: `${TH.color.bgBase}CC`,
              color: TH.color.accentNegative,
              fontSize: '13px',
              fontFamily: TH.font.sans,
            }}
          >
            {(error as Error).message ?? 'Failed to load chart data'}
          </div>
        )}

        {/* Loading skeleton overlay */}
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 15,
              background: TH.color.bgElevated,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span style={{ color: TH.color.textTertiary, fontSize: '12px', fontFamily: TH.font.sans }}>
              Loading {ticker} · {period.toUpperCase()} · {interval}
            </span>
            <div style={{ width: '200px' }}>
              <div className="bb-loading-bg"><div className="bb-loading-bar" /></div>
            </div>
          </div>
        )}

        {/* Crosshair OHLCV overlay */}
        <OhlcvOverlay {...crosshairOhlcv} />

        {/* Historical loading indicator */}
        {isLoadingOlder && (
          <div style={{
            position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            zIndex: 12, background: TH.color.bgSurface,
            border: `1px solid ${TH.color.borderMedium}`, borderRadius: '4px', padding: '4px 12px',
            fontSize: '10px', color: TH.color.accentWarning, letterSpacing: '0.05em', pointerEvents: 'none',
          }}>
            LOADING OLDER BARS...
          </div>
        )}

        {/* No more data indicator */}
        {!hasMore && !isLoadingOlder && (
          <div style={{
            position: 'absolute', bottom: 32, left: 8,
            zIndex: 12, fontSize: '9px', color: TH.color.textTertiary, letterSpacing: '0.05em',
          }}>
            EARLIEST DATA AVAILABLE
          </div>
        )}

        {/* Price stats overlay (top-right) */}
        <PriceSidebar stats={chartStats} crosshair={crosshairOhlcv} period={activePeriod} livePrice={livePriceData ?? undefined} />

        {/* Extended-hours badge */}
        <ExtendedHoursBadge marketState={livePriceData?.market_state} />

        {/* Session shading overlay for extended hours */}
        <SessionShading chart={chartRef.current} ohlcv={accumulatedOhlcv.length > 0 ? accumulatedOhlcv : (chartData?.ohlcv ?? [])} interval={interval} />

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
