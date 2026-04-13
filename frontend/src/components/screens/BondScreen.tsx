import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

interface Props { ticker?: string; onNavigate: (cmd: string) => void }

export default function BondScreen(_props: Props) {
  const { data: curve, isLoading: curveLoading } = useQuery({
    queryKey: ['treasury-rates'],
    queryFn: () => fetch(`${API}/fi/treasury/rates`).then(r => r.json()),
  })

  const { data: effr } = useQuery({
    queryKey: ['effr'],
    queryFn: () => fetch(`${API}/fi/effr`).then(r => r.json()),
  })

  const { data: mortgage } = useQuery({
    queryKey: ['mortgage-rates'],
    queryFn: () => fetch(`${API}/fi/mortgage`).then(r => r.json()),
  })

  const { data: spreads } = useQuery({
    queryKey: ['curve-spreads'],
    queryFn: () => fetch(`${API}/fi/curve-spread?spread=2s10s`).then(r => r.json()),
  })

  if (curveLoading) return <div style={{ color: C.amber, padding: 24 }}>Loading yield curve...</div>

  return (
    <div style={{ padding: '16px 24px', color: C.amber }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>FIXED INCOME — TREASURY YIELD CURVE</div>

      {/* EFFR + Mortgage tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          ['EFFR', effr?.rate != null ? `${effr.rate.toFixed(2)}%` : '—', effr?.date],
          ['30Y Mortgage', mortgage?.rate_30y != null ? `${mortgage.rate_30y.toFixed(2)}%` : '—', mortgage?.date],
          ['15Y Mortgage', mortgage?.rate_15y != null ? `${mortgage.rate_15y.toFixed(2)}%` : '—', mortgage?.date],
          ['2s10s Spread', spreads?.current_bps != null ? `${spreads.current_bps}bps` : '—', null],
        ].map(([label, value, sub]) => (
          <div key={String(label)} style={{ background: C.surface2, border: `1px solid ${C.border0}`, padding: 8 }}>
            <div style={{ color: C.amberMute, fontSize: 10 }}>{label}</div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>{value}</div>
            {sub && <div style={{ color: C.amberMute, fontSize: 9 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Yield Curve */}
      {curve?.curve && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: C.amberBright, fontSize: 12, marginBottom: 8, fontWeight: 700 }}>CURRENT YIELD CURVE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 200, gap: 1, borderBottom: `1px solid ${C.border0}`, paddingBottom: 4 }}>
              {curve.curve.map((point: any) => {
                const maxRate = 5.5
                const height = point.yield_value != null ? (point.yield_value / maxRate) * 100 : 0
                return (
                  <div key={point.tenor} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{ width: '80%', height: `${Math.max(height, 1)}%`, background: C.amber, alignSelf: 'flex-end' }} />
                    <div style={{ color: C.amberDim, fontSize: 8, marginTop: 2 }}>{point.tenor}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Rate table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border0}` }}>
                <th style={{ color: C.amberMute, textAlign: 'left', padding: 4 }}>Tenor</th>
                <th style={{ color: C.amberMute, textAlign: 'right', padding: 4 }}>Yield</th>
              </tr>
            </thead>
            <tbody>
              {curve.curve.map((point: any) => (
                <tr key={point.tenor} style={{ borderBottom: `1px solid ${C.border0}` }}>
                  <td style={{ color: C.amberDim, padding: 4 }}>{point.tenor}</td>
                  <td style={{ color: C.white, padding: 4, textAlign: 'right' }}>
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