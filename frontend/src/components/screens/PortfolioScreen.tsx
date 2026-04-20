import Panel from '../Terminal/Panel'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPortfolioPerformance,
  addPosition,
  deletePosition,
} from '../../lib/api'
import { usePolling } from '../../hooks/usePolling'
import type { PortfolioPerformance, PortfolioRow } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import TickerBadge from '../shared/TickerBadge'
import theme from '../../lib/theme'

const { color, font } = theme

function formatMoney(n: number | null): string {
  if (n === null) return '\u2014'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatLarge(n: number | null): string {
  if (n === null) return '\u2014'
  if (Math.abs(n) >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T'
  if (Math.abs(n) >= 1_000_000_000)     return (n / 1_000_000_000).toFixed(2) + 'B'
  if (Math.abs(n) >= 1_000_000)         return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000)             return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const ALLOC_COLORS = [
  color.accentPositive, color.accentInfo, color.accentWarning, color.accentInfo, color.accentWarning,
  color.accentInfo, color.accentWarning, color.accentInfo, color.accentWarning, color.accentInfo,
]

interface AllocationBarProps {
  holdings: PortfolioRow[]
  totalValue: number
}

const AllocationBar: React.FC<AllocationBarProps> = ({ holdings, totalValue }) => {
  if (!holdings.length || totalValue <= 0) return null

  const segments = holdings
    .filter(h => h.market_value !== null && h.market_value > 0)
    .map((h, i) => ({
      ticker: h.ticker,
      pct: ((h.market_value as number) / totalValue) * 100,
      color: ALLOC_COLORS[i % ALLOC_COLORS.length],
    }))

  if (!segments.length) return null

  return (
    <div style={{ padding: '8px', borderTop: `1px solid ${color.borderSubtle}` }}>
      <div className="bb-label" style={{ marginBottom: '4px', fontSize: '10px' }}>
        ALLOCATION
      </div>

      <div
        style={{
          display: 'flex',
          height: '20px',
          width: '100%',
          overflow: 'hidden',
          border: `1px solid ${color.borderSubtle}`,
        }}
      >
        {segments.map(seg => (
          <div
            key={seg.ticker}
            title={`${seg.ticker}: ${seg.pct.toFixed(1)}%`}
            style={{
              width: `${seg.pct}%`,
              background: seg.color,
              minWidth: '1px',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', width: '100%', marginTop: '3px' }}>
        {segments.map(seg => (
          <div
            key={seg.ticker}
            style={{
              width: `${seg.pct}%`,
              minWidth: '1px',
              overflow: 'hidden',
              textAlign: 'center',
            }}
          >
            {seg.pct > 4 ? (
              <span style={{ color: seg.color, fontSize: '10px', whiteSpace: 'nowrap' }}>
                {seg.ticker}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          marginTop: '4px',
        }}
      >
        {segments.map(seg => (
          <span key={seg.ticker} style={{ fontSize: '10px', color: color.textTertiary }}>
            <span style={{ color: seg.color }}>{seg.ticker}</span>
            {' '}{seg.pct.toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  )
}

interface Props {
  onNavigate: (cmd: string) => void
}

const PortfolioScreen: React.FC<Props> = ({ onNavigate }) => {
  const queryClient = useQueryClient()

  const [tickerInput, setTickerInput]   = useState('')
  const [sharesInput, setSharesInput]   = useState('')
  const [costInput,   setCostInput]     = useState('')

  const { data, isLoading, isError, isFetching, refetch } = useQuery<PortfolioPerformance>({
    queryKey: ['portfolio', 'performance'],
    queryFn: fetchPortfolioPerformance,
    staleTime: 15_000,
  })
  usePolling(refetch, 15_000)

  const addMutation = useMutation({
    mutationFn: (vars: { ticker: string; shares: number; avg_cost: number }) =>
      addPosition(vars.ticker, vars.shares, vars.avg_cost),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      setTickerInput('')
      setSharesInput('')
      setCostInput('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (vars: { id: number }) => deletePosition(vars.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    },
  })

  const handleAdd = () => {
    const ticker   = tickerInput.trim().toUpperCase()
    const shares   = parseFloat(sharesInput)
    const avg_cost = parseFloat(costInput)
    if (!ticker || isNaN(shares) || shares <= 0 || isNaN(avg_cost) || avg_cost <= 0) return
    addMutation.mutate({ ticker, shares, avg_cost })
  }

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd()
  }

  const holdings     = data?.holdings     ?? []
  const totalCost    = data?.total_cost   ?? 0
  const totalValue   = data?.total_value  ?? 0
  const totalPnl     = data?.total_pnl    ?? 0
  const totalPnlPct  = data?.total_pnl_pct ?? 0

  const canAdd = (() => {
    const t = tickerInput.trim()
    const s = parseFloat(sharesInput)
    const c = parseFloat(costInput)
    return t.length > 0 && !isNaN(s) && s > 0 && !isNaN(c) && c > 0
  })()

  return (
    <Panel
      title="PORT \u2014 PORTFOLIO MONITOR"
      actions={
        <span className="bb-label" style={{ fontSize: '10px' }}>
          {isFetching && !isLoading ? 'REFRESHING...' : `${holdings.length} POSITIONS`}
        </span>
      }
    >
      <LoadingBar loading={isLoading || isFetching} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          borderBottom: `1px solid ${color.borderSubtle}`,
          background: 'rgba(19, 22, 25, 0.6)',
          flexWrap: 'wrap',
        }}
      >
        <span className="bb-label" style={{ whiteSpace: 'nowrap' }}>TICKER:</span>
        <input
          className="bb-input"
          style={{ width: '80px', fontSize: '13px' }}
          value={tickerInput}
          onChange={e => setTickerInput(e.target.value.toUpperCase())}
          onKeyDown={handleFormKeyDown}
          placeholder="AAPL"
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
        />

        <span className="bb-label" style={{ whiteSpace: 'nowrap' }}>SHARES:</span>
        <input
          className="bb-input"
          style={{ width: '80px', fontSize: '13px' }}
          value={sharesInput}
          onChange={e => setSharesInput(e.target.value)}
          onKeyDown={handleFormKeyDown}
          placeholder="100"
          type="number"
          min="0"
          step="any"
        />

        <span className="bb-label" style={{ whiteSpace: 'nowrap' }}>AVG COST:</span>
        <input
          className="bb-input"
          style={{ width: '90px', fontSize: '13px' }}
          value={costInput}
          onChange={e => setCostInput(e.target.value)}
          onKeyDown={handleFormKeyDown}
          placeholder="150.00"
          type="number"
          min="0"
          step="any"
        />

        <button
          className={addMutation.isPending ? 'bb-btn bb-btn-active' : 'bb-btn'}
          onClick={handleAdd}
          disabled={addMutation.isPending || !canAdd}
        >
          {addMutation.isPending ? 'ADDING...' : '[ADD POSITION]'}
        </button>

        {addMutation.isError && (
          <span className="bb-loss" style={{ fontSize: '11px' }}>
            {(addMutation.error as Error)?.message ?? 'ERROR'}
          </span>
        )}
      </div>

      {(data || (!isLoading && !isError)) && (
        <div
          style={{
            display: 'flex',
            gap: '24px',
            padding: '5px 10px',
            borderBottom: `1px solid ${color.borderSubtle}`,
            background: 'rgba(19, 22, 25, 0.6)',
            flexWrap: 'wrap',
            fontSize: '12px',
          }}
        >
          <span>
            <span className="bb-label">TOTAL VALUE: </span>
            <span className="bb-value">{formatMoney(totalValue)}</span>
          </span>
          <span>
            <span className="bb-label">TOTAL COST: </span>
            <span className="bb-value">{formatMoney(totalCost)}</span>
          </span>
          <span>
            <span className="bb-label">P&amp;L: </span>
            <span>
              <TickerBadge value={totalPnl} decimals={2} prefix="$" />
              {' '}
              <span style={{ color: color.textTertiary }}>(</span>
              <TickerBadge value={totalPnlPct} pct decimals={2} />
              <span style={{ color: color.textTertiary }}>)</span>
            </span>
          </span>
        </div>
      )}

      {isError ? (
        <div style={{ padding: '24px', textAlign: 'center', color: color.accentNegative }}>
          PORTFOLIO UNAVAILABLE {'\u2014'} BACKEND ERROR
        </div>
      ) : isLoading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: color.textTertiary }}>
          LOADING PORTFOLIO...
        </div>
      ) : holdings.length === 0 ? (
        <div
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            color: color.textTertiary,
            fontSize: '12px',
          }}
        >
          PORTFOLIO EMPTY {'\u2014'} Add a position above
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="bb-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', width: '70px' }}>TICKER</th>
                  <th>SHARES</th>
                  <th>AVG COST</th>
                  <th>CURRENT</th>
                  <th>MKT VALUE</th>
                  <th>P&amp;L</th>
                  <th>P&amp;L%</th>
                  <th style={{ textAlign: 'center', width: '24px' }}></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((row: PortfolioRow) => (
                  <tr key={row.id}>
                    <td
                      style={{ color: color.ticker, cursor: 'pointer', fontWeight: 600, fontFamily: font.mono }}
                      onClick={() => onNavigate(`${row.ticker} EQUITY`)}
                    >
                      {row.ticker}
                    </td>

                    <td style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      {row.shares.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>

                    <td style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      {row.avg_cost.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>

                    <td style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      {row.current_price !== null
                        ? row.current_price.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : '\u2014'}
                    </td>

                    <td style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      {formatLarge(row.market_value)}
                    </td>

                    <td>
                      <TickerBadge value={row.pnl} decimals={2} prefix="$" />
                    </td>

                    <td>
                      <TickerBadge value={row.pnl_pct} pct decimals={2} />
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="bb-btn"
                        style={{
                          fontSize: '11px',
                          padding: '1px 5px',
                          color: color.accentNegative,
                          borderColor: color.accentNegativeDim,
                        }}
                        title={`Remove ${row.ticker}`}
                        onClick={e => {
                          e.stopPropagation()
                          deleteMutation.mutate({ id: row.id })
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        {'\u00D7'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AllocationBar holdings={holdings} totalValue={totalValue} />
        </>
      )}
    </Panel>
  )
}

export default PortfolioScreen