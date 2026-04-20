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
  type LogicalRange,
} from 'lightweight-charts'
import { fetchChart, fetchEquity } from '../../lib/api'
import { useChartHistory } from '../../hooks/useChartHistory'
import { useLivePrice } from '../../hooks/useLivePrice'
import { useLiveBarUpdater } from '../../hooks/useLiveBarUpdater'
import type { OhlcvBar } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import ExtendedHoursBadge from '../shared/ExtendedHoursBadge'
import theme from '../../lib/theme'

const { color } = theme

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
      background:    `${color.bgBase}CC`,
      border: `1px solid ${color.borderSubtle}`,
      padding:       '4px 10px',
      fontSize:      '11px',
      color:         color.textSecondary,
      pointerEvents: 'none',
      display:       'flex',
      gap:           '12px',
    }}>
      {time && <span style={{ color: color.textTertiary }}>{time}</span>}
      <span>O: <span style={{ color: color.textPrimary }}>{fmt(open)}</span></span>
      <span>H: <span style={{ color: color.textPrimary }}>{fmt(high)}</span></span>
      <span>L: <span style={{ color: color.textPrimary }}>{fmt(low)}</span></span>
      <span>C: <span style={{ color: color.textPrimary }}>{fmt(price)}</span></span>
      {vwap != null && <span>VWAP: <span style={{ color: color.accentInfo }}>{fmt(vwap)}</span></span>}
      {volume != null && <span>V: <span style={{ color: color.textTertiary }}>{fmtVol(volume)}</span></span>}
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevCloseLineRef = useRef<any>(null)
  const vwapSeriesRef   = useRef<AnySeries>(null)
  const volSeriesRef    = useRef<AnySeries>(null)
  const lastBarTimeRef = useRef<number>(0)

  const { period, interval } = PERIOD_MAP[activePeriod]

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey:  ['chart', ticker, period, interval],
    queryFn:   () => fetchChart(ticker, period, interval),
    staleTime: 30_000,
  })

  const {
    ohlcv: accumulatedOhlcv,
    hasMore,
    isLoadingOlder,
    loadOlder,
  } = useChartHistory(ticker, period, interval, chartData ?? null)

  const { data: equityData } = useQuery({
    queryKey:  ['equity', ticker],
    queryFn:   () => fetchEquity(ticker),
    staleTime: 60_000,
  })

  const { data: livePriceData } = useLivePrice(ticker, 1000, true)

  useLiveBarUpdater({
    series: priceSeriesRef.current,
    chartType: 'LINE',
    lastBarTimeRef,
    interval,
    livePrice: livePriceData,
    marketState: livePriceData?.market_state,
    allowPrePost: true,
  })

  const isLoading = chartLoading

  const displayBars = accumulatedOhlcv.length > 0 ? accumulatedOhlcv : (chartData?.ohlcv ?? [])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const ohlcv     = displayBars
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
        background:  { color: color.bgBase },
        textColor:   color.textSecondary,
        fontFamily:  "'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace",
        fontSize:    11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.20)', width: 1, style: 1, labelBackgroundColor: color.bgElevated },
        horzLine: { color: 'rgba(255,255,255,0.20)', width: 1, style: 1, labelBackgroundColor: color.bgElevated },
      },
      rightPriceScale: {
        borderColor: color.borderSubtle,
        textColor:   color.textSecondary,
      },
      timeScale: {
        borderColor:    color.borderSubtle,
        timeVisible:    true,
        secondsVisible: false,
      },
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
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      priceSeriesRef.current = null
      prevCloseLineRef.current = null
      vwapSeriesRef.current  = null
      volSeriesRef.current   = null
    }
  }, [])

  // ── Redraw on data change ──────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartData?.ohlcv?.length) return

    try {
    const bars = displayBars
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
      topColor:     'rgba(0,217,100,0.15)',
      bottomColor:  'rgba(0,217,100,0.0)',
      lineColor:    color.accentPositive,
      lineWidth:    2,
      priceScaleId: 'right',
    }, 0)
    const priceData: AreaData[] = bars.map(b => ({
      time:  toTime(b.time),
      value: b.close,
    }))
    priceSeries.setData(priceData)

    priceSeriesRef.current = priceSeries

    const lb = bars[bars.length - 1]
    if (lb) {
      const t = lb.time
      if (typeof t === 'number') {
        lastBarTimeRef.current = t
      } else {
        const [y, m, d] = t.split('-').map(Number)
        lastBarTimeRef.current = Date.UTC(y, m - 1, d, 0, 0, 0) / 1000
      }
    }

    // ── VWAP ──────────────────────────────────────────────────────────────
    const vwapSer = addS(LineSeries, {
      color:        color.accentInfo,
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
      color:        color.borderSubtle,
    }, 0)
    volSer.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    const volData: HistogramData[] = bars.map(b => ({
      time:  toTime(b.time),
      value: b.volume,
      color: b.close >= b.open ? 'rgba(0,217,100,0.25)' : 'rgba(255,82,82,0.25)',
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
  }, [chartData, displayBars])

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
      return (Date.UTC(year, month - 1, day, 0, 0, 0, 0) / 1000) as UTCTimestamp
    }

    const vwap = computeVwap(bars)

    if (priceSeriesRef.current) {
      const priceData: AreaData[] = bars.map(b => ({
        time: toTime(b.time), value: b.close,
      }))
      priceSeriesRef.current.setData(priceData as any)
    }

    if (vwapSeriesRef.current) {
      const vwapData: LineData[] = bars
        .map((b, i) => ({ time: toTime(b.time), value: vwap[i] }))
        .filter((p): p is LineData => p.value != null)
      vwapSeriesRef.current.setData(vwapData as any)
    }

    if (volSeriesRef.current) {
      const volData: HistogramData[] = bars.map(b => ({
        time: toTime(b.time), value: b.volume,
        color: b.close >= b.open ? 'rgba(0,217,100,0.25)' : 'rgba(255,82,82,0.25)',
      }))
      volSeriesRef.current.setData(volData as any)
    }

    if (prevRange) {
      chart.timeScale().setVisibleLogicalRange(prevRange)
    }
  }, [displayBars, chartData])

  useEffect(() => {
    const series = priceSeriesRef.current
    if (!series || prevClose == null) return
    if (prevCloseLineRef.current) {
      try { series.removePriceLine(prevCloseLineRef.current) } catch { /* ignore */ }
    }
    prevCloseLineRef.current = series.createPriceLine({
      price:               prevClose,
      color:               color.textTertiary,
      lineWidth:           1,
      lineStyle:           LineStyle.Dashed,
      axisLabelVisible:    true,
      title:               'PREV',
    })
  }, [prevClose])

  useEffect(() => {
    const series = priceSeriesRef.current
    if (!series || firstBar?.open == null) return
    series.createPriceLine({
      price:               firstBar.open,
      color:               color.textSecondary,
      lineWidth:           1,
      lineStyle:           LineStyle.Dashed,
      axisLabelVisible:    true,
      title:               'OPEN',
    })
  }, [firstBar?.open])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      background:    color.bgBase,
      overflow:      'hidden',
    }}>
      <LoadingBar loading={isLoading} />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink:   0,
        background:   color.bgElevated,
        borderBottom: `1px solid ${color.borderSubtle}`,
        padding:      '5px 10px',
        display:      'flex',
        flexDirection: 'column',
        gap:          '4px',
      }}>
        {/* Row 1: Ticker + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <span style={{
            color:         color.textPrimary,
            fontSize:      '14px',
            fontWeight:    700,
            letterSpacing: '0.05em',
          }}>
            {ticker}{' '}
            <span style={{ color: color.textTertiary, fontSize: '10px', fontWeight: 400 }}>INTRADAY</span>
          </span>

          {lastPrice != null && (
            <span style={{ color: color.textPrimary, fontSize: '14px', fontWeight: 700 }}>
              {lastPrice.toFixed(2)}
            </span>
          )}

          {changeAbs != null && changePct != null && (
            <span style={{
              color:    isUp ? color.accentPositive : color.accentNegative,
              fontSize: '12px',
              fontWeight: 600,
            }}>
              {fmtChange(changeAbs, changePct)}
            </span>
          )}

          <span style={{ color: color.textSecondary, fontSize: '11px' }}>
            OPEN <span style={{ color: color.textPrimary }}>{fmt(firstBar?.open)}</span>
          </span>

          {prevClose != null && (
            <span style={{ color: color.textSecondary, fontSize: '11px' }}>
              PREV <span style={{ color: color.textSecondary }}>{prevClose.toFixed(2)}</span>
            </span>
          )}

          {livePriceData?.market_state === 'PRE' && livePriceData.pre_market_price != null && (
            <span style={{ color: color.textPrimary, fontSize: '11px' }}>
              PRE <span style={{ fontWeight: 600 }}>{livePriceData.pre_market_price.toFixed(2)}</span>
              {livePriceData.pre_market_change_pct != null && (
                <span style={{ color: livePriceData.pre_market_change_pct >= 0 ? color.accentPositive : color.accentNegative, marginLeft: 4 }}>
                  ({livePriceData.pre_market_change_pct >= 0 ? '+' : ''}{livePriceData.pre_market_change_pct.toFixed(2)}%)
                </span>
              )}
            </span>
          )}

          {livePriceData?.market_state === 'POST' && livePriceData.post_market_price != null && (
            <span style={{ color: color.accentInfo, fontSize: '11px' }}>
              POST <span style={{ fontWeight: 600 }}>{livePriceData.post_market_price.toFixed(2)}</span>
              {livePriceData.post_market_change_pct != null && (
                <span style={{ color: livePriceData.post_market_change_pct >= 0 ? color.accentPositive : color.accentNegative, marginLeft: 4 }}>
                  ({livePriceData.post_market_change_pct >= 0 ? '+' : ''}{livePriceData.post_market_change_pct.toFixed(2)}%)
                </span>
              )}
            </span>
          )}

          {livePriceData?.regular_close != null && (livePriceData?.market_state === 'PRE' || livePriceData?.market_state === 'POST' || livePriceData?.market_state === 'CLOSED') && (
            <span style={{ color: color.textSecondary, fontSize: '11px' }}>
              RTH <span style={{ color: color.textSecondary }}>{livePriceData.regular_close.toFixed(2)}</span>
            </span>
          )}

          {lastVwap != null && (
            <span style={{ color: color.accentInfo, fontSize: '11px' }}>
              VWAP <span style={{ fontWeight: 600 }}>{fmt(lastVwap)}</span>
            </span>
          )}

          {totalVol > 0 && (
            <span style={{ color: color.textTertiary, fontSize: '11px' }}>
              VOL <span style={{ color: color.textSecondary }}>{fmtVol(totalVol)}</span>
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
        <div style={{ color: color.textTertiary, fontSize: '10px', display: 'flex', gap: '16px' }}>
          <span>{interval} BARS</span>
          {chartData?.ohlcv?.length && (
            <span>{chartData.ohlcv.length} BARS · {period.toUpperCase()}</span>
          )}
          <span style={{ color: color.accentInfo, opacity: 0.7 }}>━ VWAP (daily anchored)</span>
          <span style={{ color: color.textSecondary, opacity: 0.7 }}>╌ OPEN</span>
          <span style={{ color: color.textTertiary, opacity: 0.7 }}>╌ PREV CLOSE</span>
        </div>
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {chartError ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'transparent', color: color.accentNegative, fontSize: '12px', padding: '24px',
            fontFamily: 'monospace', textAlign: 'center', gap: '8px',
          }}>
            <div>CHART ERROR</div>
            <div style={{ color: color.accentNegative, fontSize: '11px', maxWidth: '600px', wordBreak: 'break-all' }}>{chartError}</div>
          </div>
        ) : (
          <>
            <BarOverlay {...barInfo} />
            <ExtendedHoursBadge marketState={livePriceData?.market_state} />
            {isLoadingOlder && (
              <div style={{
                position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
                zIndex: 12, background: `${color.bgBase}CC`, border: `1px solid ${color.borderSubtle}`,
                borderRadius: '4px', padding: '4px 12px',
                fontSize: '10px', color: color.textPrimary, letterSpacing: '0.05em', pointerEvents: 'none',
              }}>
                LOADING OLDER BARS...
              </div>
            )}
            {!hasMore && !isLoadingOlder && (
              <div style={{
                position: 'absolute', bottom: 32, left: 8,
                zIndex: 12, fontSize: '9px', color: color.textTertiary, letterSpacing: '0.05em',
              }}>
                EARLIEST INTRADAY DATA AVAILABLE (60-DAY LIMIT)
              </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          </>
        )}
      </div>
    </div>
  )
}

export default GIPScreen
