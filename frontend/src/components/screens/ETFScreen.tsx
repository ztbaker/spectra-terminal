import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

interface Props { ticker: string; onNavigate: (cmd: string) => void }

export default function ETFScreen({ ticker, onNavigate }: Props) {
  const sym = ticker.toUpperCase().replace('-USD', '').replace('=X', '')

  const { data: info, isLoading: infoLoading } = useQuery({
    queryKey: ['etf-info', sym],
    queryFn: () => fetch(`${API}/etf/${sym}/info`).then(r => r.json()),
  })

  const { data: holdings } = useQuery({
    queryKey: ['etf-holdings', sym],
    queryFn: () => fetch(`${API}/etf/${sym}/holdings`).then(r => r.json()),
  })

  const { data: sectors } = useQuery({
    queryKey: ['etf-sectors', sym],
    queryFn: () => fetch(`${API}/etf/${sym}/sectors`).then(r => r.json()),
  })

  const { data: performance } = useQuery({
    queryKey: ['etf-perf', sym],
    queryFn: () => fetch(`${API}/etf/${sym}/performance`).then(r => r.json()),
  })

  if (infoLoading) return <div style={{ color: C.amber, padding: 24 }}>Loading {sym}...</div>

  return (
    <div style={{ padding: '16px 24px', color: C.amber }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{sym}</span>
          <span style={{ color: C.amberDim, marginLeft: 8 }}>
            {info?.name || 'ETF'}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.white }}>
            {info?.price != null ? `$${info.price.toFixed(2)}` : '—'}
          </div>
          <div style={{ fontSize: 12, color: (info?.change_pct ?? 0) >= 0 ? C.green : C.red }}>
            {info?.change != null ? `${info.change >= 0 ? '+' : ''}${info.change.toFixed(2)}` : '—'}
            {info?.change_pct != null ? ` (${info.change_pct >= 0 ? '+' : ''}${info.change_pct.toFixed(2)}%)` : ''}
          </div>
        </div>
      </div>

      {/* Info tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          ['Expense Ratio', info?.expense_ratio != null ? `${(info.expense_ratio * 100).toFixed(2)}%` : '—'],
          ['AUM', info?.aum != null ? `$${(info.aum / 1e9).toFixed(1)}B` : '—'],
          ['Category', info?.category || '—'],
          ['Benchmark', info?.benchmark || '—'],
        ].map(([label, value]) => (
          <div key={String(label)} style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: 8 }}>
            <div style={{ color: C.amberMute, fontSize: 10 }}>{label}</div>
            <div style={{ color: C.white, fontSize: 13 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Performance */}
      {performance && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: C.yellow, fontSize: 12, marginBottom: 4, fontWeight: 700 }}>PERFORMANCE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {[
              ['1D', performance.perf_1d], ['1W', performance.perf_1w], ['1M', performance.perf_1m],
              ['YTD', performance.perf_ytd], ['1Y', performance.perf_1y], ['3Y', performance.perf_3y],
              ['5Y', performance.perf_5y],
            ].map(([l, v]) => (
              <div key={String(l)} style={{ background: C.bgPanel, padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ color: C.amberMute, fontSize: 9 }}>{l}</div>
                <div style={{ color: v != null ? (v >= 0 ? C.green : C.red) : C.amberDim, fontSize: 11 }}>
                  {v != null ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Holdings */}
      {holdings && holdings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: C.yellow, fontSize: 12, marginBottom: 4, fontWeight: 700 }}>TOP HOLDINGS</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ color: C.amberDim, textAlign: 'left', padding: '4px 8px' }}>Symbol</th>
                <th style={{ color: C.amberDim, textAlign: 'left', padding: 4 }}>Name</th>
                <th style={{ color: C.amberDim, textAlign: 'right', padding: 4 }}>Weight</th>
                <th style={{ color: C.amberDim, textAlign: 'left', padding: 4 }}>Sector</th>
              </tr>
            </thead>
            <tbody>
              {holdings.slice(0, 15).map((h: any) => (
                <tr key={h.symbol} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ color: C.blue, padding: '4px 8px', cursor: 'pointer' }} onClick={() => onNavigate(`${h.symbol}`)}>{h.symbol}</td>
                  <td style={{ color: C.white, padding: 4 }}>{h.name || '—'}</td>
                  <td style={{ color: C.white, padding: 4, textAlign: 'right' }}>{h.weight != null ? `${(h.weight * 100).toFixed(2)}%` : '—'}</td>
                  <td style={{ color: C.amberDim, padding: 4 }}>{h.sector || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sector Exposure */}
      {sectors && sectors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: C.yellow, fontSize: 12, marginBottom: 4, fontWeight: 700 }}>SECTOR EXPOSURE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sectors.slice(0, 12).map((s: any) => (
              <div key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 120, fontSize: 11, color: C.amberDim, textAlign: 'right' }}>{s.sector}</div>
                <div style={{ flex: 1, height: 12, background: C.bgPanel }}>
                  <div style={{ width: `${Math.min(s.weight, 100)}%`, height: '100%', background: C.amber }} />
                </div>
                <div style={{ width: 40, fontSize: 11, color: C.white }}>{s.weight.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}