/**
 * WEIScreen — World Equity Indices
 *
 * Displays real-time price and volume data for ~25 global equity indices
 * organized by region: Americas, Europe, Asia/Pacific, Mid East/Africa.
 * Auto-refreshes every 60 seconds.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchWorldIndices, fetchIndexMembers } from '../../lib/api'
import type { WorldIndexEntry, IndexMember } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'

const { color, font } = theme

// ─── Regions in display order ─────────────────────────────────────────────────

const REGION_ORDER = ['Americas', 'Europe', 'Asia/Pacific', 'Mid East/Africa']

// ─── Number formatters ────────────────────────────────────────────────────────

function fmtPrice(n: number | null): string {
  if (n == null) return '—'
  // Large index values (Nikkei ~40k, Bovespa ~130k) — always show 2 dp + commas
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtChange(n: number | null): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return sign + n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtPct(n: number | null): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function fmtVol(n: number | null): string {
  if (n == null || n === 0) return '—'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(0) + 'M'
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + 'K'
  return n.toFixed(0)
}

function fmtMktCap(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T'
  if (n >= 1_000_000_000)     return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000)         return (n / 1_000_000).toFixed(0) + 'M'
  return n.toFixed(0)
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const UP_COLOR   = color.accentPositive
const DOWN_COLOR = color.accentNegative
const FLAT_COLOR = color.textSecondary

const MONO: React.CSSProperties = {
  fontFamily: font.mono,
}

// ─── 52-week range bar ────────────────────────────────────────────────────────

const RangeBar: React.FC<{ lo: number; hi: number; cur: number }> = ({ lo, hi, cur }) => {
  if (hi <= lo) return <span style={{ color: color.borderSubtle }}>—</span>
  const pct = Math.min(1, Math.max(0, (cur - lo) / (hi - lo))) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{
        position: 'relative', width: 60, height: 4,
        background: 'rgba(19, 22, 25, 0.6)', borderRadius: 2,
      }}>
        <div style={{
          position: 'absolute', left: `${pct}%`, top: -1,
          width: 2, height: 6, background: color.textPrimary,
          transform: 'translateX(-50%)',
        }} />
      </div>
      <span style={{ color: color.borderSubtle, fontSize: 9 }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────

const GRID = '200px 44px 110px 100px 80px 72px 200px'

const HeaderRow: React.FC = () => (
  <div style={{
    display: 'grid', gridTemplateColumns: GRID,
    padding: '4px 12px', gap: 0,
    borderBottom: `1px solid ${color.borderSubtle}`,
    ...MONO,
  }}>
    {['INDEX', 'CTY', 'LAST', 'CHG', '%CHG', 'VOLUME', '52-WEEK RANGE'].map(h => (
      <div key={h} style={{
        color: color.textTertiary, fontSize: 10,
        textAlign: h === 'INDEX' || h === 'CTY' || h === '52-WEEK RANGE' ? 'left' : 'right',
        paddingRight: h === 'INDEX' || h === 'CTY' || h === '52-WEEK RANGE' ? 0 : 8,
      }}>
        {h}
      </div>
    ))}
  </div>
)

// Indices with constituent data available
const SUPPORTED_INDICES = new Set([
  '^DJI', '^GSPC', '^IXIC', '^RUT',
  '^FTSE', '^GDAXI', '^FCHI',
  '^N225', '^HSI', '^BSESN', '^NSEI',
])

const IndexRow: React.FC<{ entry: WorldIndexEntry; onClick?: () => void }> = ({ entry, onClick }) => {
  const isUp   = (entry.change ?? 0) > 0
  const isDown = (entry.change ?? 0) < 0
  const chgColor = isUp ? UP_COLOR : isDown ? DOWN_COLOR : FLAT_COLOR
  const hasError = entry.error != null && entry.price == null
  const clickable = !!onClick

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: GRID,
      padding: '5px 12px', gap: 0,
      borderBottom: `1px solid ${color.bgElevated}`,
      alignItems: 'center',
      transition: 'background 0.1s',
      cursor: clickable ? 'pointer' : 'default',
      ...MONO,
    }}
    onClick={onClick}
    onMouseEnter={e => (e.currentTarget.style.background = color.bgHover)}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* INDEX NAME */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: hasError ? color.borderSubtle : chgColor,
        }} />
        <span style={{ color: color.textPrimary, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.name}
        </span>
        <span style={{ color: color.borderSubtle, fontSize: 9, flexShrink: 0 }}>
          {entry.short}
        </span>
        {clickable && (
          <span style={{ color: color.borderSubtle, fontSize: 9, flexShrink: 0, marginLeft: 2 }}>›</span>
        )}
      </div>

      {/* COUNTRY */}
      <div style={{ color: color.textTertiary, fontSize: 10 }}>
        {entry.country}
      </div>

      {/* LAST PRICE */}
      <div style={{
        color: hasError ? color.borderSubtle : color.textPrimary,
        fontSize: 12, fontWeight: hasError ? 400 : 600,
        textAlign: 'right', paddingRight: 8,
      }}>
        {hasError ? 'N/A' : fmtPrice(entry.price)}
      </div>

      {/* CHG */}
      <div style={{ color: chgColor, fontSize: 11, textAlign: 'right', paddingRight: 8 }}>
        {fmtChange(entry.change)}
      </div>

      {/* %CHG */}
      <div style={{
        color: chgColor, fontSize: 12, fontWeight: 600,
        textAlign: 'right', paddingRight: 8,
      }}>
        {fmtPct(entry.change_pct)}
      </div>

      {/* VOLUME */}
      <div style={{ color: color.textTertiary, fontSize: 10, textAlign: 'right', paddingRight: 8 }}>
        {fmtVol(entry.volume)}
      </div>

      {/* 52-WEEK RANGE */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {entry.year_low != null && entry.year_high != null && entry.price != null ? (
          <>
            <span style={{ color: color.borderSubtle, fontSize: 9, width: 52, textAlign: 'right' }}>
              {fmtPrice(entry.year_low)}
            </span>
            <RangeBar lo={entry.year_low} hi={entry.year_high} cur={entry.price} />
            <span style={{ color: color.borderSubtle, fontSize: 9, width: 52 }}>
              {fmtPrice(entry.year_high)}
            </span>
          </>
        ) : (
          <span style={{ color: color.borderSubtle, fontSize: 9 }}>—</span>
        )}
      </div>
    </div>
  )
}

// ─── Region section header ────────────────────────────────────────────────────

const RegionHeader: React.FC<{
  region: string
  count: number
  advances: number
  declines: number
}> = ({ region, count, advances, declines }) => (
  <div style={{
    display:      'flex',
    alignItems:   'center',
    gap:          10,
    padding:      '6px 12px',
    borderTop: `1px solid ${color.bgElevated}`,
    borderBottom: `1px solid ${color.bgElevated}`,
    background:   color.bgBase,
    marginTop:    2,
    ...MONO,
  }}>
    <span style={{ color: color.textSecondary, fontSize: 11, fontWeight: 600 }}>
      {region.toUpperCase()}
    </span>
    <span style={{ color: color.borderSubtle, fontSize: 10 }}>
      {count} INDICES
    </span>
    <span style={{ color: color.textTertiary, fontSize: 10 }}>·</span>
    <span style={{ color: UP_COLOR,   fontSize: 10 }}>▲ {advances}</span>
    <span style={{ color: DOWN_COLOR, fontSize: 10 }}>▼ {declines}</span>
  </div>
)

// ─── Members panel ────────────────────────────────────────────────────────────

const MEMBER_GRID = '90px 110px 90px 72px 80px 90px'

const MemberHeaderRow: React.FC = () => (
  <div style={{
    display: 'grid', gridTemplateColumns: MEMBER_GRID,
    padding: '4px 12px', gap: 0,
    borderBottom: `1px solid ${color.borderSubtle}`,
    ...MONO,
  }}>
    {['TICKER', 'LAST', 'CHG', '%CHG', 'VOLUME', 'MKT CAP'].map(h => (
      <div key={h} style={{
        color: color.textTertiary, fontSize: 10,
        textAlign: h === 'TICKER' ? 'left' : 'right',
        paddingRight: h === 'TICKER' ? 0 : 8,
      }}>
        {h}
      </div>
    ))}
  </div>
)

const MemberRow: React.FC<{ member: IndexMember }> = ({ member }) => {
  const isUp   = (member.change ?? 0) > 0
  const isDown = (member.change ?? 0) < 0
  const chgColor = isUp ? UP_COLOR : isDown ? DOWN_COLOR : FLAT_COLOR

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: MEMBER_GRID,
      padding: '4px 12px', gap: 0,
      borderBottom: `1px solid ${color.bgElevated}`,
      alignItems: 'center',
      ...MONO,
    }}
    onMouseEnter={e => (e.currentTarget.style.background = color.bgHover)}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ color: color.textPrimary, fontSize: 11, fontWeight: 700 }}>{member.ticker}</div>
      <div style={{ color: color.textPrimary, fontSize: 11, fontWeight: 600, textAlign: 'right', paddingRight: 8 }}>
        {fmtPrice(member.price)}
      </div>
      <div style={{ color: chgColor, fontSize: 11, textAlign: 'right', paddingRight: 8 }}>
        {fmtChange(member.change)}
      </div>
      <div style={{ color: chgColor, fontSize: 12, fontWeight: 600, textAlign: 'right', paddingRight: 8 }}>
        {fmtPct(member.change_pct)}
      </div>
      <div style={{ color: color.textTertiary, fontSize: 10, textAlign: 'right', paddingRight: 8 }}>
        {fmtVol(member.volume)}
      </div>
      <div style={{ color: color.textTertiary, fontSize: 10, textAlign: 'right', paddingRight: 8 }}>
        {fmtMktCap(member.market_cap)}
      </div>
    </div>
  )
}

interface MembersPanelProps {
  index: WorldIndexEntry
  onBack: () => void
}

const MembersPanel: React.FC<MembersPanelProps> = ({ index, onBack }) => {
  const [allMembers, setAllMembers] = useState<IndexMember[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const offsetRef = useRef(0)

  const { data, isLoading, error } = useQuery({
    queryKey:        ['indexMembers', index.ticker, 0],
    queryFn:         () => fetchIndexMembers(index.ticker, 0, 50),
    staleTime:       55_000,
    refetchInterval: 60_000,
  })

  // Sync first page into accumulated state
  useEffect(() => {
    if (data) {
      setAllMembers(data.members)
      setTotal(data.total)
      setHasMore(data.has_more)
      offsetRef.current = data.members.length
    }
  }, [data])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const page = await fetchIndexMembers(index.ticker, offsetRef.current, 50)
      setAllMembers(prev => [...prev, ...page.members])
      setHasMore(page.has_more)
      offsetRef.current += page.members.length
    } catch {
      // silently fail — user can retry
    } finally {
      setLoadingMore(false)
    }
  }, [index.ticker, loadingMore, hasMore])

  const { advances, declines } = useMemo(() => {
    if (!allMembers.length) return { advances: 0, declines: 0 }
    let adv = 0, dec = 0
    for (const m of allMembers) {
      if ((m.change_pct ?? 0) > 0) adv++
      else if ((m.change_pct ?? 0) < 0) dec++
    }
    return { advances: adv, declines: dec }
  }, [allMembers])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      {/* Sub-header */}
      <div style={{
        flexShrink: 0, background: 'rgba(19, 22, 25, 0.6)',
        borderBottom: `1px solid ${color.borderSubtle}`,
        padding: '5px 12px',
        display: 'flex', alignItems: 'center', gap: 12,
        ...MONO,
      }}>
        <button
          className="bb-btn"
          style={{ padding: '1px 8px', fontSize: 10 }}
          onClick={onBack}
        >
          ← WEI
        </button>
        <span style={{ color: color.accentPositive, fontSize: 12, fontWeight: 700 }}>
          {index.name.toUpperCase()}
        </span>
        <span style={{ color: color.textTertiary, fontSize: 10 }}>
          {index.short} · {index.country}
        </span>
        {data && (
          <>
            <span style={{ color: color.borderSubtle, fontSize: 10 }}>·</span>
            <span style={{ color: UP_COLOR,   fontSize: 10 }}>▲ {advances}</span>
            <span style={{ color: DOWN_COLOR, fontSize: 10 }}>▼ {declines}</span>
            <span style={{ color: color.borderSubtle, fontSize: 10, marginLeft: 4 }}>
              {allMembers.length} OF {total} CONSTITUENTS
            </span>
          </>
        )}
      </div>

      {/* Body */}
      {error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.accentNegative, fontSize: 11 }}>
          ERR: {(error as Error).message}
        </div>
      )}
      {!error && (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <MemberHeaderRow />
          {isLoading && !data && (
            <div style={{ padding: '20px 12px', color: color.borderSubtle, fontSize: 11 }}>
              FETCHING CONSTITUENTS…
            </div>
          )}
          {allMembers.map(m => (
            <MemberRow key={m.ticker} member={m} />
          ))}
          {allMembers.length === 0 && !isLoading && (
            <div style={{ padding: '20px 12px', color: color.borderSubtle, fontSize: 11 }}>
              NO CONSTITUENT DATA AVAILABLE
            </div>
          )}
          {hasMore && (
            <div style={{ padding: '12px', textAlign: 'center' }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  background: 'transparent',
                  border: `1px solid ${color.accentPositive}`,
                  color: color.accentPositive,
                  padding: '6px 20px',
                  fontFamily: font.sans,
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: loadingMore ? 'default' : 'pointer',
                  opacity: loadingMore ? 0.5 : 1,
                }}
              >
                {loadingMore
                  ? 'LOADING…'
                  : `LOAD MORE (${allMembers.length} of ${total})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sort control ─────────────────────────────────────────────────────────────

type SortKey = 'default' | 'pct_asc' | 'pct_desc'

// ─── Main screen ──────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (cmd: string) => void
}

const WEIScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const [sort, setSort] = useState<SortKey>('default')
  const [selectedIndex, setSelectedIndex] = useState<WorldIndexEntry | null>(null)

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey:        ['worldIndices'],
    queryFn:         fetchWorldIndices,
    staleTime:       55_000,
    refetchInterval: 60_000,
  })

  // ── Group and optionally sort ───────────────────────────────────────────────
  const grouped = useMemo(() => {
    if (!data?.indices) return new Map<string, WorldIndexEntry[]>()

    const map = new Map<string, WorldIndexEntry[]>()
    for (const region of REGION_ORDER) map.set(region, [])

    for (const entry of data.indices) {
      const region = REGION_ORDER.includes(entry.region) ? entry.region : 'Mid East/Africa'
      map.get(region)!.push(entry)
    }

    if (sort !== 'default') {
      for (const [, entries] of map) {
        entries.sort((a, b) => {
          const va = a.change_pct ?? -Infinity
          const vb = b.change_pct ?? -Infinity
          return sort === 'pct_desc' ? vb - va : va - vb
        })
      }
    }

    return map
  }, [data, sort])

  // ── Summary stats ───────────────────────────────────────────────────────────
  const { advances, declines, unchanged } = useMemo(() => {
    if (!data?.indices) return { advances: 0, declines: 0, unchanged: 0 }
    let adv = 0, dec = 0, unc = 0
    for (const e of data.indices) {
      if (e.change_pct == null) continue
      if (e.change_pct > 0)      adv++
      else if (e.change_pct < 0) dec++
      else                       unc++
    }
    return { advances: adv, declines: dec, unchanged: unc }
  }, [data])

  const totalWithData = advances + declines + unchanged

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      background:    color.bgBase,
      overflow:      'hidden',
      ...MONO,
    }}>
      <LoadingBar loading={isLoading} />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink:   0,
        background:   color.bgElevated,
        borderBottom: `1px solid ${color.borderSubtle}`,
        padding:      '6px 12px',
      }}>
        {/* Row 1: title + timestamp */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 5 }}>
          <span style={{
            color: color.textPrimary, fontSize: 14, fontWeight: 700,
          }}>
            WEI{' '}
            {selectedIndex ? (
              <span style={{ color: color.textTertiary, fontSize: 11, fontWeight: 400 }}>
                WORLD EQUITY INDICES
                <span style={{ color: color.textPrimary }}> › {selectedIndex.name.toUpperCase()}</span>
              </span>
            ) : (
              <span style={{ color: color.textTertiary, fontSize: 11, fontWeight: 400 }}>
                WORLD EQUITY INDICES
              </span>
            )}
          </span>

          {!selectedIndex && dataUpdatedAt > 0 && (
            <span style={{ color: color.borderSubtle, fontSize: 10 }}>
              LAST UPDATE: {fmtTime(dataUpdatedAt / 1000)}
            </span>
          )}

          {/* Auto-refresh label */}
          {!selectedIndex && (
            <span style={{ color: color.borderSubtle, fontSize: 10, marginLeft: 'auto' }}>
              {isLoading ? (
                <span style={{ color: color.textTertiary }}>● REFRESHING…</span>
              ) : (
                'AUTO-REFRESH 60s'
              )}
            </span>
          )}
        </div>

        {/* Row 2: advance/decline summary + sort controls (only in index list view) */}
        {!selectedIndex && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {totalWithData > 0 && (
              <>
                <span style={{ color: color.textTertiary, fontSize: 10 }}>
                  {totalWithData} INDICES
                </span>
                <span style={{ color: UP_COLOR,   fontSize: 11, fontWeight: 600 }}>
                  ▲ {advances} ADV
                </span>
                <span style={{ color: DOWN_COLOR, fontSize: 11, fontWeight: 600 }}>
                  ▼ {declines} DEC
                </span>
                {unchanged > 0 && (
                  <span style={{ color: FLAT_COLOR, fontSize: 10 }}>
                    ━ {unchanged} UNCH
                  </span>
                )}

                {/* Breadth bar */}
                {totalWithData > 0 && (
                  <div style={{
                    display:  'flex',
                    height:   6,
                    width:    120,
                    overflow: 'hidden',
                    border:   '1px solid ' + color.borderSubtle,
                  }}>
                    <div style={{
                      width:      `${(advances / totalWithData) * 100}%`,
                      background: UP_COLOR,
                      opacity:    0.7,
                    }} />
                    <div style={{
                      width:      `${(unchanged / totalWithData) * 100}%`,
                      background: FLAT_COLOR,
                      opacity:    0.5,
                    }} />
                    <div style={{
                      width:      `${(declines / totalWithData) * 100}%`,
                      background: DOWN_COLOR,
                      opacity:    0.7,
                    }} />
                  </div>
                )}
              </>
            )}

            {/* Sort buttons */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ color: color.borderSubtle, fontSize: 10, marginRight: 4 }}>SORT:</span>
              {([
                ['default',  'REGION'],
                ['pct_desc', '▲ %CHG'],
                ['pct_asc',  '▼ %CHG'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  className={sort === key ? 'bb-btn bb-btn-active' : 'bb-btn'}
                  style={{ padding: '1px 7px', fontSize: 10 }}
                  onClick={() => setSort(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Members drill-down ────────────────────────────────────────────── */}
      {selectedIndex && (
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <MembersPanel
            index={selectedIndex}
            onBack={() => setSelectedIndex(null)}
          />
        </div>
      )}

      {/* ── Index list ────────────────────────────────────────────────────── */}
      {!selectedIndex && (
        <>
          {/* Error state */}
          {error && !isLoading && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: color.accentNegative, fontSize: 12,
            }}>
              ERR: {(error as Error).message ?? 'Failed to load world indices'}
            </div>
          )}

          {/* Table */}
          {!error && (
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <HeaderRow />

              {Array.from(grouped.entries()).map(([region, entries]) => {
                if (entries.length === 0) return null
                const regAdv = entries.filter(e => (e.change_pct ?? 0) > 0).length
                const regDec = entries.filter(e => (e.change_pct ?? 0) < 0).length
                return (
                  <div key={region}>
                    <RegionHeader
                      region={region}
                      count={entries.length}
                      advances={regAdv}
                      declines={regDec}
                    />
                    {entries.map(entry => (
                      <IndexRow
                        key={entry.ticker}
                        entry={entry}
                        onClick={SUPPORTED_INDICES.has(entry.ticker)
                          ? () => setSelectedIndex(entry)
                          : undefined}
                      />
                    ))}
                  </div>
                )
              })}

              {/* Loading skeleton */}
              {isLoading && !data && (
                <div style={{ padding: '24px 12px', color: color.borderSubtle, fontSize: 11 }}>
                  FETCHING WORLD INDICES…
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default WEIScreen