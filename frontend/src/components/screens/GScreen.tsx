/**
 * GScreen — Bloomberg-style Graph Creator
 *
 * G       → manager view: 3×3 grid of saved graph slots (G1–G9)
 * G1–G9   → individual graph slot: full chart with SAVE / BACK
 *
 * Each slot persists its config (name, ticker, period, chart type,
 * indicators) to localStorage under the key `bb_graph_{id}`.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
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
import LoadingBar from '../shared/LoadingBar'
import C from '../../lib/colors'

// ─── Config types ─────────────────────────────────────────────────────────────

type ChartType    = 'AREA' | 'CANDLE' | 'LINE'
type PeriodKey    = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'MAX'
type IndicatorKey = 'SMA20' | 'SMA50' | 'SMA200'

interface GraphConfig {
  name:       string
  ticker:     string
  period:     PeriodKey
  chartType:  ChartType
  indicators: IndicatorKey[]
}

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

const PERIODS:    PeriodKey[]    = ['1D', '5D', '1M', '3M', '6M', '1Y', '2Y', '5Y', 'MAX']
const CHART_TYPES: ChartType[]  = ['AREA', 'CANDLE', 'LINE']
const INDICATORS: IndicatorKey[] = ['SMA20', 'SMA50', 'SMA200']
const SLOT_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

const DEFAULT_CONFIG: GraphConfig = {
  name:       'NEW GRAPH',
  ticker:     '',
  period:     '1Y',
  chartType:  'AREA',
  indicators: [],
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadSlot(id: string): GraphConfig | null {
  try {
    const s = localStorage.getItem(`bb_graph_${id}`)
    return s ? (JSON.parse(s) as GraphConfig) : null
  } catch { return null }
}

function saveSlot(id: string, config: GraphConfig) {
  try { localStorage.setItem(`bb_graph_${id}`, JSON.stringify(config)) } catch { /* ignore */ }
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

// ─── Manager card ─────────────────────────────────────────────────────────────

interface SlotCardProps {
  id:     string
  config: GraphConfig | null
  onClick: () => void
}

const SlotCard: React.FC<SlotCardProps> = ({ id, config, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background:   config ? C.surfaceGlow : C.surface0,
      border:       `1px solid ${C.surfaceGlow}`,
      padding:      '12px 14px',
      textAlign:    'left',
      cursor:       'pointer',
      display:      'flex',
      flexDirection: 'column',
      gap:           4,
      height:        '100%',
      fontFamily:   'inherit',
      transition:   'border-color 0.1s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = C.amberMute)}
    onMouseLeave={e => (e.currentTarget.style.borderColor = C.surfaceGlow)}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: C.amber, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em' }}>
        G{id}
      </span>
      {config && (
        <span style={{ color: C.amberMute, fontSize: 9 }}>
          {config.chartType}
        </span>
      )}
    </div>

    {config ? (
      <>
        <div style={{ color: C.amberBright, fontSize: 12, fontWeight: 600 }}>
          {config.ticker}
        </div>
        <div style={{ color: C.amberMute, fontSize: 10 }}>{config.name}</div>
        <div style={{ color: C.border1, fontSize: 9, marginTop: 4 }}>
          {config.period}
          {config.indicators.length > 0 && ` · ${config.indicators.join(' ')}`}
        </div>
      </>
    ) : (
      <div style={{ color: C.border1, fontSize: 11, marginTop: 4 }}>
        (EMPTY)
      </div>
    )}
  </button>
)

// ─── Manager view ─────────────────────────────────────────────────────────────

const GraphManager: React.FC<{ onNavigate: (cmd: string) => void }> = ({ onNavigate }) => {
  // Re-render when localStorage changes (after a slot is saved in another tab, etc.)
  const [, tick] = useState(0)
  const slots = SLOT_IDS.map(id => ({ id, config: loadSlot(id) }))

  return (
    <div style={{ height: '100%', overflow: 'auto', background: C.surface0, padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: C.amber, fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
          GRAPH PAGES
        </div>
        <div style={{ color: C.amberMute, fontSize: 10 }}>
          TYPE G1–G9 TO OPEN A GRAPH · CONFIGURE TICKER, PERIOD, AND INDICATORS · SAVE TO PRESERVE
        </div>
      </div>

      {/* 3×3 grid */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap:                  8,
        maxWidth:            640,
      }}>
        {slots.map(({ id, config }) => (
          <div key={id} style={{ height: 100 }}>
            <SlotCard
              id={id}
              config={config}
              onClick={() => { tick(n => n + 1); onNavigate(`G${id}`) }}
            />
          </div>
        ))}
      </div>

      {/* Keyboard hints */}
      <div style={{ marginTop: 28, color: C.border1, fontSize: 10, lineHeight: 1.8 }}>
        <div style={{ color: C.amberMute, marginBottom: 6 }}>QUICK ACCESS</div>
        {SLOT_IDS.map(id => {
          const c = loadSlot(id)
          return (
            <div key={id}>
              <span style={{ color: C.amberDim }}>G{id}</span>
              {' → '}
              <span style={{ color: C.white }}>{c ? `${c.ticker}  ${c.name}` : '(empty)'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Graph slot chart view ────────────────────────────────────────────────────

interface GraphSlotViewProps {
  graphId:    string
  onNavigate: (cmd: string) => void
}

const GraphSlotView: React.FC<GraphSlotViewProps> = ({ graphId, onNavigate }) => {
  const saved = loadSlot(graphId)

  const [config, setConfig] = useState<GraphConfig>(saved ?? { ...DEFAULT_CONFIG })
  const [tickerInput, setTickerInput] = useState(saved?.ticker ?? '')
  const [nameInput,   setNameInput]   = useState(saved?.name   ?? `G${graphId}`)
  const [editingName, setEditingName] = useState(false)
  const [isDirty,     setIsDirty]     = useState(!saved)
  const [savedFlash,  setSavedFlash]  = useState(false)

  const [crosshair, setCrosshair] = useState<OhlcvState>({
    open: null, high: null, low: null, close: null, volume: null,
  })

  const containerRef   = useRef<HTMLDivElement>(null)
  const chartRef       = useRef<IChartApi | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySeries = ISeriesApi<any> | null
  const mainRef        = useRef<AnySeries>(null)
  const volRef         = useRef<AnySeries>(null)
  const sma20Ref       = useRef<AnySeries>(null)
  const sma50Ref       = useRef<AnySeries>(null)
  const sma200Ref      = useRef<AnySeries>(null)

  const { period, interval } = PERIOD_MAP[config.period]

  const { data: chartData, isLoading } = useQuery({
    queryKey:  ['chart', config.ticker, period, interval],
    queryFn:   () => fetchChart(config.ticker, period, interval),
    staleTime: 60_000,
    enabled:   config.ticker.length > 0,
  })

  // ── Helpers ────────────────────────────────────────────────────────────────
  const mark = useCallback(() => setIsDirty(true), [])

  const setPeriod = useCallback((p: PeriodKey) => {
    setConfig(c => ({ ...c, period: p })); mark()
  }, [mark])

  const setChartType = useCallback((t: ChartType) => {
    setConfig(c => ({ ...c, chartType: t })); mark()
  }, [mark])

  const toggleIndicator = useCallback((ind: IndicatorKey) => {
    setConfig(c => {
      const next = c.indicators.includes(ind)
        ? c.indicators.filter(x => x !== ind)
        : [...c.indicators, ind]
      return { ...c, indicators: next }
    })
    mark()
  }, [mark])

  const applyTicker = () => {
    const t = tickerInput.trim().toUpperCase()
    if (t) { setConfig(c => ({ ...c, ticker: t })); mark() }
  }

  const handleSave = () => {
    const cfg: GraphConfig = {
      ...config,
      ticker: tickerInput.trim().toUpperCase() || config.ticker,
      name:   nameInput.trim() || `G${graphId}`,
    }
    saveSlot(graphId, cfg)
    setConfig(cfg)
    setIsDirty(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

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
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height })
      }
    })
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect(); chart.remove(); chartRef.current = null
      mainRef.current = null; volRef.current = null
      sma20Ref.current = null; sma50Ref.current = null; sma200Ref.current = null
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
    ;[mainRef, volRef, sma20Ref, sma50Ref, sma200Ref].forEach(ref => {
      if (ref.current) {
        try { chart.removeSeries(ref.current) } catch { /* ignore */ }
        ref.current = null
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addS = (type: any, opts: any, pane = 0) => chart.addSeries(type, opts, pane)

    // Main series
    if (config.chartType === 'CANDLE') {
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
    } else if (config.chartType === 'LINE') {
      const s = addS(LineSeries, { color: C.amber, lineWidth: 2, priceScaleId: 'right' })
      const d: LineData[] = ohlcv.map(b => ({ time: toTime(b.time), value: b.close }))
      s.setData(d); mainRef.current = s
    } else {
      const s = addS(AreaSeries, {
        topColor: 'rgba(255,153,0,0.25)', bottomColor: 'rgba(255,153,0,0.0)',
        lineColor: C.amber, lineWidth: 2, priceScaleId: 'right',
      })
      const d: AreaData[] = ohlcv.map(b => ({ time: toTime(b.time), value: b.close }))
      s.setData(d); mainRef.current = s
    }

    // Volume
    const volS = addS(HistogramSeries, {
      priceScaleId: 'vol', color: C.border1, priceFormat: { type: 'volume' },
    })
    volS.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0 } })
    const volData: HistogramData[] = ohlcv.map(b => ({
      time:  toTime(b.time),
      value: b.volume,
      color: b.close >= b.open ? 'rgba(0,255,65,0.3)' : 'rgba(255,51,51,0.3)',
    }))
    volS.setData(volData); volRef.current = volS

    // SMAs
    const SMA_COLORS: Record<IndicatorKey, string> = {
      SMA20: C.cyanBright, SMA50: C.amberBright, SMA200: C.amberDim,
    }
    const SMA_DATA: Record<IndicatorKey, (number | null)[]> = {
      SMA20: chartData.sma20, SMA50: chartData.sma50, SMA200: chartData.sma200,
    }
    const SMA_REFS: Record<IndicatorKey, React.MutableRefObject<AnySeries>> = {
      SMA20: sma20Ref, SMA50: sma50Ref, SMA200: sma200Ref,
    }
    for (const ind of config.indicators) {
      const arr = SMA_DATA[ind]
      if (!arr?.length) continue
      const s = addS(LineSeries, {
        color: SMA_COLORS[ind], lineWidth: 1,
        ...(ind === 'SMA200' ? { lineStyle: 2 } : {}),
        priceScaleId: 'right',
      })
      const d: LineData[] = ohlcv
        .map((b, i) => ({ time: toTime(b.time), value: arr[i] }))
        .filter((p): p is LineData => p.value != null)
      s.setData(d); SMA_REFS[ind].current = s
    }

    chart.timeScale().fitContent()

    // Crosshair
    const handler = (param: MouseEventParams) => {
      if (!param.time || !mainRef.current) {
        setCrosshair({ open: null, high: null, low: null, close: null, volume: null })
        return
      }
      const idx = ohlcv.findIndex(b => JSON.stringify(toTime(b.time)) === JSON.stringify(param.time))
      if (idx === -1) return
      const b = ohlcv[idx]
      setCrosshair({ open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })
    }
    chart.subscribeCrosshairMove(handler)
    return () => { chart.unsubscribeCrosshairMove(handler) }
  }, [chartData, config.chartType, config.indicators])

  // ── Render ─────────────────────────────────────────────────────────────────
  const activeIndicators = new Set(config.indicators)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface0, overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, background: C.surface1, borderBottom: `1px solid ${C.border1}`,
        padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {/* Row 1: slot ID + name + ticker + chart type + period + SAVE + BACK */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>

          {/* Back button */}
          <button className="bb-btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => onNavigate('G')}>
            ← G
          </button>

          {/* Slot ID badge */}
          <span style={{ color: C.amber, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', marginLeft: 2 }}>
            G{graphId}
          </span>

          {/* Editable name */}
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value.toUpperCase())}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false) }}
              style={{
                background: C.surface1, border: `1px solid ${C.amber}`, color: C.amber,
                fontSize: 11, padding: '1px 6px', width: 140, fontFamily: 'inherit', outline: 'none',
              }}
            />
          ) : (
            <span
              style={{ color: C.amberMute, fontSize: 11, cursor: 'pointer' }}
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              {nameInput || `G${graphId}`}
            </span>
          )}

          <span style={{ color: C.border1 }}>─</span>

          {/* Ticker input */}
          <div style={{ display: 'flex', gap: 3 }}>
            <input
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') applyTicker() }}
              onBlur={applyTicker}
              placeholder="TICKER"
              maxLength={5}
              style={{
                background: C.surface1, border: `1px solid ${C.border1}`, color: C.amberBright,
                fontSize: 12, fontWeight: 700, padding: '1px 6px', width: 68,
                fontFamily: 'inherit', outline: 'none', letterSpacing: '0.05em',
              }}
            />
          </div>

          <span style={{ color: C.border1, margin: '0 2px' }}>|</span>

          {/* Chart type */}
          {CHART_TYPES.map(t => (
            <button
              key={t}
              className={t === config.chartType ? 'bb-btn bb-btn-active' : 'bb-btn'}
              style={{ padding: '2px 5px', fontSize: 10 }}
              onClick={() => setChartType(t)}
            >
              {t}
            </button>
          ))}

          <span style={{ color: C.border1, margin: '0 2px' }}>|</span>

          {/* Periods */}
          {PERIODS.map(p => (
            <button
              key={p}
              className={p === config.period ? 'bb-btn bb-btn-active' : 'bb-btn'}
              style={{ padding: '2px 5px', fontSize: 10 }}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}

          {/* SAVE button */}
          <button
            className="bb-btn"
            style={{
              marginLeft: 'auto',
              padding: '2px 12px',
              fontSize: 11,
              color:   savedFlash ? C.green : isDirty ? C.amber : C.amberMute,
              borderColor: savedFlash ? C.green : isDirty ? C.amber : C.border1,
            }}
            onClick={handleSave}
          >
            {savedFlash ? '✓ SAVED' : isDirty ? '● SAVE' : 'SAVED'}
          </button>
        </div>

        {/* Row 2: indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: C.amberMute, fontSize: 10, marginRight: 4 }}>INDICATORS:</span>
          {INDICATORS.map(ind => (
            <button
              key={ind}
              className={activeIndicators.has(ind) ? 'bb-btn bb-btn-active' : 'bb-btn'}
              style={{ padding: '1px 6px', fontSize: 10 }}
              onClick={() => toggleIndicator(ind)}
            >
              {ind}
            </button>
          ))}
          {activeIndicators.has('SMA20')  && <span style={{ color: C.cyanBright, fontSize: 10, marginLeft: 6 }}>━ SMA20</span>}
          {activeIndicators.has('SMA50')  && <span style={{ color: C.amberBright, fontSize: 10 }}>━ SMA50</span>}
          {activeIndicators.has('SMA200') && <span style={{ color: C.amberDim, fontSize: 10 }}>╌ SMA200</span>}
          <span style={{ marginLeft: 'auto', color: C.border1, fontSize: 10 }}>
            {period.toUpperCase()} · {interval}
            {chartData?.ohlcv?.length ? ` · ${chartData.ohlcv.length} bars` : ''}
          </span>
        </div>
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <OhlcvOverlay {...crosshair} />

        {/* Empty state — no ticker configured */}
        {!config.ticker && !isLoading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            color: C.amberMute, fontSize: 12, zIndex: 5,
          }}>
            <div>ENTER A TICKER ABOVE TO BEGIN</div>
            <div style={{ color: C.border1, fontSize: 10 }}>G{graphId} · {nameInput}</div>
          </div>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

// ─── Main GScreen ──────────────────────────────────────────────────────────────

interface Props {
  graphId?:   string      // '1'–'9' for slot view, undefined for manager
  onNavigate: (cmd: string) => void
}

const GScreen: React.FC<Props> = ({ graphId, onNavigate }) => {
  if (!graphId) return <GraphManager onNavigate={onNavigate} />
  return <GraphSlotView graphId={graphId} onNavigate={onNavigate} />
}

export default GScreen
