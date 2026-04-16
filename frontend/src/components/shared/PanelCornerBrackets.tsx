import React from 'react'

interface Props {
  color: string
  glow: string
  size?: number
  thickness?: number
  inset?: number
}

const PanelCornerBrackets: React.FC<Props> = ({
  color,
  glow,
  size = 12,
  thickness = 1.5,
  inset = 6,
}) => {
  const common: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
    filter: `drop-shadow(0 0 3px ${glow})`,
  }
  const sideStyle = (sides: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean }): React.CSSProperties => ({
    ...common,
    borderTop:    sides.top    ? `${thickness}px solid ${color}` : 'none',
    borderRight:  sides.right  ? `${thickness}px solid ${color}` : 'none',
    borderBottom: sides.bottom ? `${thickness}px solid ${color}` : 'none',
    borderLeft:   sides.left   ? `${thickness}px solid ${color}` : 'none',
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
