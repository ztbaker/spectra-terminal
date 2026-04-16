import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import C from '../../lib/colors'
import { useBreakpoint } from '../../lib/useBreakpoint'

export type ColType = 'text' | 'number' | 'pct' | 'currency' | 'change' | 'sparkline'

export interface DataGridColumn<T = Record<string, unknown>> {
  key: string
  header: string
  type?: ColType
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  render?: (row: T) => React.ReactNode
  width?: string
  /** If true, this column is hidden at compact breakpoint (< 1440px) */
  hideOnCompact?: boolean
}

interface DataGridProps<T> {
  columns: DataGridColumn<T>[]
  data: T[]
  keyField: string
  maxHeight?: string
  onRowClick?: (row: T) => void
  onRowHover?: (row: T | null) => void
  stickyHeader?: boolean
  rowAccent?: (row: T) => 'default' | 'success' | 'danger' | 'highlight'
  emptyMessage?: string
  /** Enable staggered fade-in animation on row entry (default true) */
  staggerEntry?: boolean
  /** Enable virtual scrolling: true = always, false = never, 'auto' = when rows > 100 */
  virtualize?: boolean | 'auto'
}

function getField(row: unknown, key: string): unknown {
  if (typeof row === 'object' && row !== null && key in row) {
    return (row as Record<string, unknown>)[key]
  }
  return null
}

function formatValue(value: unknown, type: ColType): string {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  if (isNaN(num)) return String(value)
  switch (type) {
    case 'pct': return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`
    case 'currency': return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'change': return `${num >= 0 ? '+' : ''}${num.toFixed(2)}`
    case 'number': return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
    default: return String(value)
  }
}

function changeColor(value: unknown): string | undefined {
  if (typeof value !== 'number') return undefined
  if (value > 0) return C.green
  if (value < 0) return C.red
  return C.whiteDim
}

function DataGrid<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  maxHeight,
  onRowClick,
  onRowHover,
  stickyHeader = true,
  rowAccent,
  emptyMessage = 'No data',
  staggerEntry = true,
  virtualize = 'auto',
}: DataGridProps<T>): React.ReactElement {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const breakpoint = useBreakpoint()

  // Track whether data has loaded for the first time (for stagger animation)
  const [hasLoaded, setHasLoaded] = useState(false)
  const prevDataLenRef = useRef(0)
  useEffect(() => {
    if (data.length > 0 && !hasLoaded) {
      setHasLoaded(true)
    }
    // Re-trigger stagger if data changes significantly (e.g. new query)
    if (data.length > 0 && Math.abs(data.length - prevDataLenRef.current) > 5) {
      setHasLoaded(true)
    }
    prevDataLenRef.current = data.length
  }, [data.length, hasLoaded])

  // Filter columns based on breakpoint
  const visibleColumns = useMemo(() => {
    if (breakpoint !== 'compact') return columns
    return columns.filter(col => !col.hideOnCompact)
  }, [columns, breakpoint])

  // Determine whether to use virtual scrolling
  const shouldVirtualize = virtualize === true || (virtualize === 'auto' && data.length > 100)

  const handleHeaderClick = useCallback((col: DataGridColumn<T>) => {
    if (!col.sortable) return
    if (sortKey === col.key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(col.key)
      setSortDir('asc')
    }
  }, [sortKey])

  const sorted = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const aVal = getField(a, sortKey)
      const bVal = getField(b, sortKey)
      const nullA = aVal === null || aVal === undefined
      const nullB = bVal === null || bVal === undefined
      if (nullA && nullB) return 0
      if (nullA) return 1
      if (nullB) return -1
      let result = 0
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        result = aVal - bVal
      } else {
        result = String(aVal).localeCompare(String(bVal))
      }
      return sortDir === 'asc' ? result : -result
    })
  }, [data, sortKey, sortDir])

  const accentStyle = (row: T): React.CSSProperties => {
    if (!rowAccent) return {}
    const accent = rowAccent(row)
    switch (accent) {
      case 'success': return { borderLeft: `3px solid ${C.green}` }
      case 'danger': return { borderLeft: `3px solid ${C.red}` }
      case 'highlight': return { borderLeft: `3px solid ${C.amber}`, background: C.surfaceGlow }
      default: return {}
    }
  }

  // Compute stagger delay per row, capped at 600ms total
  const getStaggerDelay = useCallback((rowIdx: number): number => {
    if (!staggerEntry || !hasLoaded) return 0
    const perRow = Math.max(15, Math.min(15, 600 / sorted.length))
    return rowIdx * perRow
  }, [staggerEntry, hasLoaded, sorted.length])

  // ── Virtualized rendering ──
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 5,
  })

  if (shouldVirtualize) {
    return (
      <div
        ref={parentRef}
        style={{
          maxHeight: maxHeight ?? '600px',
          overflowY: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: C.fontMono }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.amber}20` }}>
              {visibleColumns.map((col, colIdx) => {
                const isActive = sortKey === col.key
                const arrow = isActive ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
                const isLast = colIdx === visibleColumns.length - 1
                return (
                  <th
                    key={col.key}
                    onClick={() => handleHeaderClick(col)}
                    style={{
                      textAlign: col.align ?? (col.type === 'text' ? 'left' : 'right'),
                      cursor: col.sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      color: isActive ? C.amber : C.whiteDim,
                      fontWeight: 600,
                      fontSize: '9px',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                      padding: '6px 8px',
                      position: stickyHeader ? 'sticky' : undefined,
                      top: stickyHeader ? 0 : undefined,
                      background: stickyHeader ? C.surface1 : undefined,
                      zIndex: stickyHeader ? 1 : undefined,
                      borderRight: isLast ? undefined : `1px solid ${C.border0}`,
                      width: col.width,
                    }}
                  >
                    {col.header}{arrow}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {sorted.length === 0 && (
              <tr><td colSpan={visibleColumns.length} style={{ textAlign: 'center', color: C.whiteGhost, padding: '24px' }}>{emptyMessage}</td></tr>
            )}
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = sorted[virtualRow.index]
              const key = String(getField(row, keyField) ?? virtualRow.index)
              const isHovered = hoveredIdx === virtualRow.index
              const accent = accentStyle(row)
              const staggerDelay = getStaggerDelay(virtualRow.index)
              return (
                <tr
                  key={key}
                  data-index={virtualRow.index}
                  onClick={() => onRowClick?.(row)}
                  onMouseEnter={() => { setHoveredIdx(virtualRow.index); onRowHover?.(row) }}
                  onMouseLeave={() => { setHoveredIdx(null); onRowHover?.(null) }}
                  style={{
                    background: isHovered ? C.surfaceGlow : virtualRow.index % 2 === 0 ? C.surface0 : `${C.surface0}80`,
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background 100ms ease',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    borderLeft: isHovered && onRowClick ? `3px solid ${C.amber}` : undefined,
                    ...accent,
                    ...(staggerDelay > 0 ? {
                      animation: 'fadeSlideUp 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
                      animationDelay: `${staggerDelay}ms`,
                    } : {}),
                  }}
                >
                  {visibleColumns.map((col, colIdx) => {
                    const raw = getField(row, col.key)
                    const content = col.render
                      ? col.render(row)
                      : formatValue(raw, col.type ?? 'text')
                    const color = (col.type === 'change' || col.type === 'pct') && !col.render
                      ? changeColor(raw)
                      : undefined
                    const isLast = colIdx === visibleColumns.length - 1
                    return (
                      <td
                        key={col.key}
                        style={{
                          textAlign: col.align ?? (col.type === 'text' ? 'left' : 'right'),
                          padding: '5px 8px',
                          color: color ?? C.white,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          borderRight: isLast ? undefined : `1px solid ${C.border0}`,
                        }}
                      >
                        {content}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Standard (non-virtualized) rendering ──
  return (
    <div style={{ maxHeight: maxHeight ?? undefined, overflowY: maxHeight ? 'auto' : undefined }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: C.fontMono }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.amber}20` }}>
            {visibleColumns.map((col, colIdx) => {
              const isActive = sortKey === col.key
              const arrow = isActive ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
              const isLast = colIdx === visibleColumns.length - 1
              return (
                <th
                  key={col.key}
                  onClick={() => handleHeaderClick(col)}
                  style={{
                    textAlign: col.align ?? (col.type === 'text' ? 'left' : 'right'),
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    color: isActive ? C.amber : C.whiteDim,
                    fontWeight: 600,
                    fontSize: '9px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase' as const,
                    padding: '6px 8px',
                    position: stickyHeader ? 'sticky' : undefined,
                    top: stickyHeader ? 0 : undefined,
                    background: stickyHeader ? C.surface1 : undefined,
                    zIndex: stickyHeader ? 1 : undefined,
                    borderRight: isLast ? undefined : `1px solid ${C.border0}`,
                    width: col.width,
                  }}
                >
                  {col.header}{arrow}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={visibleColumns.length} style={{ textAlign: 'center', color: C.whiteGhost, padding: '24px' }}>{emptyMessage}</td></tr>
          )}
          {sorted.map((row, rowIdx) => {
            const key = String(getField(row, keyField) ?? rowIdx)
            const isHovered = hoveredIdx === rowIdx
            const accent = accentStyle(row)
            const staggerDelay = getStaggerDelay(rowIdx)
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => { setHoveredIdx(rowIdx); onRowHover?.(row) }}
                onMouseLeave={() => { setHoveredIdx(null); onRowHover?.(null) }}
                style={{
                  background: isHovered ? C.surfaceGlow : rowIdx % 2 === 0 ? C.surface0 : `${C.surface0}80`,
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background 100ms ease',
                  borderLeft: isHovered && onRowClick ? `3px solid ${C.amber}` : undefined,
                  ...accent,
                  ...(staggerDelay > 0 ? {
                    animation: 'fadeSlideUp 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
                    animationDelay: `${staggerDelay}ms`,
                  } : {}),
                }}
              >
                {visibleColumns.map((col, colIdx) => {
                  const raw = getField(row, col.key)
                  const content = col.render
                    ? col.render(row)
                    : formatValue(raw, col.type ?? 'text')
                  const color = (col.type === 'change' || col.type === 'pct') && !col.render
                    ? changeColor(raw)
                    : undefined
                  const isLast = colIdx === visibleColumns.length - 1
                  return (
                    <td
                      key={col.key}
                      style={{
                        textAlign: col.align ?? (col.type === 'text' ? 'left' : 'right'),
                        padding: '5px 8px',
                        color: color ?? C.white,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        borderRight: isLast ? undefined : `1px solid ${C.border0}`,
                      }}
                    >
                      {content}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default DataGrid