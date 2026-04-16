import React, { useState, useEffect, useCallback } from 'react'
import C from '../../lib/colors'

interface BackgroundLayerProps {
  focusedPanelRef?: React.RefObject<HTMLElement | null>
}

const BackgroundLayer: React.FC<BackgroundLayerProps> = ({ focusedPanelRef }) => {
  const [gradientCenter, setGradientCenter] = useState<{ x: number; y: number }>({ x: 50, y: 50 })

  const updateGradient = useCallback(() => {
    if (focusedPanelRef?.current) {
      const rect = focusedPanelRef.current.getBoundingClientRect()
      const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100
      const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100
      setGradientCenter({ x, y })
    }
  }, [focusedPanelRef])

  useEffect(() => {
    updateGradient()
    const interval = setInterval(updateGradient, 300)
    window.addEventListener('resize', updateGradient)
    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', updateGradient)
    }
  }, [updateGradient])

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: `radial-gradient(ellipse at ${gradientCenter.x}% ${gradientCenter.y}%, ${C.amber}03 0%, transparent 50%)`,
          pointerEvents: 'none',
          zIndex: 0,
          transition: 'background 300ms ease',
        }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
          pointerEvents: 'none',
          zIndex: 9998,
          opacity: 0.01,
        }}
      />
    </>
  )
}

export default BackgroundLayer