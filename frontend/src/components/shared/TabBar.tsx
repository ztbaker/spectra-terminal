import React, { useState, useCallback, useEffect } from 'react'
import C from '../../lib/colors'

interface Tab {
  key: string
  label: string
  count?: number
}

interface TabBarProps {
  tabs: Tab[]
  activeKey: string
  onChange: (key: string) => void
  variant?: 'underline' | 'pill'
}

/**
 * Consistent tab navigation with amber underline or pill style.
 * Keyboard navigable (left/right arrows).
 */
const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeKey,
  onChange,
  variant = 'underline',
}) => {
  const [focusIdx, setFocusIdx] = useState(() =>
    Math.max(0, tabs.findIndex(t => t.key === activeKey))
  )

  useEffect(() => {
    setFocusIdx(Math.max(0, tabs.findIndex(t => t.key === activeKey)))
  }, [activeKey, tabs])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = Math.min(focusIdx + 1, tabs.length - 1)
      setFocusIdx(next)
      onChange(tabs[next].key)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = Math.max(focusIdx - 1, 0)
      setFocusIdx(prev)
      onChange(tabs[prev].key)
    }
  }, [focusIdx, tabs, onChange])

  if (variant === 'pill') {
    return (
      <div
        role="tablist"
        onKeyDown={handleKeyDown}
        style={{ display: 'flex', gap: '4px' }}
      >
        {tabs.map(tab => {
          const isActive = tab.key === activeKey
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.key)}
              style={{
                background: isActive ? C.amberGlow : 'transparent',
                color: isActive ? C.amber : C.whiteDim,
                border: `1px solid ${isActive ? C.amberDim : C.border1}`,
                padding: '4px 12px',
                fontSize: '11px',
                fontFamily: C.fontDisplay,
                fontWeight: isActive ? 700 : 400,
                cursor: 'pointer',
                borderRadius: '3px',
                transition: 'all 150ms ease',
                letterSpacing: '0.03em',
              }}
            >
              {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
            </button>
          )
        })}
      </div>
    )
  }

  // Underline variant (default)
  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        borderBottom: `1px solid ${C.border1}`,
        gap: '0',
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeKey
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            style={{
              background: 'transparent',
              color: isActive ? C.amber : C.whiteDim,
              border: 'none',
              borderBottom: isActive ? `2px solid ${C.amber}` : '2px solid transparent',
              padding: '8px 16px',
              fontSize: '11px',
              fontFamily: C.fontDisplay,
              fontWeight: isActive ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 150ms ease',
              letterSpacing: '0.05em',
            }}
          >
            {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
          </button>
        )
      })}
    </div>
  )
}

export default TabBar