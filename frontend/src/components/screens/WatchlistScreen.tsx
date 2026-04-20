import Panel from '../Terminal/Panel'
import React, { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchWatchlistQuotes,
  addToWatchlist,
  removeFromWatchlist,
} from '../../lib/api'
import type { WatchlistQuote } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import TickerBadge from '../shared/TickerBadge'
import { usePolling } from '../../hooks/usePolling'
import theme from '../../lib/theme'

const { color, font } = theme

// ─── Formatting helpers ──────────────��─────────────────────────────���──────────

function formatLarge(n: number | null): string {
  if (n === null) return '—'
  if (Math.abs(n) >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T'
  if (Math.abs(n) >= 1_000_000_000)     return (n / 1_000_000_000).toFixed(2) + 'B'
  if (Math.abs(n) >= 1_000_000)         return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000)             return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('en-US')
}

function formatPrice(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Quick-nav row component ──────────────────────────────────────────────────

interface QuickNavProps {
  ticker: string
  onNavigate: (cmd: string) => void
}

const QuickNav: React.FC<QuickNavProps> = ({ ticker, onNavigate }) => {
  return (
    <span style={{ display: 'inline-flex', gap: '4px' }}>
      {(['EQUITY', 'CHART', 'OPTIONS', 'NEWS'] as const).map(screen => (
        <button
          key={screen}
          className="bb-btn"
          style={{ fontSize: '10px', padding: '2px 8px' }}
          onClick={e => {
            e.stopPropagation()
            onNavigate(`${ticker} ${screen}`)
          }}
        >
          {screen}
        </button>
      ))}
    </span>
  )
}

// ─── Main component ──────��─────────────────────────��──────────────────────���───

interface Props {
  onNavigate: (cmd: string) => void
}

const WatchlistScreen: React.FC<Props> = ({ onNavigate }) => {
  const queryClient = useQueryClient()
  const [tickerInput, setTickerInput] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<WatchlistQuote[]>({
    queryKey: ['watchlist', 'quotes'],
    queryFn: () => fetchWatchlistQuotes(),
    staleTime: 15_000,
  })

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null

  usePolling(refetch, 15_000)

  const addMutation = useMutation({
    mutationFn: (vars: { ticker: string }) => addToWatchlist(vars.ticker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
      setTickerInput('')
      inputRef.current?.focus()
    },
  })

  const removeMutation = useMutation({
    mutationFn: (vars: { ticker: string }) => removeFromWatchlist(vars.ticker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    },
  })

  const handleAdd = () => {
    const t = tickerInput.trim().toUpperCase()
    if (!t) return
    addMutation.mutate({ ticker: t })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd()
  }

  const handleTickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTickerInput(e.target.value.toUpperCase())
  }

  const toggleRow = (ticker: string) => {
    setExpandedRow(prev => (prev === ticker ? null : ticker))
  }

  const quotes = data ?? []

  return (
    <Panel
      title="Watchlist"
      actions={
        <span style={{ fontSize: '11px', color: color.textTertiary, fontFamily: font.sans }}>
          {isFetching && !isLoading ? 'Refreshing...' : `${quotes.length} symbols`}
        </span>
      }
    >
      <LoadingBar loading={isLoading || isFetching} />

      {/* Add ticker form */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          borderBottom: `1px solid ${color.borderSubtle}`,
        }}
      >
        <span style={{ color: color.textTertiary, fontSize: '11px', fontWeight: 500, fontFamily: font.sans, whiteSpace: 'nowrap' }}>
          Add ticker
        </span>
        <input
          ref={inputRef}
          className="bb-input"
          style={{ width: '120px', fontSize: '13px', fontFamily: font.mono, padding: '6px 10px' }}
          value={tickerInput}
          onChange={handleTickerChange}
          onKeyDown={handleKeyDown}
          placeholder="AAPL"
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className={addMutation.isPending ? 'bb-btn bb-btn-active' : 'bb-btn'}
          onClick={handleAdd}
          disabled={addMutation.isPending || !tickerInput.trim()}
        >
          {addMutation.isPending ? 'Adding...' : 'Add'}
        </button>
        {addMutation.isError && (
          <span style={{ fontSize: '11px', color: color.accentNegative }}>
            {(addMutation.error as Error)?.message ?? 'Failed'}
          </span>
        )}
      </div>

      {/* Table or empty state */}
      {isError ? (
        <div style={{ padding: '24px', textAlign: 'center', color: color.accentNegative, fontFamily: font.sans, fontSize: '13px' }}>
          Watchlist unavailable
        </div>
      ) : quotes.length === 0 && !isLoading ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: color.textTertiary,
            fontSize: '13px',
            fontFamily: font.sans,
          }}
        >
          No symbols yet — type a ticker above and press Add
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="bb-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '80px' }}>Ticker</th>
                <th style={{ textAlign: 'left', minWidth: '140px' }}>Company</th>
                <th>Price</th>
                <th>Change</th>
                <th>%</th>
                <th>Volume</th>
                <th>Mkt Cap</th>
                <th style={{ textAlign: 'center', width: '36px' }}></th>
                <th style={{ textAlign: 'center', width: '24px' }}></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map(row => (
                <React.Fragment key={row.ticker}>
                  <tr>
                    <td
                      style={{ color: color.ticker, cursor: 'pointer', fontWeight: 600, fontFamily: font.mono, fontSize: '12px' }}
                      onClick={() => onNavigate(`${row.ticker} EQUITY`)}
                    >
                      {row.ticker}
                    </td>

                    <td
                      style={{
                        textAlign: 'left',
                        color: color.textSecondary,
                        maxWidth: '180px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {row.company_name ?? '—'}
                    </td>

                    <td style={{ color: color.textPrimary, fontWeight: 500 }}>
                      {row.price !== null ? formatPrice(row.price) : '—'}
                    </td>

                    <td>
                      <TickerBadge value={row.change} decimals={2} prefix="$" />
                    </td>

                    <td>
                      <TickerBadge value={row.change_pct} pct decimals={2} />
                    </td>

                    <td style={{ color: color.textSecondary }}>{formatLarge(row.volume)}</td>

                    <td style={{ color: color.textSecondary }}>{formatLarge(row.market_cap)}</td>

                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="bb-btn"
                        style={{ fontSize: '10px', padding: '2px 6px' }}
                        title="Quick navigate"
                        onClick={e => {
                          e.stopPropagation()
                          toggleRow(row.ticker)
                        }}
                      >
                        {expandedRow === row.ticker ? '▲' : '→'}
                      </button>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="bb-btn"
                        style={{
                          fontSize: '12px',
                          padding: '1px 6px',
                          color: color.textTertiary,
                        }}
                        title={`Remove ${row.ticker}`}
                        onClick={e => {
                          e.stopPropagation()
                          removeMutation.mutate({ ticker: row.ticker })
                        }}
                        disabled={removeMutation.isPending}
                        onMouseEnter={e => { e.currentTarget.style.color = color.accentNegative }}
                        onMouseLeave={e => { e.currentTarget.style.color = color.textTertiary }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>

                  {/* Expanded quick-nav row */}
                  {expandedRow === row.ticker && (
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          background: color.bgSurface,
                          padding: '6px 16px',
                          borderBottom: `1px solid ${color.borderSubtle}`,
                        }}
                      >
                        <span style={{ color: color.textTertiary, fontSize: '11px', marginRight: '10px', fontFamily: font.mono }}>
                          {row.ticker}
                        </span>
                        <QuickNav ticker={row.ticker} onNavigate={onNavigate} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          padding: '6px 16px',
          borderTop: `1px solid ${color.borderSubtle}`,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: color.textTertiary,
          fontFamily: font.sans,
          flexShrink: 0,
        }}
      >
        <span>Click ticker to view · Arrow for quick nav</span>
        <span>
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString('en-US', { hour12: false })}`
            : 'Awaiting data'}
        </span>
      </div>
    </Panel>
  )
}

export default WatchlistScreen
