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

// Map each currency to its yfinance pair and inversion flag.
// yfinance returns:
//   EURUSD=X, GBPUSD=X, AUDUSD=X, NZDUSD=X → direct CCY/USD rates
//   USDJPY=X, USDCHF=X, USDCAD=X → USD per 1 CCY (must invert to get CCY/USD)
// Cross rate: BASE/QUOTE = (BASE→USD) / (QUOTE→USD)
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
    if (ccy === 'USD') { map[ccy] = 1.0; continue }
    const [pair, invert] = CCY_TO_USD_PAIR[ccy]
    const raw = rates[pair] ?? null
    map[ccy] = (raw === null || raw === 0) ? null : (invert ? 1 / raw : raw)
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

type FlashDir = 'up' | 'down' | null

interface CellProps {
  base: Currency
  quote: Currency
  value: number | null
  flashDir: FlashDir
}

const Cell: React.FC<CellProps> = ({ base, quote, value, flashDir }) => {
  const isDiag = base === quote
  let flashBg = 'transparent'
  if (!isDiag && flashDir === 'up')   flashBg = 'rgba(0,255,65,0.22)'
  if (!isDiag && flashDir === 'down') flashBg = 'rgba(255,51,51,0.22)'

  return (
    <td
      style={{
        padding: '6px 10px',
        textAlign: 'right',
        fontSize: '12px',
        fontFamily: 'monospace',
        borderBottom: '1px solid #1a1a1a',
        borderRight: '1px solid #1a1a1a',
        background: isDiag ? '#0d0d00' : flashBg,
        color: isDiag ? '#2a2a2a' : value === null ? '#2a2a2a' : '#e0e0e0',
        transition: flashDir ? 'none' : 'background 0.4s ease',
        minWidth: '80px',
        whiteSpace: 'nowrap',
      }}
    >
      {isDiag ? '—' : value === null ? '—' : formatRate(value, quote)}
    </td>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const FLASH_MS = 600

const FXCScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: fetchFXRates,
    staleTime: 0,
  })

  usePolling(refetch, 1_000)

  // Per-cell flash directions, keyed by "BASE-QUOTE"
  const [flashDirs, setFlashDirs] = useState<Record<string, FlashDir>>({})
  const prevCcyUsd = useRef<Record<Currency, number | null> | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!data) return

    const newCcyUsd = buildCcyUsdMap(data.rates)

    if (prevCcyUsd.current) {
      const dirs: Record<string, FlashDir> = {}
      for (const base of CURRENCIES) {
        for (const quote of CURRENCIES) {
          if (base === quote) continue
          const prev = crossRate(base, quote, prevCcyUsd.current)
          const next = crossRate(base, quote, newCcyUsd)
          if (prev !== null && next !== null) {
            if (next > prev)      dirs[`${base}-${quote}`] = 'up'
            else if (next < prev) dirs[`${base}-${quote}`] = 'down'
          }
        }
      }

      if (Object.keys(dirs).length > 0) {
        if (flashTimer.current) clearTimeout(flashTimer.current)
        setFlashDirs(dirs)
        flashTimer.current = setTimeout(() => setFlashDirs({}), FLASH_MS)
      }
    }

    prevCcyUsd.current = newCcyUsd
  }, [data?.fetched_at])

  // Cleanup on unmount
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

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
        <span style={{ color: '#00ff41', fontSize: '11px', letterSpacing: '0.05em' }}>
          ● LIVE
        </span>
      </div>

      {error && !isLoading && (
        <div style={{ padding: '8px 12px', color: '#ff3333', fontSize: '12px', borderBottom: '1px solid #2a2a2a', flexShrink: 0 }}>
          ERR: {(error as Error).message ?? 'Failed to load FX rates'}
        </div>
      )}

      {/* Matrix */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'monospace' }}>
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
                    flashDir={flashDirs[`${base}-${quote}`] ?? null}
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
