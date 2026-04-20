import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFXRates } from '../../lib/api'
import { usePolling } from '../../hooks/usePolling'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'
const { color, font } = theme

interface Props {
  onNavigate: (cmd: string) => void
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'] as const
type Currency = typeof CURRENCIES[number]

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
        fontFamily: font.mono,
        borderBottom: '1px solid ' + color.borderSubtle,
        borderRight: '1px solid ' + color.borderSubtle,
        background: isDiag ? color.bgElevated : flashBg,
        color: isDiag ? color.textTertiary : value === null ? color.textTertiary : color.textPrimary,
        transition: flashDir ? 'none' : 'background 0.4s ease',
        minWidth: '80px',
        whiteSpace: 'nowrap',
      }}
    >
      {isDiag ? '—' : value === null ? '—' : formatRate(value, quote)}
    </td>
  )
}

const FLASH_MS = 600

const FXCScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: fetchFXRates,
    staleTime: 0,
  })

  usePolling(refetch, 1_000)

  const [flashDirs, setFlashDirs] = useState<Record<string, FlashDir>>({})
  const prevCcyUsd = useRef<Record<Currency, number | null> | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ccyUsd = useMemo(() => data ? buildCcyUsdMap(data.rates) : ({} as Record<Currency, number | null>), [data])

  useEffect(() => {
    if (!data) return

    const newCcyUsd = ccyUsd

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
  }, [data?.fetched_at, ccyUsd])

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      <div
        className="bb-header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, padding: '6px 12px' }}
      >
        <span>FXC CROSS CURRENCY MATRIX</span>
        <span style={{ color: color.accentPositive, fontSize: '11px', letterSpacing: '0.05em' }}>
          ● LIVE
        </span>
      </div>

      {error && !isLoading && (
        <div style={{ padding: '8px 12px', color: color.accentNegative, fontSize: '12px', borderBottom: `1px solid ${color.borderSubtle}`, flexShrink: 0 }}>
          ERR: {(error as Error).message ?? 'Failed to load FX rates'}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '12px', fontFamily: font.mono }}>
          <thead>
            <tr>
              <th
                style={{
                  padding: '6px 10px',
                  color: color.textTertiary,
                  fontFamily: font.sans,
                  fontSize: '10px',
                  fontWeight: 500,
                  textAlign: 'left',
                  borderBottom: `1px solid ${color.borderSubtle}`,
                  borderRight: `1px solid ${color.borderSubtle}`,
                  background: 'transparent',
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
                    color: color.ticker,
                    fontFamily: font.mono,
                    fontSize: '12px',
                    fontWeight: 600,
                    textAlign: 'center',
                    borderBottom: `1px solid ${color.borderSubtle}`,
                    borderRight: '1px solid ' + color.borderSubtle,
                    background: 'rgba(19, 22, 25, 0.6)',
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
                    color: color.ticker,
                    fontFamily: font.mono,
                    fontSize: '12px',
                    fontWeight: 600,
                    borderBottom: '1px solid ' + color.borderSubtle,
                    borderRight: `1px solid ${color.borderSubtle}`,
                    background: 'rgba(19, 22, 25, 0.6)',
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