import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'
import LoadingBar from '../shared/LoadingBar'
import { fetchEcon, fetchEconSearch } from '../../lib/api'
import type { EconSeries } from '../../types'
import {
  createChart,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'

interface Props {
  onNavigate: (cmd: string) => void
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const FAVS_KEY = 'econ_favorites'

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY)
    return raw ? JSON.parse(raw) : ['DGS10', 'UNRATE', 'CPIAUCSL', 'GDP']
  } catch {
    return ['DGS10', 'UNRATE', 'CPIAUCSL', 'GDP']
  }
}

function saveFavorites(favs: string[]) {
  localStorage.setItem(FAVS_KEY, JSON.stringify(favs))
}

// ─── Lightweight Charts inline series ────────────────────────────────────────

interface EconChartProps {
  series: EconSeries
  height?: number
}

const EconChart: React.FC<EconChartProps> = ({ series, height = 180 }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const validObs = useMemo(
    () => series.observations.filter((o): o is typeof o & { value: number } => o.value != null && isFinite(o.value)),
    [series.observations]
  )

  useEffect(() => {
    if (!containerRef.current || validObs.length < 2) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: C.surface1 },
        textColor: C.whiteGhost,
        fontFamily: C.fontMono,
        fontSize: 10,
      },
      grid: {
        vertLines: { color: C.border0 },
        horzLines: { color: C.border0 },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border1 },
      timeScale: { borderColor: C.border1, timeVisible: false },
    })

    const lineSeries = chart.addSeries(LineSeries, {
      color: C.amber,
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })

    lineSeries.setData(validObs.map(o => ({
      time: o.date as unknown as UTCTimestamp,
      value: o.value,
    })))

    chart.timeScale().fitContent()
    chartRef.current = chart

    const onResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
    }
  }, [validObs, height])

  if (validObs.length < 2) {
    return (
      <div style={{ color: C.whiteGhost, padding: 16, textAlign: 'center', fontSize: 11 }}>
        Insufficient data for chart
      </div>
    )
  }

  return <div ref={containerRef} style={{ width: '100%' }} />
}

// ─── Mini chart for dashboard mode ────────────────────────────────────────────

interface MiniChartProps {
  series: EconSeries
}

const MiniChart: React.FC<MiniChartProps> = ({ series }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const validObs = useMemo(
    () => series.observations.filter((o): o is typeof o & { value: number } => o.value != null && isFinite(o.value)),
    [series.observations]
  )

  useEffect(() => {
    if (!containerRef.current || validObs.length < 2) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 140,
      layout: {
        background: { color: C.surface2 },
        textColor: C.whiteGhost,
        fontFamily: C.fontMono,
        fontSize: 9,
      },
      grid: {
        vertLines: { color: C.border0 },
        horzLines: { color: C.border0 },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border0 },
      timeScale: { borderColor: C.border0, timeVisible: false },
    })

    const lineSeries = chart.addSeries(LineSeries, {
      color: C.amber,
      lineWidth: 1,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })

    lineSeries.setData(validObs.map(o => ({
      time: o.date as unknown as UTCTimestamp,
      value: o.value,
    })))

    chart.timeScale().fitContent()
    chartRef.current = chart

    return () => { chart.remove() }
  }, [validObs])

  if (validObs.length < 2) return null

  return <div ref={containerRef} style={{ width: '100%' }} />
}

// ─── Series metadata panel ────────────────────────────────────────────────────

const SeriesMeta: React.FC<{ series: EconSeries }> = ({ series }) => {
  const latest = series.observations.filter(o => o.value != null).slice(-1)[0]
  const prev = series.observations.filter(o => o.value != null).slice(-2)[0]
  const change = latest && prev ? latest.value! - prev.value! : null
  const changePct = latest && prev && prev.value !== 0 ? ((latest.value! - prev.value!) / Math.abs(prev.value!)) * 100 : null

  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border1}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <span style={{ color: C.white, fontSize: 22, fontFamily: C.fontMono, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
          {latest?.value?.toFixed(2) ?? '—'}
        </span>
        {change != null && (
          <span style={{
            color: change >= 0 ? C.green : C.red,
            fontSize: 13,
            fontFamily: C.fontMono,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}
            {changePct != null && ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <span style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.06em' }}>SERIES</span>
          <div style={{ color: C.amberBright, fontSize: 12, fontFamily: C.fontMono }}>{series.series_id}</div>
        </div>
        <div>
          <span style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.06em' }}>TITLE</span>
          <div style={{ color: C.whiteDim, fontSize: 11, fontFamily: C.fontMono, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{series.title}</div>
        </div>
        <div>
          <span style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.06em' }}>FREQ</span>
          <div style={{ color: C.whiteDim, fontSize: 11, fontFamily: C.fontMono }}>{series.frequency}</div>
        </div>
        <div>
          <span style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.06em' }}>UNITS</span>
          <div style={{ color: C.whiteDim, fontSize: 11, fontFamily: C.fontMono }}>{series.units}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function EconScreen({ onNavigate: _onNavigate }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null)
  const [dashboardMode, setDashboardMode] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(loadFavorites)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Selected series data
  const { data: seriesData, isLoading: seriesLoading } = useQuery({
    queryKey: ['econ', selectedSeries],
    queryFn: () => fetchEcon(selectedSeries!),
    enabled: !!selectedSeries,
    staleTime: 300_000,
  })

  // Favorites data (parallel queries)
  const favQueries = useQuery({
    queryKey: ['econ-favorites', favorites],
    queryFn: async () => {
      const results = await Promise.all(
        favorites.map(id => fetchEcon(id).catch(() => null))
      )
      return results.filter(Boolean) as EconSeries[]
    },
    enabled: dashboardMode,
    staleTime: 300_000,
  })

  // Search handler with debounce
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await fetchEconSearch(query.trim())
        setSearchResults(result.results ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 400)
  }, [])

  const addFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev : [...prev, id]
      saveFavorites(next)
      return next
    })
  }, [])

  const removeFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = prev.filter(f => f !== id)
      saveFavorites(next)
      return next
    })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <LoadingBar loading={seriesLoading} />

      {/* Search bar */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border1}`, background: C.surface1 }}>
        <div style={{ position: 'relative' }}>
          <input
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search FRED series (e.g. DGS10, UNRATE, GDP)..."
            style={{
              width: '100%',
              background: C.surface2,
              border: `1px solid ${C.amberMute}`,
              color: C.white,
              fontFamily: C.fontMono,
              fontSize: 12,
              padding: '6px 10px 6px 28px',
              borderRadius: 2,
              outline: 'none',
              transition: 'border-color 150ms ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = C.amber }}
            onBlur={e => { e.currentTarget.style.borderColor = C.amberMute }}
          />
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: C.amberMute, fontSize: 12,
          }}>
            ⌕
          </span>
        </div>

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div style={{
            marginTop: 4,
            maxHeight: 200,
            overflowY: 'auto',
            background: C.surface2,
            border: `1px solid ${C.border1}`,
            borderRadius: 2,
          }}>
            {searchResults.map((r: any) => (
              <div
                key={r.series_id}
                onClick={() => {
                  setSelectedSeries(r.series_id)
                  setSearchResults([])
                  setSearchQuery('')
                }}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${C.border0}`,
                  transition: 'background 100ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.surfaceGlow }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: C.amberBright, fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>{r.series_id}</span>
                  <span style={{ color: C.whiteGhost, fontSize: 9, fontFamily: C.fontMono }}>{r.frequency}</span>
                </div>
                <div style={{ color: C.whiteDim, fontSize: 11, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title}
                </div>
              </div>
            ))}
          </div>
        )}

        {searchLoading && (
          <div style={{ color: C.amberMute, fontSize: 10, padding: '4px 0', fontFamily: C.fontMono }}>
            Searching...
          </div>
        )}
      </div>

      {/* Favorites row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${C.border0}`, background: C.surface1 }}>
        <span style={{ color: C.amberMute, fontSize: 9, fontFamily: C.fontDisplay, fontWeight: 700, letterSpacing: '0.08em', marginRight: 4 }}>
          FAVS
        </span>
        {favorites.map(id => (
          <button
            key={id}
            onClick={() => setSelectedSeries(id)}
            onContextMenu={e => { e.preventDefault(); removeFavorite(id) }}
            style={{
              background: selectedSeries === id ? C.amberMute : 'transparent',
              color: selectedSeries === id ? C.amber : C.whiteDim,
              border: `1px solid ${selectedSeries === id ? C.amberMute : C.border1}`,
              padding: '2px 8px',
              fontSize: 10,
              fontFamily: C.fontMono,
              fontWeight: 700,
              cursor: 'pointer',
              borderRadius: 2,
              transition: 'all 150ms ease',
              letterSpacing: '0.03em',
            }}
            title={`Click to view. Right-click to remove.`}
          >
            {id}
          </button>
        ))}
        {/* Add current to favorites */}
        {selectedSeries && !favorites.includes(selectedSeries) && (
          <button
            onClick={() => addFavorite(selectedSeries)}
            style={{
              background: 'transparent',
              color: C.green,
              border: `1px solid ${C.greenDim}`,
              padding: '2px 8px',
              fontSize: 10,
              fontFamily: C.fontMono,
              cursor: 'pointer',
              borderRadius: 2,
            }}
          >
            + PIN
          </button>
        )}
        {/* Dashboard toggle */}
        <button
          onClick={() => setDashboardMode(!dashboardMode)}
          style={{
            marginLeft: 'auto',
            background: dashboardMode ? C.amberMute : 'transparent',
            color: dashboardMode ? C.amber : C.whiteDim,
            border: `1px solid ${dashboardMode ? C.amberMute : C.border1}`,
            padding: '2px 8px',
            fontSize: 10,
            fontFamily: C.fontMono,
            cursor: 'pointer',
            borderRadius: 2,
            letterSpacing: '0.03em',
          }}
        >
          {dashboardMode ? 'SINGLE' : 'GRID'}
        </button>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Dashboard mode: 2x2 grid of favorites */}
        {dashboardMode && (
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {favQueries.data?.map(series => (
              <div
                key={series.series_id}
                style={{
                  background: C.surface2,
                  border: `1px solid ${C.border0}`,
                  cursor: 'pointer',
                  transition: 'border-color 150ms',
                }}
                onClick={() => { setSelectedSeries(series.series_id); setDashboardMode(false) }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.amberMute }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border0 }}
              >
                <div style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border0}` }}>
                  <span style={{ color: C.amberBright, fontSize: 10, fontFamily: C.fontMono, fontWeight: 700 }}>{series.series_id}</span>
                  <span style={{ color: C.whiteDim, fontSize: 9, marginLeft: 8 }}>{series.title}</span>
                </div>
                <MiniChart series={series} />
              </div>
            ))}
            {favQueries.isLoading && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 24, color: C.amberMute }}>
                Loading favorites data...
              </div>
            )}
          </div>
        )}

        {/* Single series view */}
        {!dashboardMode && selectedSeries && seriesData && (
          <div>
            <SeriesMeta series={seriesData} />
            <EconChart series={seriesData} height={280} />
            {seriesData.cached && (
              <div style={{ padding: '4px 16px', color: C.amberMute, fontSize: 9, fontFamily: C.fontMono, letterSpacing: '0.05em', textAlign: 'right' }}>
                CACHED
              </div>
            )}
          </div>
        )}

        {!dashboardMode && !selectedSeries && (
          <div style={{ padding: 32, color: C.whiteGhost, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontFamily: C.fontMono, marginBottom: 8 }}>
              Search or select a series to view
            </div>
            <div style={{ fontSize: 11, fontFamily: C.fontMono, color: C.amberMute }}>
              Popular: DGS10 (10Y Treasury), UNRATE (Unemployment), CPIAUCSL (CPI), GDP, FEDFUNDS
            </div>
          </div>
        )}
      </div>
    </div>
  )
}