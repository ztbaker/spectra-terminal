import React, { useState, useCallback, useEffect } from 'react'
import theme from '../../lib/theme'

const { color, font, radius, motion } = theme

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
                background: isActive ? color.bgSurface : 'transparent',
                color: isActive ? color.textPrimary : color.textTertiary,
                border: `1px solid ${isActive ? color.borderMedium : color.borderSubtle}`,
                padding: '5px 12px',
                fontSize: '12px',
                fontFamily: font.sans,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                borderRadius: radius.sm,
                transition: `all ${motion.normal} ${motion.ease}`,
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
        borderBottom: `1px solid ${color.borderSubtle}`,
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
              color: isActive ? color.textPrimary : color.textTertiary,
              border: 'none',
              borderBottom: isActive ? `2px solid ${color.accentPositive}` : '2px solid transparent',
              padding: '8px 16px',
              fontSize: '12px',
              fontFamily: font.sans,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: `all ${motion.normal} ${motion.ease}`,
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
