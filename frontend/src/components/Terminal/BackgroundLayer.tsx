import React from 'react'
import theme from '../../lib/theme'

const { color } = theme

interface BackgroundLayerProps {
  focusedPanelRef?: React.RefObject<HTMLElement | null>
}

/**
 * App background layer with ambient glow orbs.
 * These show through the glass command bar and status bar.
 */
const BackgroundLayer: React.FC<BackgroundLayerProps> = () => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: color.bgBase,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {/* Green orb — top left (visible through command bar glass) */}
      <div style={{
        position: 'absolute',
        top: '-30px',
        left: '10%',
        width: '500px',
        height: '200px',
        background: 'radial-gradient(ellipse at center, rgba(0, 217, 100, 0.15) 0%, rgba(0, 217, 100, 0.04) 50%, transparent 75%)',
        borderRadius: '50%',
      }} />
      {/* Blue orb — top right (visible through command bar glass) */}
      <div style={{
        position: 'absolute',
        top: '-20px',
        right: '5%',
        width: '400px',
        height: '180px',
        background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.03) 50%, transparent 75%)',
        borderRadius: '50%',
      }} />
      {/* Green orb — bottom (visible through status bar glass) */}
      <div style={{
        position: 'absolute',
        bottom: '-20px',
        left: '20%',
        width: '500px',
        height: '160px',
        background: 'radial-gradient(ellipse at center, rgba(0, 217, 100, 0.10) 0%, rgba(0, 217, 100, 0.03) 50%, transparent 75%)',
        borderRadius: '50%',
      }} />
      {/* Blue accent — bottom right */}
      <div style={{
        position: 'absolute',
        bottom: '-10px',
        right: '15%',
        width: '400px',
        height: '140px',
        background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.08) 0%, transparent 60%)',
        borderRadius: '50%',
      }} />
    </div>
  )
}

export default BackgroundLayer
