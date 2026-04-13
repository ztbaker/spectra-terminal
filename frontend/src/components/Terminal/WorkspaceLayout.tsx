import React from 'react'
import C from '../../lib/colors'
import type { WorkspaceState, WorkspaceLayoutType } from '../../types'

interface WorkspaceLayoutProps {
  state: WorkspaceState
  children: React.ReactNode[]
  onFocusPanel: (id: string) => void
}

const LAYOUT_STYLES: Record<WorkspaceLayoutType, React.CSSProperties> = {
  '1P':    { display: 'grid', gridTemplateColumns: '1fr', gap: '4px', padding: '4px', height: '100%' },
  '2P':    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', padding: '4px', height: '100%' },
  '2PT':   { display: 'grid', gridTemplateRows: '1fr 1fr', gap: '4px', padding: '4px', height: '100%' },
  '3P':    { display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', gap: '4px', padding: '4px', height: '100%' },
  '4P':    { display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '4px', padding: '4px', height: '100%' },
  '1P+1S': { display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '4px', padding: '4px', height: '100%' },
}

/**
 * Multi-panel workspace container.
 * Renders panels in a configurable grid layout.
 */
const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  state,
  children,
  onFocusPanel,
}) => {
  const layoutStyle = LAYOUT_STYLES[state.layout] ?? LAYOUT_STYLES['1P+1S']

  return (
    <div
      style={{
        position: 'fixed',
        top: '44px',
        bottom: '28px',
        left: 0,
        right: 0,
        background: C.surface0,
        ...layoutStyle,
      }}
    >
      {React.Children.map(children, (child, idx) => (
        <div
          key={state.panels[idx]?.id ?? idx}
          onClick={() => {
            const panelId = state.panels[idx]?.id
            if (panelId) onFocusPanel(panelId)
          }}
          style={{ minHeight: 0 }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

export default WorkspaceLayout