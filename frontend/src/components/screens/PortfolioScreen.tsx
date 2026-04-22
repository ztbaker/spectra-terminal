import Panel from '../Terminal/Panel'
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPortfolioPerformance,
  addPosition,
  deletePosition,
  robinhoodSavePositions,
} from '../../lib/api'
import {
  rhLogin,
  rhSubmitChallenge,
  rhFetchHoldings,
  rhFetchHistory,
  rhLogout,
  type RhEquityPoint,
} from '../../lib/robinhoodClient'
import { usePolling } from '../../hooks/usePolling'
import type { PortfolioPerformance, PortfolioRow } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import TickerBadge from '../shared/TickerBadge'
import theme from '../../lib/theme'
import {
  createChart,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'

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

// ─── Allocation Bar ──────────────────────────────────────────────────────────

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
            style={{ width: `${seg.pct}%`, background: seg.color, minWidth: '1px' }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', width: '100%', marginTop: '3px' }}>
        {segments.map(seg => (
          <div
            key={seg.ticker}
            style={{ width: `${seg.pct}%`, minWidth: '1px', overflow: 'hidden', textAlign: 'center' }}
          >
            {seg.pct > 4 ? (
              <span style={{ color: seg.color, fontSize: '10px', whiteSpace: 'nowrap' }}>{seg.ticker}</span>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
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

// ─── Equity Chart ────────────────────────────────────────────────────────────

const SPAN_OPTIONS = [
  { label: '1D', value: 'day' },
  { label: '1W', value: 'week' },
  { label: '1M', value: 'month' },
  { label: '3M', value: '3month' },
  { label: '1Y', value: 'year' },
  { label: '5Y', value: '5year' },
  { label: 'ALL', value: 'all' },
]

interface EquityChartProps {
  points: RhEquityPoint[]
  height?: number
}

const EquityChart: React.FC<EquityChartProps> = ({ points, height = 200 }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const validPoints = useMemo(() => points.filter(p => p.equity > 0), [points])

  useEffect(() => {
    if (!containerRef.current || validPoints.length < 2) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: color.bgElevated },
        textColor: color.textTertiary,
        fontFamily: font.mono,
        fontSize: 10,
      },
      grid: {
        vertLines: { color: color.borderSubtle },
        horzLines: { color: color.borderSubtle },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: color.borderMedium },
      timeScale: { borderColor: color.borderMedium, timeVisible: false },
    })

    const firstEq = validPoints[0].equity
    const lastEq = validPoints[validPoints.length - 1].equity
    const lineColor = lastEq >= firstEq ? color.accentPositive : color.accentNegative

    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })

    series.setData(validPoints.map(p => ({
      time: p.date as unknown as UTCTimestamp,
      value: p.equity,
    })))

    chart.timeScale().fitContent()
    chartRef.current = chart

    const onResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
    }
  }, [validPoints, height])

  if (validPoints.length < 2) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: color.textTertiary, fontSize: '11px' }}>
        NOT ENOUGH DATA FOR CHART
      </div>
    )
  }

  const firstEq = validPoints[0].equity
  const lastEq = validPoints[validPoints.length - 1].equity
  const change = lastEq - firstEq
  const changePct = (change / firstEq) * 100

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px' }}>
        <div style={{ fontSize: '11px' }}>
          <span className="bb-label">EQUITY: </span>
          <span style={{ color: color.textPrimary, fontWeight: 600 }}>{formatMoney(lastEq)}</span>
          {' '}
          <TickerBadge value={change} decimals={2} prefix="$" />
          {' '}
          <span style={{ color: color.textTertiary }}>(</span>
          <TickerBadge value={changePct} pct decimals={2} />
          <span style={{ color: color.textTertiary }}>)</span>
        </div>
      </div>
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  )
}

// ─── Robinhood Login Modal ───────────────────────────────────────────────────

interface RhLoginProps {
  onClose: () => void
  onSuccess: () => void
}

const RobinhoodLoginModal: React.FC<RhLoginProps> = ({ onClose, onSuccess }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'credentials' | 'mfa' | 'challenge'>('credentials')
  const [challengeType, setChallengeType] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    setStatusMsg(step === 'credentials' ? 'Authenticating...' : 'Verifying...')

    try {
      const mfa = step === 'mfa' ? code : undefined
      const result = await rhLogin(email, password, mfa)

      if (result.status === 'ok') {
        onSuccess()
      } else if (result.status === 'mfa_required') {
        setStep('mfa')
        setCode('')
        setStatusMsg('')
        setError(result.message || 'Enter your authenticator code')
      } else if (result.status === 'challenge') {
        setStep('challenge')
        setChallengeType(result.challenge_type || 'code')
        setCode('')
        setStatusMsg('')
        setError(result.message || 'Enter verification code')
      } else {
        setError(result.message || 'Login failed')
        setStatusMsg('')
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed')
      setStatusMsg('')
    } finally {
      setBusy(false)
    }
  }

  const handleChallenge = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    setStatusMsg('Verifying code...')

    try {
      const result = await rhSubmitChallenge(code)
      if (result.status === 'ok') {
        onSuccess()
      } else {
        setError(result.message || 'Verification failed')
        setStatusMsg('')
      }
    } catch (err: any) {
      setError(err?.message || 'Verification failed')
      setStatusMsg('')
    } finally {
      setBusy(false)
    }
  }

  const isChallenge = step === 'challenge'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: color.bgElevated, border: `1px solid ${color.borderMedium}`,
          padding: '20px', width: '360px', maxWidth: '90vw',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '13px', fontWeight: 600, color: color.textPrimary, marginBottom: '16px' }}>
          ROBINHOOD LOGIN
        </div>
        <div style={{ fontSize: '10px', color: color.textTertiary, marginBottom: '12px' }}>
          Credentials are sent directly to Robinhood from your device and are not stored.
        </div>

        <form onSubmit={isChallenge ? handleChallenge : handleLogin}>
          {!isChallenge && (
            <>
              <div style={{ marginBottom: '10px' }}>
                <label className="bb-label" style={{ display: 'block', marginBottom: '3px', fontSize: '10px' }}>EMAIL</label>
                <input className="bb-input" style={{ width: '100%', fontSize: '13px' }} type="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email" disabled={step === 'mfa'} required />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label className="bb-label" style={{ display: 'block', marginBottom: '3px', fontSize: '10px' }}>PASSWORD</label>
                <input className="bb-input" style={{ width: '100%', fontSize: '13px' }} type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Password" autoComplete="current-password" disabled={step === 'mfa'} required />
              </div>
            </>
          )}

          {(step === 'mfa' || isChallenge) && (
            <div style={{ marginBottom: '10px' }}>
              <label className="bb-label" style={{ display: 'block', marginBottom: '3px', fontSize: '10px' }}>
                {isChallenge ? `${challengeType.toUpperCase()} VERIFICATION CODE` : '2FA CODE'}
              </label>
              <input className="bb-input" style={{ width: '100%', fontSize: '13px' }} type="text"
                value={code} onChange={e => setCode(e.target.value)}
                placeholder="123456" maxLength={8} autoFocus required />
            </div>
          )}

          {statusMsg && (
            <div style={{ fontSize: '11px', color: color.accentInfo, marginBottom: '8px' }}>{statusMsg}</div>
          )}
          {error && (
            <div style={{ fontSize: '11px', color: color.accentNegative, marginBottom: '8px' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className={busy ? 'bb-btn bb-btn-active' : 'bb-btn'} type="submit"
              disabled={busy || (!isChallenge && (!email || !password)) || ((step === 'mfa' || isChallenge) && !code)}>
              {busy ? 'CONNECTING...' : (step === 'mfa' || isChallenge) ? '[VERIFY]' : '[CONNECT]'}
            </button>
            <button className="bb-btn" type="button" onClick={onClose}>[CANCEL]</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Portfolio Screen ───────────────────────────────────────────────────

interface Props {
  onNavigate: (cmd: string) => void
}

const PortfolioScreen: React.FC<Props> = ({ onNavigate }) => {
  const queryClient = useQueryClient()

  const [tickerInput, setTickerInput] = useState('')
  const [sharesInput, setSharesInput] = useState('')
  const [costInput, setCostInput] = useState('')
  const [showRhLogin, setShowRhLogin] = useState(false)
  const [historySpan, setHistorySpan] = useState('year')
  const [rhConnected, setRhConnected] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Portfolio data (from backend DB)
  const { data, isLoading, isError, isFetching, refetch } = useQuery<PortfolioPerformance>({
    queryKey: ['portfolio', 'performance'],
    queryFn: fetchPortfolioPerformance,
    staleTime: 15_000,
  })
  usePolling(refetch, 15_000)

  // Robinhood equity history (client-side)
  const rhHistoryQuery = useQuery({
    queryKey: ['rh-history', historySpan],
    queryFn: () => rhFetchHistory(historySpan),
    staleTime: 60_000,
    enabled: rhConnected,
    retry: false,
  })

  // Mutations
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
  })

  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const holdings = await rhFetchHoldings()
      // Save to backend DB
      await robinhoodSavePositions(
        holdings.map(h => ({ ticker: h.ticker, shares: h.shares, avg_cost: h.avg_cost })),
      )
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      setSyncMsg({ type: 'ok', text: `${holdings.length} positions synced` })
    } catch (e: any) {
      setSyncMsg({ type: 'err', text: e?.message || 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  const handleAdd = () => {
    const ticker = tickerInput.trim().toUpperCase()
    const shares = parseFloat(sharesInput)
    const avg_cost = parseFloat(costInput)
    if (!ticker || isNaN(shares) || shares <= 0 || isNaN(avg_cost) || avg_cost <= 0) return
    addMutation.mutate({ ticker, shares, avg_cost })
  }

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd()
  }

  const handleRhLoginSuccess = () => {
    setShowRhLogin(false)
    setRhConnected(true)
    handleSync()
  }

  const handleDisconnect = () => {
    rhLogout()
    setRhConnected(false)
    setSyncMsg(null)
  }

  const holdings = data?.holdings ?? []
  const totalCost = data?.total_cost ?? 0
  const totalValue = data?.total_value ?? 0
  const totalPnl = data?.total_pnl ?? 0
  const totalPnlPct = data?.total_pnl_pct ?? 0

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
      <LoadingBar loading={isLoading || isFetching || syncing} />

      {/* ─── Robinhood Controls ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
          borderBottom: `1px solid ${color.borderSubtle}`, background: 'rgba(19, 22, 25, 0.6)',
          flexWrap: 'wrap',
        }}
      >
        <span className="bb-label" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>ROBINHOOD:</span>

        {rhConnected ? (
          <>
            <span style={{ fontSize: '10px', color: color.accentPositive }}>CONNECTED</span>
            <button className={syncing ? 'bb-btn bb-btn-active' : 'bb-btn'}
              style={{ fontSize: '11px', padding: '2px 8px' }}
              onClick={handleSync} disabled={syncing}>
              {syncing ? 'SYNCING...' : '[SYNC HOLDINGS]'}
            </button>
            <button className="bb-btn" style={{ fontSize: '11px', padding: '2px 8px' }}
              onClick={handleDisconnect}>
              [DISCONNECT]
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: '10px', color: color.textTertiary }}>NOT CONNECTED</span>
            <button className="bb-btn" style={{ fontSize: '11px', padding: '2px 8px' }}
              onClick={() => setShowRhLogin(true)}>
              [CONNECT ROBINHOOD]
            </button>
          </>
        )}

        {syncMsg && (
          <span style={{ fontSize: '10px', color: syncMsg.type === 'ok' ? color.accentPositive : color.accentNegative }}>
            {syncMsg.text}
          </span>
        )}
      </div>

      {/* ─── Equity Chart ───────────────────────────────────────────────── */}
      {rhConnected && (
        <div style={{ borderBottom: `1px solid ${color.borderSubtle}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px 2px' }}>
            <span className="bb-label" style={{ fontSize: '10px', marginRight: '6px' }}>PORTFOLIO EQUITY</span>
            {SPAN_OPTIONS.map(opt => (
              <button key={opt.value}
                className={historySpan === opt.value ? 'bb-btn bb-btn-active' : 'bb-btn'}
                style={{ fontSize: '10px', padding: '1px 6px', minWidth: '28px' }}
                onClick={() => setHistorySpan(opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>

          {rhHistoryQuery.isLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: color.textTertiary, fontSize: '11px' }}>
              LOADING HISTORY...
            </div>
          ) : rhHistoryQuery.isError ? (
            <div style={{ padding: '12px', textAlign: 'center', color: color.accentNegative, fontSize: '11px' }}>
              HISTORY UNAVAILABLE {'\u2014'} {(rhHistoryQuery.error as Error)?.message ?? 'ERROR'}
            </div>
          ) : rhHistoryQuery.data ? (
            <EquityChart points={rhHistoryQuery.data.points} />
          ) : null}
        </div>
      )}

      {/* ─── Add Position Form ──────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px',
          borderBottom: `1px solid ${color.borderSubtle}`, background: 'rgba(19, 22, 25, 0.6)',
          flexWrap: 'wrap',
        }}
      >
        <span className="bb-label" style={{ whiteSpace: 'nowrap' }}>TICKER:</span>
        <input className="bb-input" style={{ width: '80px', fontSize: '13px' }}
          value={tickerInput} onChange={e => setTickerInput(e.target.value.toUpperCase())}
          onKeyDown={handleFormKeyDown} placeholder="AAPL" maxLength={12}
          autoComplete="off" spellCheck={false} />

        <span className="bb-label" style={{ whiteSpace: 'nowrap' }}>SHARES:</span>
        <input className="bb-input" style={{ width: '80px', fontSize: '13px' }}
          value={sharesInput} onChange={e => setSharesInput(e.target.value)}
          onKeyDown={handleFormKeyDown} placeholder="100" type="number" min="0" step="any" />

        <span className="bb-label" style={{ whiteSpace: 'nowrap' }}>AVG COST:</span>
        <input className="bb-input" style={{ width: '90px', fontSize: '13px' }}
          value={costInput} onChange={e => setCostInput(e.target.value)}
          onKeyDown={handleFormKeyDown} placeholder="150.00" type="number" min="0" step="any" />

        <button className={addMutation.isPending ? 'bb-btn bb-btn-active' : 'bb-btn'}
          onClick={handleAdd} disabled={addMutation.isPending || !canAdd}>
          {addMutation.isPending ? 'ADDING...' : '[ADD POSITION]'}
        </button>

        {addMutation.isError && (
          <span className="bb-loss" style={{ fontSize: '11px' }}>
            {(addMutation.error as Error)?.message ?? 'ERROR'}
          </span>
        )}
      </div>

      {/* ─── Summary Bar ────────────────────────────────────────────────── */}
      {(data || (!isLoading && !isError)) && (
        <div
          style={{
            display: 'flex', gap: '24px', padding: '5px 10px',
            borderBottom: `1px solid ${color.borderSubtle}`, background: 'rgba(19, 22, 25, 0.6)',
            flexWrap: 'wrap', fontSize: '12px',
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

      {/* ─── Holdings Table ─────────────────────────────────────────────── */}
      {isError ? (
        <div style={{ padding: '24px', textAlign: 'center', color: color.accentNegative }}>
          PORTFOLIO UNAVAILABLE {'\u2014'} BACKEND ERROR
        </div>
      ) : isLoading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: color.textTertiary }}>
          LOADING PORTFOLIO...
        </div>
      ) : holdings.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: color.textTertiary, fontSize: '12px' }}>
          PORTFOLIO EMPTY {'\u2014'} Add a position above or connect Robinhood to sync
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
                    <td style={{ color: color.ticker, cursor: 'pointer', fontWeight: 600, fontFamily: font.mono }}
                      onClick={() => onNavigate(`${row.ticker} EQUITY`)}>
                      {row.ticker}
                    </td>
                    <td style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      {row.shares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      {row.avg_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      {row.current_price !== null
                        ? row.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '\u2014'}
                    </td>
                    <td style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      {formatLarge(row.market_value)}
                    </td>
                    <td><TickerBadge value={row.pnl} decimals={2} prefix="$" /></td>
                    <td><TickerBadge value={row.pnl_pct} pct decimals={2} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="bb-btn"
                        style={{ fontSize: '11px', padding: '1px 5px', color: color.accentNegative, borderColor: color.accentNegativeDim }}
                        title={`Remove ${row.ticker}`}
                        onClick={e => { e.stopPropagation(); deleteMutation.mutate({ id: row.id }) }}
                        disabled={deleteMutation.isPending}>
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

      {showRhLogin && (
        <RobinhoodLoginModal onClose={() => setShowRhLogin(false)} onSuccess={handleRhLoginSuccess} />
      )}
    </Panel>
  )
}

export default PortfolioScreen
