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
import C from '../../lib/colors'

// ─── Formatting helpers ───────────────────────────────────────────────────────

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
    <span style={{ display: 'inline-flex', gap: '3px' }}>
      {(['EQUITY', 'CHART', 'OPTIONS', 'NEWS'] as const).map(screen => (
        <button
          key={screen}
          className="bb-btn"
          style={{ fontSize: '10px', padding: '1px 5px', letterSpacing: 0 }}
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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onNavigate: (cmd: string) => void
}

const WatchlistScreen: React.FC<Props> = ({ onNavigate }) => {
  const queryClient = useQueryClient()
  const [tickerInput, setTickerInput] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ─── Query ────────────────────────────────────────────────────────────────

  const { data, isLoading, isError, refetch, isFetching } = useQuery<WatchlistQuote[]>({
    queryKey: ['watchlist', 'quotes'],
    queryFn: async () => {
      const result = await fetchWatchlistQuotes()
      setLastUpdated(new Date())
      return result
    },
    staleTime: 15_000,
  })

  usePolling(refetch, 15_000)

  // ─── Mutations ────────────────────────────────────────────────────────────

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

  // ─── Handlers ─────────────────────────────────────────────────────────────

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

  // ─── Render ───────────────────────────────────────────────────────────────

  const quotes = data ?? []

  return (
    <Panel
      title="WL — WATCHLIST MONITOR"
      actions={
        <span className="bb-label" style={{ fontSize: '10px' }}>
          {isFetching && !isLoading ? 'REFRESHING...' : `${quotes.length} SYMBOLS`}
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
          padding: '6px 8px',
          borderBottom: `1px solid ${C.border1}`,
          background: C.surface1,
        }}
      >
        <span className="bb-label" style={{ whiteSpace: 'nowrap' }}>ADD TICKER:</span>
        <input
          ref={inputRef}
          className="bb-input"
          style={{ width: '120px', fontSize: '13px' }}
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
          {addMutation.isPending ? 'ADDING...' : '[ADD]'}
        </button>
        {addMutation.isError && (
          <span className="bb-loss" style={{ fontSize: '11px' }}>
            ERROR: {(addMutation.error as Error)?.message ?? 'Failed'}
          </span>
        )}
      </div>

      {/* Table or empty state */}
      {isError ? (
        <div style={{ padding: '24px', textAlign: 'center', color: C.red }}>
          WATCHLIST UNAVAILABLE — BACKEND ERROR
        </div>
      ) : quotes.length === 0 && !isLoading ? (
        <div
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            color: '#554400',
            fontSize: '12px',
            letterSpacing: '0.05em',
          }}
        >
          WATCHLIST EMPTY — Type a ticker above and press [ADD]
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="bb-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '80px' }}>TICKER</th>
                <th style={{ textAlign: 'left', minWidth: '140px' }}>COMPANY</th>
                <th>PRICE</th>
                <th>CHANGE</th>
                <th>CHG%</th>
                <th>VOLUME</th>
                <th>MKT CAP</th>
                <th style={{ textAlign: 'center', width: '36px' }}></th>
                <th style={{ textAlign: 'center', width: '24px' }}></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map(row => (
                <React.Fragment key={row.ticker}>
                  <tr>
                    {/* TICKER */}
                    <td
                      style={{ color: '#ff9900', cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => onNavigate(`${row.ticker} EQUITY`)}
                    >
                      {row.ticker}
                    </td>

                    {/* COMPANY */}
                    <td
                      style={{
                        textAlign: 'left',
                        color: '#cc7700',
                        maxWidth: '180px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {row.company_name ?? '—'}
                    </td>

                    {/* PRICE */}
                    <td style={{ color: '#e0e0e0' }}>
                      {row.price !== null ? formatPrice(row.price) : '—'}
                    </td>

                    {/* CHANGE */}
                    <td>
                      <TickerBadge value={row.change} decimals={2} prefix="$" />
                    </td>

                    {/* CHG% */}
                    <td>
                      <TickerBadge value={row.change_pct} pct decimals={2} />
                    </td>

                    {/* VOLUME */}
                    <td style={{ color: '#e0e0e0' }}>{formatLarge(row.volume)}</td>

                    {/* MKT CAP */}
                    <td style={{ color: '#e0e0e0' }}>{formatLarge(row.market_cap)}</td>

                    {/* Quick nav toggle */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="bb-btn"
                        style={{ fontSize: '10px', padding: '1px 4px' }}
                        title="Quick navigate"
                        onClick={e => {
                          e.stopPropagation()
                          toggleRow(row.ticker)
                        }}
                      >
                        {expandedRow === row.ticker ? '▲' : '→'}
                      </button>
                    </td>

                    {/* Remove */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="bb-btn"
                        style={{
                          fontSize: '11px',
                          padding: '1px 5px',
                          color: '#ff3333',
                          borderColor: '#441111',
                        }}
                        title={`Remove ${row.ticker}`}
                        onClick={e => {
                          e.stopPropagation()
                          removeMutation.mutate({ ticker: row.ticker })
                        }}
                        disabled={removeMutation.isPending}
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
                          background: '#0a0800',
                          padding: '4px 12px',
                          borderBottom: '1px solid #2a2a2a',
                        }}
                      >
                        <span className="bb-label" style={{ marginRight: '8px' }}>
                          {row.ticker}:
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

      {/* Footer: last updated */}
      <div
        style={{
          padding: '3px 8px',
          borderTop: '1px solid #2a2a2a',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: '#554400',
          flexShrink: 0,
        }}
      >
        <span>RIGHT-CLICK ROW OR [→] FOR QUICK NAV</span>
        <span>
          {lastUpdated
            ? `UPDATED ${lastUpdated.toLocaleTimeString('en-US', { hour12: false })}`
            : 'AWAITING DATA'}
        </span>
      </div>
    </Panel>
  )
}

export default WatchlistScreen
