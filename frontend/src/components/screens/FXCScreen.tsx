import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFXRates } from '../../lib/api'
import { usePolling } from '../../hooks/usePolling'
import LoadingBar from '../shared/LoadingBar'

interface Props {
  onNavigate: (cmd: string) => void
}

// ─── Currency order and labels ────────────────────────────────────────────────
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'] as const
type Currency = typeof CURRENCIES[number]

// Map each currency to its yfinance pair and whether to invert (CCY→USD = 1/rate)
const CCY_TO_USD_PAIR: Record<Currency, [string, boolean]> = {
  USD: ['', false],
  EUR: ['EURUSD=X', false],
  GBP: ['GBPUSD=X', false],
  JPY: ['USDJPY=X', true],
  CHF: ['USDCHF=X', true],
  AUD: ['AUDUSD=X', false],
  CAD: ['USDCAD=X', true],
  NZD: ['NZDUSD=X', false],
}

function buildCcyUsdMap(rates: Record<string, number | null>): Record<Currency, number | null> {
  const map = {} as Record<Currency, number | null>
  for (const ccy of CURRENCIES) {
    if (ccy === 'USD') {
      map[ccy] = 1.0
      continue
    }
    const [pair, invert] = CCY_TO_USD_PAIR[ccy]
    const raw = rates[pair] ?? null
    if (raw === null || raw === 0) {
      map[ccy] = null
    } else {
      map[ccy] = invert ? 1 / raw : raw
    }
  }
  return map
}

function crossRate(base: Currency, quote: Currency, ccyUsd: Record<Currency, number | null>): number | null {
  if (base === quote) return null
  const b = ccyUsd[base]
  const q = ccyUsd[quote]
  if (b === null || q === null || q === 0) return null
  return b / q
}

function formatRate(val: number, quote: Currency): string {
  const decimals = quote === 'JPY' ? 2 : 4
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// ─── Cell ─────────────────────────────────────────────────────────────────────

interface CellProps {
  base: Currency
  quote: Currency
  value: number | null
  flashing: boolean
}

const Cell: React.FC<CellProps> = ({ base, quote, value, flashing }) => {
  const isDiag = base === quote
  return (
    <td
      style={{
        padding: '6px 10px',
        textAlign: 'right',
        fontSize: '12px',
        fontFamily: 'monospace',
        borderBottom: '1px solid #1a1a1a',
        borderRight: '1px solid #1a1a1a',
        background: isDiag
          ? '#0d0d00'
          : flashing
          ? 'rgba(255,153,0,0.18)'
          : 'transparent',
        color: isDiag ? '#2a2a2a' : value === null ? '#2a2a2a' : '#e0e0e0',
        transition: flashing ? 'none' : 'background 0.6s ease',
        minWidth: '80px',
        whiteSpace: 'nowrap',
      }}
    >
      {isDiag ? '—' : value === null ? '—' : formatRate(value, quote)}
    </td>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const FXCScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: fetchFXRates,
    staleTime: 15_000,
  })

  usePolling(refetch, 15_000)

  // Flash all data cells on each new fetch
  const prevFetchedAt = useRef<number>(0)
  const [isFlashing, setIsFlashing] = useState(false)

  useEffect(() => {
    if (data && data.fetched_at !== prevFetchedAt.current) {
      prevFetchedAt.current = data.fetched_at
      setIsFlashing(true)
      const t = setTimeout(() => setIsFlashing(false), 800)
      return () => clearTimeout(t)
    }
  }, [data?.fetched_at])

  // "N seconds ago" footer counter
  const [secsAgo, setSecsAgo] = useState(0)
  useEffect(() => {
    if (!data) return
    setSecsAgo(0)
    const id = setInterval(() => setSecsAgo(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [data?.fetched_at])

  const ccyUsd = data ? buildCcyUsdMap(data.rates) : ({} as Record<Currency, number | null>)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000', overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      {/* Header */}
      <div
        className="bb-header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, padding: '6px 12px' }}
      >
        <span>FXC CROSS CURRENCY MATRIX</span>
        <span style={{ color: '#554400', fontSize: '11px' }}>
          LIVE · 15S REFRESH
          {data?.fetched_at && (
            <span style={{ marginLeft: '12px', color: '#2a2a2a' }}>
              REFRESHED {secsAgo}s AGO
            </span>
          )}
        </span>
      </div>

      {error && !isLoading && (
        <div style={{ padding: '8px 12px', color: '#ff3333', fontSize: '12px', borderBottom: '1px solid #2a2a2a', flexShrink: 0 }}>
          ERR: {(error as Error).message ?? 'Failed to load FX rates'}
        </div>
      )}

      {/* Matrix */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: '6px 10px',
                  color: '#554400',
                  fontSize: '10px',
                  letterSpacing: '0.06em',
                  textAlign: 'left',
                  borderBottom: '1px solid #2a2a2a',
                  borderRight: '1px solid #2a2a2a',
                  background: '#000',
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                }}
              >
                BASE↓ / QUOTE→
              </th>
              {CURRENCIES.map(ccy => (
                <th
                  key={ccy}
                  style={{
                    padding: '6px 10px',
                    color: '#ff9900',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textAlign: 'center',
                    borderBottom: '1px solid #2a2a2a',
                    borderRight: '1px solid #1a1a1a',
                    background: '#0d0d00',
                    minWidth: '80px',
                  }}
                >
                  {ccy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CURRENCIES.map(base => (
              <tr key={base}>
                <td
                  style={{
                    padding: '6px 10px',
                    color: '#ff9900',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    borderBottom: '1px solid #1a1a1a',
                    borderRight: '1px solid #2a2a2a',
                    background: '#0d0d00',
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {base}
                </td>
                {CURRENCIES.map(quote => (
                  <Cell
                    key={quote}
                    base={base}
                    quote={quote}
                    value={data ? crossRate(base, quote, ccyUsd) : null}
                    flashing={isFlashing && base !== quote}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default FXCScreen
