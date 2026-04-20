import Panel from '../Terminal/Panel'
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchScreener, fetchScreenerDSL } from '../../lib/api'
import theme from '../../lib/theme'
import LoadingBar from '../shared/LoadingBar'
import DataGrid from '../shared/DataGrid'
import type { DataGridColumn } from '../shared/DataGrid'
import TabBar from '../shared/TabBar'
import type { ScreenerResult } from '../../types'

const { color, font } = theme

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

function formatMarketCap(n: number | null | undefined): string {
  if (n == null) return '\u2014'
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  return n.toFixed(0)
}

function formatVolume(n: number | null | undefined): string {
  if (n == null) return '\u2014'
  const abs = Math.abs(n)
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

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
  }
}

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
        <span style={{ color: color.ticker, fontWeight: 600, fontFamily: font.mono }}>{String(row.ticker)}</span>
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
        <span style={{ color: color.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '180px' }}>
          {row.company_name ?? '\u2014'}
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
        <span style={{ color: color.textSecondary }}>{row.sector ?? '\u2014'}</span>
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
        <span style={{ color: color.textPrimary }}>{formatMarketCap(row.market_cap as number | null | undefined)}</span>
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
        return <span style={{ color: color.textPrimary }}>{v == null ? '\u2014' : v.toFixed(1)}</span>
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
        return <span style={{ color: color.textPrimary }}>{v == null ? '\u2014' : v.toFixed(2)}</span>
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
        if (v == null) return <span style={{ color: color.textPrimary }}>{'\u2014'}</span>
        const clr = v > 0 ? color.accentPositive : v < 0 ? color.accentNegative : color.textSecondary
        return <span style={{ color: clr, fontVariantNumeric: 'tabular-nums' }}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</span>
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
        <span style={{ color: color.textSecondary }}>{formatVolume(row.volume as number | null | undefined)}</span>
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
        return <span style={{ color: color.textSecondary }}>{v == null ? '\u2014' : v.toFixed(2)}</span>
      },
    },
  ]
}

const Spinner: React.FC = () => (
  <div style={{
    width: '14px',
    height: '14px',
    border: `2px solid ${color.borderSubtle}`,
    borderTopColor: color.accentPositive,
    borderRadius: '50%',
    animation: 'spin 600ms linear infinite',
    flexShrink: 0,
  }} />
)

interface Props {
  onNavigate: (cmd: string) => void
}

const ScreenerScreen: React.FC<Props> = ({ onNavigate }) => {
  const [mode, setMode] = useState<'dsl' | 'visual'>('dsl')

  const [dslQuery, setDslQuery] = useState('')
  const [activeDslQuery, setActiveDslQuery] = useState('')
  const [dslHasRun, setDslHasRun] = useState(false)
  const dslInputRef = useRef<HTMLInputElement>(null)

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [activeParams, setActiveParams] = useState<Record<string, string | number | undefined>>(
    buildParams(DEFAULT_FILTERS)
  )
  const [visualHasRun, setVisualHasRun] = useState(false)

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(loadSavedQueries)
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const dslQueryHook = useQuery({
    queryKey: ['screener-dsl', activeDslQuery],
    queryFn: () => fetchScreenerDSL(activeDslQuery),
    staleTime: 2 * 60_000,
    enabled: mode === 'dsl' && dslHasRun && activeDslQuery.length > 0,
  })

  const visualQueryHook = useQuery({
    queryKey: ['screener', activeParams],
    queryFn: () => fetchScreener(activeParams),
    staleTime: 2 * 60_000,
    enabled: mode === 'visual' && visualHasRun,
  })

  const isLoading = mode === 'dsl' ? dslQueryHook.isLoading : visualQueryHook.isLoading
  const isFetching = mode === 'dsl' ? dslQueryHook.isFetching : visualQueryHook.isFetching
  const error = mode === 'dsl' ? dslQueryHook.error : visualQueryHook.error
  const data = mode === 'dsl' ? dslQueryHook.data : visualQueryHook.data
  const hasRun = mode === 'dsl' ? dslHasRun : visualHasRun

  const results = (data?.results ?? []) as ScreenerRow[]

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

  useEffect(() => {
    if (mode === 'dsl' && dslInputRef.current) {
      dslInputRef.current.focus()
    }
  }, [mode])

  const columnsMemo = useMemo(() => buildColumns(), [])

  const inputStyle: React.CSSProperties = {
    background: 'transparent',
    border: `1px solid ${color.borderSubtle}`,
    color: color.textPrimary,
    fontFamily: font.mono,
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent' }}>
      <LoadingBar loading={isLoading || isFetching} />

      <Panel title="EQUITY SCREENER">
        <div style={{ padding: '8px 10px 0', background: 'rgba(19, 22, 25, 0.6)' }}>
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

        {mode === 'dsl' && (
          <div style={{ padding: '8px 10px', background: 'rgba(19, 22, 25, 0.6)', borderBottom: `1px solid ${color.borderSubtle}` }}>
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
                  background: 'rgba(19, 22, 25, 0.6)',
                  border: `1px solid ${color.borderSubtle}`,
                  color: color.textPrimary,
                  fontFamily: font.mono,
                  fontSize: '13px',
                  padding: '0 12px',
                  outline: 'none',
                  borderRadius: '2px',
                  transition: 'border-color 150ms ease',
                  caretColor: color.accentPositive,
                }}
                onFocus={e => { e.currentTarget.style.borderColor = color.borderStrong }}
                onBlur={e => { e.currentTarget.style.borderColor = color.borderSubtle }}
              />
              <button
                onClick={handleDslExecute}
                style={{
                  height: '40px',
                  width: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: color.accentPositive,
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  color: color.textInverse,
                  fontWeight: 700,
                  fontSize: '16px',
                  fontFamily: font.mono,
                  flexShrink: 0,
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = color.accentPositiveHover }}
                onMouseLeave={e => { e.currentTarget.style.background = color.accentPositive }}
              >
                {isFetching ? <Spinner /> : '\u25B6'}
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
                  border: `1px solid ${color.borderSubtle}`,
                  borderRadius: '2px',
                  cursor: dslQuery.trim() ? 'pointer' : 'default',
                  color: dslQuery.trim() ? color.textSecondary : color.textTertiary,
                  fontSize: '11px',
                  fontFamily: font.sans,
                  fontWeight: 600,
                  flexShrink: 0,
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={e => {
                  if (dslQuery.trim()) {
                    e.currentTarget.style.borderColor = color.borderMedium
                    e.currentTarget.style.color = color.textPrimary
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = color.borderSubtle
                  e.currentTarget.style.color = dslQuery.trim() ? color.textSecondary : color.textTertiary
                }}
              >
                SAVE
              </button>
            </div>

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
                    background: 'transparent',
                    border: `1px solid ${color.borderSubtle}`,
                    color: color.textPrimary,
                    fontFamily: font.sans,
                    fontSize: '11px',
                    padding: '0 8px',
                    outline: 'none',
                    borderRadius: '2px',
                    caretColor: color.accentPositive,
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = color.borderStrong }}
                  onBlur={e => { e.currentTarget.style.borderColor = color.borderSubtle }}
                  autoFocus
                />
                <button
                  onClick={handleSaveQuery}
                  disabled={!saveName.trim()}
                  style={{
                    height: '28px',
                    padding: '0 10px',
                    background: saveName.trim() ? color.bgSurface : color.bgSurface,
                    border: `1px solid ${saveName.trim() ? color.borderMedium : color.borderSubtle}`,
                    color: saveName.trim() ? color.textPrimary : color.textTertiary,
                    borderRadius: '2px',
                    cursor: saveName.trim() ? 'pointer' : 'default',
                    fontSize: '11px',
                    fontFamily: font.sans,
                    fontWeight: 600,
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
                    border: `1px solid ${color.borderSubtle}`,
                    color: color.textSecondary,
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontFamily: font.sans,
                  }}
                >
                  CANCEL
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
              {QUICK_FILTERS.map(f => {
                const isActive = dslQuery === f.query
                return (
                  <button
                    key={f.label}
                    onClick={() => handleQuickFilter(f.query)}
                    style={{
                      padding: '4px 12px',
                      background: isActive ? color.accentPositiveDim : 'transparent',
                      border: `1px solid ${isActive ? color.accentPositive : color.borderSubtle}`,
                      color: isActive ? color.accentPositive : color.textSecondary,
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontFamily: font.sans,
                      fontWeight: isActive ? 600 : 400,
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = color.borderMedium
                        e.currentTarget.style.color = color.textSecondary
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = color.borderSubtle
                        e.currentTarget.style.color = color.textSecondary
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

        {mode === 'visual' && (
          <div style={{
            padding: '8px 10px',
            background: 'rgba(19, 22, 25, 0.6)',
            borderBottom: `1px solid ${color.borderSubtle}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'flex-end',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '180px' }}>
              <label style={{ color: color.textSecondary, fontSize: '11px', fontWeight: 600, fontFamily: font.sans }}>SECTOR</label>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '100px' }}>
              <label style={{ color: color.textSecondary, fontSize: '11px', fontWeight: 600, fontFamily: font.sans }}>MIN MKT CAP</label>
              <input
                style={inputStyle}
                placeholder="e.g. 1B"
                value={filters.minMarketCap}
                onChange={e => setFilters(f => ({ ...f, minMarketCap: e.target.value }))}
                onKeyDown={handleVisualKeyDown}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '80px' }}>
              <label style={{ color: color.textSecondary, fontSize: '11px', fontWeight: 600, fontFamily: font.sans }}>MAX P/E</label>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '100px' }}>
              <label style={{ color: color.textSecondary, fontSize: '11px', fontWeight: 600, fontFamily: font.sans }}>MIN VOLUME</label>
              <input
                style={inputStyle}
                placeholder="e.g. 500K"
                value={filters.minVolume}
                onChange={e => setFilters(f => ({ ...f, minVolume: e.target.value }))}
                onKeyDown={handleVisualKeyDown}
              />
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', paddingBottom: '1px' }}>
              <button
                onClick={handleVisualScreen}
                style={{
                  padding: '4px 14px',
                  fontSize: '11px',
                  color: color.textInverse,
                  background: color.accentPositive,
                  border: `1px solid ${color.accentPositive}`,
                  fontWeight: 600,
                  fontFamily: font.sans,
                  cursor: 'pointer',
                  borderRadius: '2px',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = color.accentPositiveHover }}
                onMouseLeave={e => { e.currentTarget.style.background = color.accentPositive }}
              >
                SCREEN
              </button>
              <button
                onClick={handleVisualClear}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  color: color.textSecondary,
                  background: 'transparent',
                  border: `1px solid ${color.borderSubtle}`,
                  fontFamily: font.sans,
                  cursor: 'pointer',
                  borderRadius: '2px',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = color.borderMedium; e.currentTarget.style.color = color.textPrimary }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = color.borderSubtle; e.currentTarget.style.color = color.textSecondary }}
              >
                CLEAR
              </button>
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div style={{ padding: '10px 12px', color: color.accentNegative, fontSize: '12px', borderBottom: `1px solid ${color.borderSubtle}`, fontFamily: font.mono }}>
            ERR: {(error as Error).message ?? 'Screener request failed'}
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {mode === 'dsl' && (
            <div style={{
              width: '200px',
              minWidth: '200px',
              borderRight: `1px solid ${color.borderSubtle}`,
              background: 'rgba(19, 22, 25, 0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{
                padding: '8px 10px',
                borderBottom: `1px solid ${color.borderSubtle}`,
                color: color.textSecondary,
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: font.sans,
                flexShrink: 0,
              }}>
                SAVED QUERIES
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {savedQueries.length === 0 && (
                  <div style={{
                    padding: '16px 10px',
                    color: color.textTertiary,
                    fontSize: '11px',
                    textAlign: 'center',
                    fontFamily: font.mono,
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
                      borderBottom: `1px solid ${color.borderSubtle}`,
                      cursor: 'pointer',
                      transition: 'background 150ms ease',
                    }}
                    onClick={() => handleLoadSaved(sq)}
                    onMouseEnter={e => { e.currentTarget.style.background = color.bgHover }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: color.textPrimary,
                        fontSize: '11px',
                        fontFamily: font.sans,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {sq.name}
                      </div>
                      <div style={{
                        color: color.textTertiary,
                        fontSize: '10px',
                        fontFamily: font.mono,
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
                        color: color.textTertiary,
                        cursor: 'pointer',
                        fontSize: '14px',
                        lineHeight: '1',
                        padding: '2px 4px',
                        flexShrink: 0,
                        transition: 'color 150ms ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = color.accentNegative }}
                      onMouseLeave={e => { e.currentTarget.style.color = color.textTertiary }}
                    >
                      {'\u00D7'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!hasRun && !isLoading && (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: color.textTertiary,
                fontSize: '12px',
                padding: '48px',
                textAlign: 'center',
                fontFamily: font.mono,
              }}>
                {mode === 'dsl'
                  ? 'ENTER A DSL QUERY AND PRESS [ \u25B6 ] TO SCAN'
                  : 'SET FILTERS AND PRESS [ SCREEN ] TO RUN'}
              </div>
            )}

            {isLoading && !data && (
              <div style={{
                padding: '16px',
                color: color.textTertiary,
                fontSize: '12px',
                textAlign: 'center',
                fontFamily: font.mono,
              }}>
                SCANNING EQUITIES...
              </div>
            )}

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

            {hasRun && !isLoading && !error && results.length === 0 && (
              <div style={{
                padding: '32px',
                color: color.textTertiary,
                fontSize: '12px',
                textAlign: 'center',
                fontFamily: font.mono,
              }}>
                NO RESULTS {'\u2014'} TRY WIDENING YOUR FILTERS
              </div>
            )}

            {hasRun && results.length > 0 && (
              <div style={{
                borderTop: `1px solid ${color.borderSubtle}`,
                padding: '4px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                color: color.textTertiary,
                fontSize: '10px',
                fontFamily: font.mono,
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

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default ScreenerScreen