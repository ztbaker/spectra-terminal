import React from 'react'
import { color } from '../../lib/theme'

interface Props {
  size?: number
  thickness?: number
  inset?: number
}

/**
 * Subtle corner brackets for panel decoration.
 * Uses borderSubtle color — no glow effects.
 */
const PanelCornerBrackets: React.FC<Props> = ({
  size = 12,
  thickness = 1,
  inset = 6,
}) => {
  const bracketColor = color.borderSubtle
  const common: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
  }
  const sideStyle = (sides: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean }): React.CSSProperties => ({
    ...common,
    borderTop:    sides.top    ? `${thickness}px solid ${bracketColor}` : 'none',
    borderRight:  sides.right  ? `${thickness}px solid ${bracketColor}` : 'none',
    borderBottom: sides.bottom ? `${thickness}px solid ${bracketColor}` : 'none',
    borderLeft:   sides.left   ? `${thickness}px solid ${bracketColor}` : 'none',
  })

  return (
    <>
      <span className="bb-corner" style={{ ...sideStyle({ top: true, left: true }),    top: inset,    left: inset    }} />
      <span className="bb-corner" style={{ ...sideStyle({ top: true, right: true }),   top: inset,    right: inset   }} />
      <span className="bb-corner" style={{ ...sideStyle({ bottom: true, left: true }), bottom: inset, left: inset    }} />
      <span className="bb-corner" style={{ ...sideStyle({ bottom: true, right: true }),bottom: inset, right: inset   }} />
    </>
  )
}

export default PanelCornerBrackets
