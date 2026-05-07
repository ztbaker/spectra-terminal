import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface SeasonalPoint {
  day_of_year: number
  month: number
  day: number
  mean_return: number
  median_return: number
  p25_return: number
  p75_return: number
  cumulative_mean: number
  cumulative_median: number
  sample_size: number
}

interface SeasonalsResponse {
  ticker: string
  years: number
  points: SeasonalPoint[]
  best_months: { month: number; avg_daily_return: number; days: number }[]
  worst_months: { month: number; avg_daily_return: number; days: number }[]
  monthly: { month: number; avg_daily_return: number; days: number }[]
  cached: boolean
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const AMBER = '#ff9900'
const GREEN = '#00ff41'
const RED = '#ff3333'
const BG = '#000000'

interface Props { ticker?: string }

export default function SeasonalScreen({ ticker }: Props) {
  const [years, setYears] = useState(20)
  const t = (ticker || 'SPY').toUpperCase()

  const { data, isLoading, error } = useQuery<SeasonalsResponse>({
    queryKey: ['seasonals', t, years],
    queryFn: () => api.get(`/seasonals/${t}?years=${years}`).then(r => r.data),
    staleTime: 60 * 60 * 1000,
  })

  if (isLoading) return <div style={{ color: AMBER, padding: 16, fontFamily: 'JetBrains Mono, monospace' }}>Loading seasonals for {t}...</div>
  if (error) return <div style={{ color: RED, padding: 16, fontFamily: 'JetBrains Mono, monospace' }}>Error: {String(error)}</div>
  if (!data) return null

  const monthlyMax = Math.max(...data.monthly.map(m => Math.abs(m.avg_daily_return)))

  return (
    <div style={{ background: BG, color: AMBER, fontFamily: 'JetBrains Mono, monospace', padding: 16, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>SEAS — {t} Seasonal Pattern</div>
        <div>
          {[5, 10, 20, 30].map(y => (
            <button
              key={y}
              onClick={() => setYears(y)}
              style={{
                background: y === years ? AMBER : 'transparent',
                color: y === years ? BG : AMBER,
                border: `1px solid ${AMBER}`,
                padding: '4px 10px',
                marginLeft: 4,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >{y}Y</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.7 }}>AVERAGE DAILY RETURN BY MONTH</div>
        {data.monthly.map(m => {
          const w = monthlyMax > 0 ? (Math.abs(m.avg_daily_return) / monthlyMax) * 50 : 0
          const color = m.avg_daily_return >= 0 ? GREEN : RED
          const sign = m.avg_daily_return >= 0 ? '' : '-'
          return (
            <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: '20px' }}>
              <div style={{ width: 32 }}>{MONTHS[m.month]}</div>
              <div style={{ width: 250, position: 'relative', background: '#111', height: 16 }}>
                <div style={{
                  position: 'absolute',
                  left: m.avg_daily_return >= 0 ? '50%' : `${50 - w}%`,
                  top: 0,
                  bottom: 0,
                  width: `${w}%`,
                  background: color,
                }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: AMBER, opacity: 0.4 }} />
              </div>
              <div style={{ color, width: 80, textAlign: 'right' }}>{sign}{(Math.abs(m.avg_daily_return) * 100).toFixed(3)}%</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 32, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.7 }}>BEST MONTHS</div>
          {data.best_months.map(m => (
            <div key={m.month} style={{ color: GREEN, fontSize: 12 }}>
              {MONTHS[m.month].padEnd(4)} {(m.avg_daily_return * 100).toFixed(3)}% / day ({m.days}d)
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.7 }}>WORST MONTHS</div>
          {data.worst_months.map(m => (
            <div key={m.month} style={{ color: RED, fontSize: 12 }}>
              {MONTHS[m.month].padEnd(4)} {(m.avg_daily_return * 100).toFixed(3)}% / day ({m.days}d)
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.7 }}>SEASONAL PATH (cumulative mean return, sampled)</div>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
          {data.points.length} trading days · {data.years}Y lookback {data.cached ? '· cached' : ''}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${AMBER}`, opacity: 0.7 }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>DATE</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>MEAN%</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>MEDIAN%</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>P25%</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>P75%</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>CUM%</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>N</th>
            </tr>
          </thead>
          <tbody>
            {data.points.filter((_, i) => i % Math.max(1, Math.floor(data.points.length / 30)) === 0).map(p => (
              <tr key={`${p.month}-${p.day}`}>
                <td style={{ padding: '2px 8px' }}>{MONTHS[p.month]} {String(p.day).padStart(2, '0')}</td>
                <td style={{ padding: '2px 8px', textAlign: 'right', color: p.mean_return >= 0 ? GREEN : RED }}>{(p.mean_return * 100).toFixed(3)}</td>
                <td style={{ padding: '2px 8px', textAlign: 'right', color: p.median_return >= 0 ? GREEN : RED }}>{(p.median_return * 100).toFixed(3)}</td>
                <td style={{ padding: '2px 8px', textAlign: 'right' }}>{(p.p25_return * 100).toFixed(3)}</td>
                <td style={{ padding: '2px 8px', textAlign: 'right' }}>{(p.p75_return * 100).toFixed(3)}</td>
                <td style={{ padding: '2px 8px', textAlign: 'right', color: p.cumulative_mean >= 0 ? GREEN : RED }}>{(p.cumulative_mean * 100).toFixed(2)}</td>
                <td style={{ padding: '2px 8px', textAlign: 'right' }}>{p.sample_size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}