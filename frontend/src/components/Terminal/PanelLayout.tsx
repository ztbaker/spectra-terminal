import React from 'react'

interface Props {
  children: React.ReactNode
}

/**
 * Full content-area wrapper that fills the space between
 * CommandBar (36px top) and StatusBar (24px bottom).
 * All screen components should be rendered inside this wrapper.
 */
const PanelLayout: React.FC<Props> = ({ children }) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: '36px',
        bottom: '24px',
        left: 0,
        right: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: '#000000',
      }}
    >
      {children}
    </div>
  )
}

export default PanelLayout
