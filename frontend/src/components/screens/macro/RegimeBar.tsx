import React from 'react'
import type { RegimeReading } from './types'
import theme from '../../../lib/theme'

const { color, type: typo } = theme

const REGIME_LABELS: Record<string, string> = {
  disinflation_risk_on: 'DISINFLATION / RISK-ON',
  stagflation_defensive: 'STAGFLATION / DEFENSIVE',
  flight_to_quality: 'FLIGHT TO QUALITY',
  reflation: 'REFLATION',
  mixed_no_edge: 'MIXED / NO EDGE',
}

const CONVICTION_STYLES: Record<string, { dot: string; label: string }> = {
  high: { dot: color.accentPositive, label: 'HIGH' },
  medium: { dot: color.accentWarning, label: 'MEDIUM' },
  low: { dot: color.textTertiary, label: 'LOW' },
}

interface RegimeBarProps {
  regime: RegimeReading
  loading?: boolean
}

const keyframesId = 'regime-flash-keyframes'

const RegimeBar: React.FC<RegimeBarProps> = ({ regime, loading }) => {
  const label = REGIME_LABELS[regime.regime] ?? regime.regime.toUpperCase()
  const conv = CONVICTION_STYLES[regime.conviction] ?? CONVICTION_STYLES.low
  const shifted = regime.recently_shifted

  return (
    <>
      {shifted && (
        <style>{`
          @keyframes ${keyframesId} {
            0% { opacity: 0; }
            50% { opacity: 0.12; }
            100% { opacity: 0; }
          }
        `}</style>
      )}
      <div
        style={{
          height: 80,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: color.bgElevated,
          position: 'relative',
          overflow: 'hidden',
          borderBottom: `1px solid ${color.borderSubtle}`,
        }}
      >
        {shifted && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: color.accentNegative,
              animation: shifted ? `${keyframesId} 2s ease-in-out infinite` : 'none',
              pointerEvents: 'none',
            }}
          />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
          <span style={{
            ...typo.h2,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: color.textPrimary,
          }}>
            {loading ? '---' : label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, position: 'relative', zIndex: 1 }}>
          <div style={{
            ...typo.monoSm,
            color: color.textSecondary,
            border: `1px solid ${color.borderMedium}`,
            borderRadius: theme.radius.sm,
            padding: '2px 10px',
          }}>
            Day {loading ? '--' : regime.age_days}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: conv.dot,
            }} />
            <span style={{
              ...typo.caption,
              color: conv.dot,
            }}>
              {loading ? '---' : conv.label}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

export default RegimeBar