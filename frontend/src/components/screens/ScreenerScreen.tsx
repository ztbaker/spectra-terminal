import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchScreener, fetchScreenerDSL } from '../../lib/api'
import C from '../../lib/colors'
import LoadingBar from '../shared/LoadingBar'
import DataGrid from '../shared/DataGrid'
import type { DataGridColumn } from '../shared/DataGrid'
import TabBar from '../shared/TabBar'
import type { ScreenerResult } from '../../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTORS = [
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Energy',
  'Industrials',
  'Materials',
  'Real Estate',
  'Utilities',
  'Communication Services',
]

const STORAGE_KEY = 'bb_saved_queries'

interface SavedQuery {
  name: string
  query: string
}

const QUICK_FILTERS: { label: string; query: string }[] = [
  { label: 'Value', query: 'pe<15 AND div>2' },
  { label: 'Growth', query: 'rev_growth>20 AND pe<50' },
  { label: 'Dividend', query: 'div>3 AND payout<60' },
  { label: 'Momentum', query: 'rsi14<30 AND mktcap>1b' },
]

// ─── Number parsing helper ────────────────────────────────────────────────────

function parseFilterNum(s: string): number | undefined {
  if (!s) return undefined
  const n = parseFloat(s)
  if (isNaN(n)) return undefined
  if (s.endsWith('T') || s.endsWith('t')) return n * 1e12
  if (s.endsWith('B') || s.endsWith('b')) return n * 1e9
  if (s.endsWith('M') || s.endsWith('m')) return n * 1e6
  if (s.endsWith('K') || s.endsWith('k')) return n * 1e3
  return n
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatMarketCap(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  return n.toFixed(0)
}

function formatVolume(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

// ─── LocalStorage helpers ────────────────────────────────────────────────────

function loadSavedQueries(): SavedQuery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SavedQuery[]
  } catch {
    return []
  }
}

function persistSavedQueries(queries: SavedQuery[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries))
  } catch {
    // silent fail
  }
}

// ─── Visual filter state ─────────────────────────────────────────────────────

interface FilterState {
  sector: string
  minMarketCap: string
  maxPe: string
  minVolume: string
}

const DEFAULT_FILTERS: FilterState = {
  sector: '',
  minMarketCap: '',
  maxPe: '',
  minVolume: '',
}

function buildParams(filters: FilterState): Record<string, string | number | undefined> {
  return {
    sector: filters.sector || undefined,
    min_market_cap: parseFilterNum(filters.minMarketCap),
    max_pe: filters.maxPe ? parseFloat(filters.maxPe) : undefined,
    min_volume: parseFilterNum(filters.minVolume),
    limit: 100,
    sort_by: 'market_cap',
    sort_dir: 'desc',
  }
}

// ─── DataGrid columns ────────────────────────────────────────────────────────

type ScreenerRow = ScreenerResult & Record<string, unknown>

function buildColumns(): DataGridColumn<ScreenerRow>[] {
  return [
    {
      key: 'ticker',
      header: 'TICKER',
      type: 'text',
      align: 'left',
      sortable: true,
      width: '80px',
      render: (row: ScreenerRow) => (
        <span style={{ color: C.amber, fontWeight: 700 }}>{String(row.ticker)}</span>
      ),
    },
    {
      key: 'company_name',
      header: 'NAME',
      type: 'text',
      align: 'left',
      sortable: true,
      width: '180px',
      render: (row: ScreenerRow) => (
        <span style={{ color: C.amberDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '180px' }}>
          {row.company_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'sector',
      header: 'SECTOR',
      type: 'text',
      align: 'left',
      sortable: true,
      width: '140px',
      render: (row: ScreenerRow) => (
        <span style={{ color: C.whiteDim }}>{row.sector ?? '—'}</span>
      ),
    },
    {
      key: 'market_cap',
      header: 'MKT CAP',
      type: 'text',
      align: 'right',
      sortable: true,
      width: '90px',
      render: (row: ScreenerRow) => (
        <span style={{ color: C.white }}>{formatMarketCap(row.market_cap as number | null | undefined)}</span>
      ),
    },
    {
      key: 'pe_ratio',
      header: 'P/E',
      type: 'number',
      align: 'right',
      sortable: true,
      width: '70px',
      render: (row: ScreenerRow) => {
        const v = row.pe_ratio as number | null | undefined
        return <span style={{ color: C.white }}>{v == null ? '—' : v.toFixed(1)}</span>
      },
    },
    {
      key: 'price',
      header: 'PRICE',
      type: 'number',
      align: 'right',
      sortable: true,
      width: '80px',
      render: (row: ScreenerRow) => {
        const v = row.price as number | null | undefined
        return <span style={{ color: C.white }}>{v == null ? '—' : v.toFixed(2)}</span>
      },
    },
    {
      key: 'change_pct',
      header: 'CHG%',
      type: 'change',
      align: 'right',
      sortable: true,
      width: '80px',
      render: (row: ScreenerRow) => {
        const v = row.change_pct as number | null | undefined
        if (v == null) return <span style={{ color: C.amber }}>—</span>
        const color = v > 0 ? C.green : v < 0 ? C.red : C.amber
        return <span style={{ color }}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</span>
      },
    },
    {
      key: 'volume',
      header: 'VOLUME',
      type: 'number',
      align: 'right',
      sortable: true,
      width: '80px',
      render: (row: ScreenerRow) => (
        <span style={{ color: C.whiteDim }}>{formatVolume(row.volume as number | null | undefined)}</span>
      ),
    },
    {
      key: 'beta',
      header: 'BETA',
      type: 'number',
      align: 'right',
      sortable: true,
      width: '70px',
      render: (row: ScreenerRow) => {
        const v = row.beta as number | null | undefined
        return <span style={{ color: C.whiteDim }}>{v == null ? '—' : v.toFixed(2)}</span>
      },
    },
  ]
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

const AmberSpinner: React.FC = () => (
  <div style={{
    width: '14px',
    height: '14px',
    border: `2px solid ${C.border1}`,
    borderTopColor: C.amber,
    borderRadius: '50%',
    animation: 'spin 600ms linear infinite',
    flexShrink: 0,
  }} />
)

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onNavigate: (cmd: string) => void
}

const ScreenerScreen: React.FC<Props> = ({ onNavigate }) => {
  // ── Mode ──
  const [mode, setMode] = useState<'dsl' | 'visual'>('dsl')

  // ── DSL state ──
  const [dslQuery, setDslQuery] = useState('')
  const [activeDslQuery, setActiveDslQuery] = useState('')
  const [dslHasRun, setDslHasRun] = useState(false)
  const dslInputRef = useRef<HTMLInputElement>(null)

  // ── Visual filter state ──
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [activeParams, setActiveParams] = useState<Record<string, string | number | undefined>>(
    buildParams(DEFAULT_FILTERS)
  )
  const [visualHasRun, setVisualHasRun] = useState(false)

  // ── Saved queries ──
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(loadSavedQueries)
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  // ── DSL query ──
  const dslQueryHook = useQuery({
    queryKey: ['screener-dsl', activeDslQuery],
    queryFn: () => fetchScreenerDSL(activeDslQuery),
    staleTime: 2 * 60_000,
    enabled: mode === 'dsl' && dslHasRun && activeDslQuery.length > 0,
  })

  // ── Visual query ──
  const visualQueryHook = useQuery({
    queryKey: ['screener', activeParams],
    queryFn: () => fetchScreener(activeParams),
    staleTime: 2 * 60_000,
    enabled: mode === 'visual' && visualHasRun,
  })

  // ── Active data ──
  const isLoading = mode === 'dsl' ? dslQueryHook.isLoading : visualQueryHook.isLoading
  const isFetching = mode === 'dsl' ? dslQueryHook.isFetching : visualQueryHook.isFetching
  const error = mode === 'dsl' ? dslQueryHook.error : visualQueryHook.error
  const data = mode === 'dsl' ? dslQueryHook.data : visualQueryHook.data
  const hasRun = mode === 'dsl' ? dslHasRun : visualHasRun

  const results = (data?.results ?? []) as ScreenerRow[]

  // ── DSL handlers ──

  const handleDslExecute = useCallback(() => {
    if (dslQuery.trim()) {
      setActiveDslQuery(dslQuery.trim())
      setDslHasRun(true)
    }
  }, [dslQuery])

  const handleDslKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleDslExecute()
  }, [handleDslExecute])

  const handleQuickFilter = useCallback((query: string) => {
    setDslQuery(query)
    setActiveDslQuery(query)
    setDslHasRun(true)
  }, [])

  // ── Visual handlers ──

  const handleVisualScreen = useCallback(() => {
    setActiveParams(buildParams(filters))
    setVisualHasRun(true)
  }, [filters])

  const handleVisualClear = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setActiveParams(buildParams(DEFAULT_FILTERS))
    setVisualHasRun(false)
  }, [])

  const handleVisualKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleVisualScreen()
  }, [handleVisualScreen])

  // ── Saved queries handlers ──

  const handleSaveQuery = useCallback(() => {
    if (!dslQuery.trim() || !saveName.trim()) return
    const updated = [...savedQueries, { name: saveName.trim(), query: dslQuery.trim() }]
    setSavedQueries(updated)
    persistSavedQueries(updated)
    setSaveName('')
    setShowSaveInput(false)
  }, [dslQuery, saveName, savedQueries])

  const handleDeleteQuery = useCallback((idx: number) => {
    const updated = savedQueries.filter((_, i) => i !== idx)
    setSavedQueries(updated)
    persistSavedQueries(updated)
  }, [savedQueries])

  const handleLoadSaved = useCallback((q: SavedQuery) => {
    setDslQuery(q.query)
    setActiveDslQuery(q.query)
    setDslHasRun(true)
  }, [])

  // ── Focus DSL input when switching to DSL mode ──
  useEffect(() => {
    if (mode === 'dsl' && dslInputRef.current) {
      dslInputRef.current.focus()
    }
  }, [mode])

  // ── Memoized columns ──
  const columnsMemo = buildColumns()

  // ── Shared styles ──

  const inputStyle: React.CSSProperties = {
    background: 'transparent',
    border: `1px solid ${C.border1}`,
    color: C.amber,
    fontFamily: C.fontMono,
    fontSize: '11px',
    padding: '3px 6px',
    outline: 'none',
    width: '100%',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg0 }}>
      <LoadingBar loading={isLoading || isFetching} />

      <Panel title="EQUITY SCREENER">
        {/* ── Mode toggle ── */}
        <div style={{ padding: '8px 10px 0', background: C.bg1 }}>
          <TabBar
            tabs={[
              { key: 'dsl', label: 'DSL' },
              { key: 'visual', label: 'VISUAL' },
            ]}
            activeKey={mode}
            onChange={(key) => setMode(key as 'dsl' | 'visual')}
            variant="pill"
          />
        </div>

        {/* ── DSL mode ── */}
        {mode === 'dsl' && (
          <div style={{ padding: '8px 10px', background: C.bg1, borderBottom: `1px solid ${C.border1}` }}>
            {/* Query bar row */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                ref={dslInputRef}
                type="text"
                value={dslQuery}
                onChange={e => setDslQuery(e.target.value)}
                onKeyDown={handleDslKeyDown}
                placeholder='pe<15 AND mktcap>1b AND sector="Technology"'
                style={{
                  flex: 1,
                  height: '40px',
                  background: C.bg1,
                  border: `1px solid ${C.border1}`,
                  color: C.amber,
                  fontFamily: C.fontMono,
                  fontSize: '13px',
                  padding: '0 12px',
                  outline: 'none',
                  borderRadius: '2px',
                  transition: 'border-color 150ms ease',
                  caretColor: C.amber,
                }}
                onFocus={e => { e.currentTarget.style.borderColor = C.amber }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border1 }}
              />
              <button
                onClick={handleDslExecute}
                style={{
                  height: '40px',
                  width: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: C.amber,
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  color: C.bg0,
                  fontWeight: 700,
                  fontSize: '16px',
                  fontFamily: C.fontMono,
                  flexShrink: 0,
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.amberHot }}
                onMouseLeave={e => { e.currentTarget.style.background = C.amber }}
              >
                {isFetching ? <AmberSpinner /> : '\u25B6'}
              </button>
              <button
                onClick={() => {
                  if (dslQuery.trim()) {
                    setShowSaveInput(!showSaveInput)
                    setSaveName('')
                  }
                }}
                title="Save query"
                style={{
                  height: '40px',
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: `1px solid ${C.border1}`,
                  borderRadius: '2px',
                  cursor: dslQuery.trim() ? 'pointer' : 'default',
                  color: dslQuery.trim() ? C.amberDim : C.whiteGhost,
                  fontSize: '11px',
                  fontFamily: C.fontSans,
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  flexShrink: 0,
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={e => {
                  if (dslQuery.trim()) {
                    e.currentTarget.style.borderColor = C.amberMute
                    e.currentTarget.style.color = C.amber
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.border1
                  e.currentTarget.style.color = dslQuery.trim() ? C.amberDim : C.whiteGhost
                }}
              >
                SAVE
              </button>
            </div>

            {/* Save input row */}
            {showSaveInput && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
                <input
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveQuery() }}
                  placeholder="Query name..."
                  style={{
                    flex: 1,
                    height: '28px',
                    background: C.bg0,
                    border: `1px solid ${C.border1}`,
                    color: C.white,
                    fontFamily: C.fontSans,
                    fontSize: '11px',
                    padding: '0 8px',
                    outline: 'none',
                    borderRadius: '2px',
                    caretColor: C.amber,
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = C.amber }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border1 }}
                  autoFocus
                />
                <button
                  onClick={handleSaveQuery}
                  disabled={!saveName.trim()}
                  style={{
                    height: '28px',
                    padding: '0 10px',
                    background: saveName.trim() ? C.amberMute : C.bg2,
                    border: `1px solid ${saveName.trim() ? C.amberMute : C.border1}`,
                    color: saveName.trim() ? C.amber : C.whiteGhost,
                    borderRadius: '2px',
                    cursor: saveName.trim() ? 'pointer' : 'default',
                    fontSize: '11px',
                    fontFamily: C.fontSans,
                    fontWeight: 600,
                    letterSpacing: '0.03em',
                  }}
                >
                  SAVE
                </button>
                <button
                  onClick={() => { setShowSaveInput(false); setSaveName('') }}
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    background: 'transparent',
                    border: `1px solid ${C.border1}`,
                    color: C.whiteDim,
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontFamily: C.fontSans,
                  }}
                >
                  CANCEL
                </button>
              </div>
            )}

            {/* Quick filter chips */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
              {QUICK_FILTERS.map(f => {
                const isActive = dslQuery === f.query
                return (
                  <button
                    key={f.label}
                    onClick={() => handleQuickFilter(f.query)}
                    style={{
                      padding: '4px 12px',
                      background: isActive ? C.amberGhost : 'transparent',
                      border: `1px solid ${isActive ? C.amberMute : C.border1}`,
                      color: isActive ? C.amber : C.whiteDim,
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontFamily: C.fontSans,
                      fontWeight: isActive ? 700 : 400,
                      letterSpacing: '0.03em',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = C.amberMute
                        e.currentTarget.style.color = C.amberDim
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = C.border1
                        e.currentTarget.style.color = C.whiteDim
                      }
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Visual mode ── */}
        {mode === 'visual' && (
          <div style={{
            padding: '8px 10px',
            background: C.bg1,
            borderBottom: `1px solid ${C.border1}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'flex-end',
          }}>
            {/* Sector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '180px' }}>
              <label style={{ color: C.amberDim, fontSize: '10px', letterSpacing: '0.05em' }}>SECTOR</label>
              <select
                style={selectStyle}
                value={filters.sector}
                onChange={e => setFilters(f => ({ ...f, sector: e.target.value }))}
                onKeyDown={handleVisualKeyDown}
              >
                <option value="">ALL SECTORS</option>
                {SECTORS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Min Market Cap */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '100px' }}>
              <label style={{ color: C.amberDim, fontSize: '10px', letterSpacing: '0.05em' }}>MIN MKT CAP</label>
              <input
                style={inputStyle}
                placeholder="e.g. 1B"
                value={filters.minMarketCap}
                onChange={e => setFilters(f => ({ ...f, minMarketCap: e.target.value }))}
                onKeyDown={handleVisualKeyDown}
              />
            </div>

            {/* Max P/E */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '80px' }}>
              <label style={{ color: C.amberDim, fontSize: '10px', letterSpacing: '0.05em' }}>MAX P/E</label>
              <input
                style={inputStyle}
                placeholder="e.g. 25"
                type="number"
                min="0"
                step="0.1"
                value={filters.maxPe}
                onChange={e => setFilters(f => ({ ...f, maxPe: e.target.value }))}
                onKeyDown={handleVisualKeyDown}
              />
            </div>

            {/* Min Volume */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '100px' }}>
              <label style={{ color: C.amberDim, fontSize: '10px', letterSpacing: '0.05em' }}>MIN VOLUME</label>
              <input
                style={inputStyle}
                placeholder="e.g. 500K"
                value={filters.minVolume}
                onChange={e => setFilters(f => ({ ...f, minVolume: e.target.value }))}
                onKeyDown={handleVisualKeyDown}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', paddingBottom: '1px' }}>
              <button
                onClick={handleVisualScreen}
                style={{
                  padding: '4px 14px',
                  fontSize: '11px',
                  color: C.bg0,
                  background: C.amber,
                  border: `1px solid ${C.amber}`,
                  fontWeight: 700,
                  fontFamily: C.fontSans,
                  cursor: 'pointer',
                  letterSpacing: '0.03em',
                  borderRadius: '2px',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.amberHot }}
                onMouseLeave={e => { e.currentTarget.style.background = C.amber }}
              >
                SCREEN
              </button>
              <button
                onClick={handleVisualClear}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  color: C.whiteDim,
                  background: 'transparent',
                  border: `1px solid ${C.border1}`,
                  fontFamily: C.fontSans,
                  cursor: 'pointer',
                  letterSpacing: '0.03em',
                  borderRadius: '2px',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.amberMute; e.currentTarget.style.color = C.amberDim }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border1; e.currentTarget.style.color = C.whiteDim }}
              >
                CLEAR
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && !isLoading && (
          <div style={{ padding: '10px 12px', color: C.red, fontSize: '12px', borderBottom: `1px solid ${C.border1}`, fontFamily: C.fontMono }}>
            ERR: {(error as Error).message ?? 'Screener request failed'}
          </div>
        )}

        {/* ── Body: sidebar + results ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* ── Saved queries sidebar ── */}
          {mode === 'dsl' && (
            <div style={{
              width: '200px',
              minWidth: '200px',
              borderRight: `1px solid ${C.border1}`,
              background: C.bg1,
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{
                padding: '8px 10px',
                borderBottom: `1px solid ${C.border1}`,
                color: C.amberDim,
                fontSize: '10px',
                letterSpacing: '0.08em',
                fontFamily: C.fontSans,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                SAVED QUERIES
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {savedQueries.length === 0 && (
                  <div style={{
                    padding: '16px 10px',
                    color: C.whiteGhost,
                    fontSize: '11px',
                    textAlign: 'center',
                    fontFamily: C.fontMono,
                  }}>
                    No saved queries
                  </div>
                )}
                {savedQueries.map((sq, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '6px 8px',
                      borderBottom: `1px solid ${C.border0}`,
                      cursor: 'pointer',
                      transition: 'background 150ms ease',
                    }}
                    onClick={() => handleLoadSaved(sq)}
                    onMouseEnter={e => { e.currentTarget.style.background = C.bg3 }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: C.white,
                        fontSize: '11px',
                        fontFamily: C.fontSans,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {sq.name}
                      </div>
                      <div style={{
                        color: C.whiteGhost,
                        fontSize: '10px',
                        fontFamily: C.fontMono,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: '2px',
                      }}>
                        {sq.query}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteQuery(idx) }}
                      title="Delete saved query"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: C.whiteGhost,
                        cursor: 'pointer',
                        fontSize: '14px',
                        lineHeight: '1',
                        padding: '2px 4px',
                        flexShrink: 0,
                        transition: 'color 150ms ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = C.red }}
                      onMouseLeave={e => { e.currentTarget.style.color = C.whiteGhost }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Results area ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Initial state */}
            {!hasRun && !isLoading && (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.whiteGhost,
                fontSize: '12px',
                padding: '48px',
                textAlign: 'center',
                letterSpacing: '0.05em',
                fontFamily: C.fontMono,
              }}>
                {mode === 'dsl'
                  ? 'ENTER A DSL QUERY AND PRESS [ \u25B6 ] TO SCAN'
                  : 'SET FILTERS AND PRESS [ SCREEN ] TO RUN'}
              </div>
            )}

            {/* Loading skeleton */}
            {isLoading && !data && (
              <div style={{
                padding: '16px',
                color: C.whiteGhost,
                fontSize: '12px',
                textAlign: 'center',
                fontFamily: C.fontMono,
                letterSpacing: '0.05em',
              }}>
                SCANNING EQUITIES...
              </div>
            )}

            {/* Results DataGrid */}
            {hasRun && !isLoading && results.length > 0 && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <DataGrid<ScreenerRow>
                  columns={columnsMemo}
                  data={results.slice(0, 100)}
                  keyField="ticker"
                  maxHeight="100%"
                  onRowClick={(row) => onNavigate(`${String(row.ticker)} EQUITY`)}
                  stickyHeader={true}
                  emptyMessage="No results"
                />
              </div>
            )}

            {/* Empty results */}
            {hasRun && !isLoading && !error && results.length === 0 && (
              <div style={{
                padding: '32px',
                color: C.whiteGhost,
                fontSize: '12px',
                textAlign: 'center',
                letterSpacing: '0.05em',
                fontFamily: C.fontMono,
              }}>
                NO RESULTS — TRY WIDENING YOUR FILTERS
              </div>
            )}

            {/* Footer */}
            {hasRun && results.length > 0 && (
              <div style={{
                borderTop: `1px solid ${C.border1}`,
                padding: '4px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                color: C.whiteGhost,
                fontSize: '10px',
                fontFamily: C.fontMono,
                letterSpacing: '0.03em',
                flexShrink: 0,
              }}>
                <span>
                  SHOWING {Math.min(results.length, 100)} RESULTS
                  {data?.total != null && data.total > results.length
                    ? ` OF ${data.total} TOTAL`
                    : ''}
                </span>
                {data?.cached && <span>CACHED</span>}
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* Spinner keyframe */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default ScreenerScreen