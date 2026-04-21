import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import theme from '../../lib/theme'
const { color, font } = theme

const API_URL = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''

function fiGet(path: string, params?: Record<string, string>) {
  const headers: Record<string, string> = {}
  if (API_KEY) headers['X-Spectra-Key'] = API_KEY
  return axios.get(`${API_URL}${path}`, { headers, params }).then(r => r.data)
}

interface Props { ticker?: string; onNavigate: (cmd: string) => void }

export default function BondScreen(_props: Props) {
  const { data: curve, isLoading: curveLoading } = useQuery({
    queryKey: ['treasury-rates'],
    queryFn: () => fiGet('/fi/treasury/rates'),
  })

  const { data: effr } = useQuery({
    queryKey: ['effr'],
    queryFn: () => fiGet('/fi/effr'),
  })

  const { data: mortgage } = useQuery({
    queryKey: ['mortgage-rates'],
    queryFn: () => fiGet('/fi/mortgage'),
  })

  const { data: spreads } = useQuery({
    queryKey: ['curve-spreads'],
    queryFn: () => fiGet('/fi/curve-spread', { spread: '2s10s' }),
  })

  if (curveLoading) return <div style={{ color: color.textPrimary, padding: 24 }}>Loading yield curve...</div>

  return (
    <div style={{ padding: '16px 24px', color: color.textPrimary }}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, fontFamily: font.sans }}>FIXED INCOME — TREASURY YIELD CURVE</div>

      {/* EFFR + Mortgage tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          ['EFFR', effr?.rate != null ? `${effr.rate.toFixed(2)}%` : '—', effr?.date],
          ['30Y Mortgage', mortgage?.rate_30y != null ? `${mortgage.rate_30y.toFixed(2)}%` : '—', mortgage?.date],
          ['15Y Mortgage', mortgage?.rate_15y != null ? `${mortgage.rate_15y.toFixed(2)}%` : '—', mortgage?.date],
          ['2s10s Spread', spreads?.current_bps != null ? `${spreads.current_bps}bps` : '—', null],
        ].map(([label, value, sub]) => (
          <div key={String(label)} style={{ background: 'rgba(19, 22, 25, 0.6)', border: `1px solid ${color.borderSubtle}`, padding: 8 }}>
            <div style={{ color: color.textTertiary, fontSize: 10 }}>{label}</div>
            <div style={{ color: color.textPrimary, fontSize: 16, fontWeight: 700 }}>{value}</div>
            {sub && <div style={{ color: color.textTertiary, fontSize: 9 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Yield Curve */}
      {curve?.curve && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: color.textSecondary, fontSize: 11, marginBottom: 8, fontWeight: 600, fontFamily: font.sans }}>CURRENT YIELD CURVE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: '200px', gap: 2, borderBottom: `1px solid ${color.borderSubtle}`, paddingBottom: 4 }}>
              {curve.curve.map((point: any) => {
                const maxRate = Math.max(...curve.curve.map((p: any) => p.yield_value ?? 0), 1)
                const barH = point.yield_value != null ? (point.yield_value / (maxRate * 1.15)) * 180 : 0
                return (
                  <div key={point.tenor} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: 9, color: color.accentInfo, marginBottom: 4, fontFamily: font.mono }}>{point.yield_value != null ? point.yield_value.toFixed(2) : ''}</div>
                    <div style={{ width: '70%', height: `${Math.max(barH, 2)}px`, background: 'linear-gradient(180deg, #3B82F6, #00D964)', borderRadius: '2px 2px 0 0', minHeight: 2 }} />
                    <div style={{ color: color.textSecondary, fontSize: 9, marginTop: 4, fontFamily: font.mono }}>{point.tenor}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Rate table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${color.borderSubtle}` }}>
                <th style={{ color: color.textTertiary, textAlign: 'left', padding: 4 }}>Tenor</th>
                <th style={{ color: color.textTertiary, textAlign: 'right', padding: 4 }}>Yield</th>
              </tr>
            </thead>
            <tbody>
              {curve.curve.map((point: any) => (
                <tr key={point.tenor} style={{ borderBottom: `1px solid ${color.borderSubtle}` }}>
                  <td style={{ color: color.textSecondary, padding: 4 }}>{point.tenor}</td>
                  <td style={{ color: color.textPrimary, padding: 4, textAlign: 'right' }}>
                    {point.yield_value != null ? `${point.yield_value.toFixed(2)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}