import React, { useState, useCallback } from 'react'
import { color, font } from '../../lib/theme'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right'
  sortable?: boolean
}

interface Props<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  maxHeight?: string   // e.g. "400px"
  keyField: string     // field name used as React key
}

type SortDir = 'asc' | 'desc'

function getField(row: unknown, key: string): unknown {
  if (typeof row === 'object' && row !== null && key in row) {
    return (row as Record<string, unknown>)[key]
  }
  return null
}

function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const nullA = a === null || a === undefined
  const nullB = b === null || b === undefined

  // Null values always sort to the bottom regardless of direction
  if (nullA && nullB) return 0
  if (nullA) return 1
  if (nullB) return -1

  let result = 0
  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b
  } else {
    result = String(a).localeCompare(String(b))
  }
  return dir === 'asc' ? result : -result
}

/**
 * Reusable sortable data table.
 * Supports client-side sorting by clicking column headers,
 * alternating row colours, optional max-height scrolling,
 * and an optional row-click callback.
 */
function DataTable<T>({
  columns,
  data,
  onRowClick,
  maxHeight,
  keyField,
}: Props<T>): React.ReactElement {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null)

  const handleHeaderClick = useCallback(
    (col: Column<T>) => {
      if (!col.sortable) return
      if (sortKey === col.key) {
        setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(col.key)
        setSortDir('asc')
      }
    },
    [sortKey],
  )

  const sorted = React.useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) =>
      compareValues(getField(a, sortKey), getField(b, sortKey), sortDir),
    )
  }, [data, sortKey, sortDir])

  return (
    <div
      style={{
        maxHeight: maxHeight ?? undefined,
        overflowY: maxHeight ? 'auto' : undefined,
      }}
    >
      <table className="bb-table">
        <thead>
          <tr style={{ borderBottom: `1px solid ${color.borderMedium}` }}>
            {columns.map((col, colIdx) => {
              const isActive = sortKey === col.key
              const arrow = isActive ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
              const isLast = colIdx === columns.length - 1
              return (
                <th
                  key={col.key}
                  onClick={() => handleHeaderClick(col)}
                  style={{
                    textAlign: col.align ?? (col.key === columns[0].key ? 'left' : 'right'),
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    color: isActive ? color.textPrimary : color.textSecondary,
                    fontWeight: 500,
                    fontSize: '11px',
                    letterSpacing: '0.02em',
                    fontFamily: font.sans,
                    padding: '6px 8px',
                    borderRight: isLast ? undefined : `1px solid ${color.borderSubtle}`,
                  }}
                >
                  {col.header}{arrow}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, rowIdx) => {
            const key = String(getField(row, keyField) ?? rowIdx)
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => setHoveredRowKey(key)}
                onMouseLeave={() => setHoveredRowKey(prev => (prev === key ? null : prev))}
                style={{
                  background: hoveredRowKey === key ? color.bgHover : undefined,
                  cursor: onRowClick ? 'pointer' : undefined,
                  transition: 'background 100ms ease',
                }}
              >
                {columns.map((col, colIdx) => {
                  const content = col.render
                    ? col.render(row)
                    : String(getField(row, col.key) ?? '—')
                  const align =
                    col.align ?? (colIdx === 0 ? 'left' : 'right')
                  return (
                    <td
                      key={col.key}
                      style={{ textAlign: align }}
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

export default DataTable
