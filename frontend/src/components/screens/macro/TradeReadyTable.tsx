import React from 'react'
import { color, type as typeScale } from '../../../lib/theme'
import DataGrid from '../../shared/DataGrid'
import type { DataGridColumn } from '../../shared/DataGrid'
import type { TradeIdea } from './types'

interface TradeReadyTableProps {
  ideas: TradeIdea[]
  loading?: boolean
}

const CONVICTION_COLOR: Record<string, string> = {
  high: color.accentPositive,
  medium: color.accentWarning,
  low: color.textTertiary,
}

const columns: DataGridColumn<TradeIdea>[] = [
  { key: 'asset', header: 'Asset', type: 'text', width: '60px' },
  { key: 'direction', header: 'Direction', type: 'text', width: '100px' },
  { key: 'dte_range', header: 'DTE', type: 'text', width: '60px', render: (row) => `${row.dte_range[0]}\u2013${row.dte_range[1]}` },
  { key: 'structure', header: 'Structure', type: 'text', width: '140px' },
  { key: 'entry_condition', header: 'Entry', type: 'text', width: '180px' },
  { key: 'invalidation', header: 'Invalidation', type: 'text', width: '180px' },
  {
    key: 'conviction',
    header: 'Conv.',
    type: 'text',
    width: '60px',
    render: (row) => {
      const prefix = row.half_size ? '\u00BD ' : ''
      const convictionColor = CONVICTION_COLOR[row.conviction] ?? color.textPrimary
      return (
        <span style={{ color: convictionColor }}>
          {prefix}{row.conviction.charAt(0).toUpperCase()}
        </span>
      )
    },
  },
  { key: 'iv_rank_context', header: 'IV', type: 'text', width: '80px' },
]

const TradeReadyTable: React.FC<TradeReadyTableProps> = ({ ideas, loading }) => {
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          color: color.textTertiary,
          ...typeScale.body,
        }}
      >
        Loading trade ideas...
      </div>
    )
  }

  if (ideas.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 0',
          color: color.textTertiary,
          ...typeScale.body,
        }}
      >
        Stand down &mdash; no qualifying setups
      </div>
    )
  }

  const gridData = ideas as unknown as Record<string, unknown>[]

  return (
    <div style={ideas.some(i => i.half_size) ? undefined : undefined}>
      <DataGrid
        columns={columns as unknown as DataGridColumn<Record<string, unknown>>[]}
        data={gridData}
        keyField="asset"
        maxHeight="300px"
        staggerEntry={false}
        virtualize={false}
      />
    </div>
  )
}

export default TradeReadyTable