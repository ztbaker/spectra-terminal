import React from 'react'
import { useBreakpoint } from '../../lib/useBreakpoint'

interface Props {
  title: string
  children: React.ReactNode
  className?: string
  actions?: React.ReactNode
  contentPadding?: string
}

const Panel: React.FC<Props> = ({ title, children, className, actions, contentPadding }) => {
  const bp = useBreakpoint()
  const defaultPadding = contentPadding ?? '0'
  const padding = contentPadding
    ? (bp === 'compact' ? '16px' : contentPadding)
    : defaultPadding

  return (
    <div
      className={['bb-panel', className].filter(Boolean).join(' ')}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Header row */}
      <div
        className="bb-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span>{title}</span>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {actions}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', ...(padding !== '0' ? { padding } : {}) }}>
        {children}
      </div>
    </div>
  )
}

export default Panel
