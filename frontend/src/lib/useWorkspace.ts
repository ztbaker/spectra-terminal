import { useState, useCallback } from 'react'
import type { ScreenType, WorkspaceLayoutType, WorkspaceState, PanelConfig } from '../types'

let panelIdCounter = 0
function nextPanelId(): string {
  return `panel-${++panelIdCounter}`
}

export function useWorkspace(): {
  state: WorkspaceState
  openScreen: (screen: ScreenType, ticker?: string, sub?: string) => void
  closePanel: (id: string) => void
  focusPanel: (id: string) => void
  setLayout: (layout: WorkspaceLayoutType) => void
  maximizePanel: (id: string) => void
} {
  const [state, setState] = useState<WorkspaceState>({
    layout: '1P+1S',
    panels: [{ id: nextPanelId(), screen: 'home', focused: true }],
    focusedPanelId: null,
  })

  const openScreen = useCallback((screen: ScreenType, ticker?: string, sub?: string) => {
    setState(prev => {
      const newPanel: PanelConfig = { id: nextPanelId(), screen, ticker, sub, focused: true }
      const panels = prev.panels.map(p => ({ ...p, focused: false }))
      // If layout has room, add panel; otherwise replace last non-home panel
      const maxPanels = prev.layout === '1P' ? 1 : prev.layout === '2P' || prev.layout === '2PT' ? 2 : prev.layout === '3P' ? 3 : prev.layout === '4P' ? 4 : 2
      if (panels.length < maxPanels) {
        return { ...prev, panels: [...panels, newPanel], focusedPanelId: newPanel.id }
      }
      // Replace the last panel (or the unfocused one)
      const replaceIdx = panels.length - 1
      const updated = [...panels]
      updated[replaceIdx] = newPanel
      return { ...prev, panels: updated, focusedPanelId: newPanel.id }
    })
  }, [])

  const closePanel = useCallback((id: string) => {
    setState(prev => {
      const panels = prev.panels.filter(p => p.id !== id)
      if (panels.length === 0) {
        panels.push({ id: nextPanelId(), screen: 'home', focused: true })
      }
      const focusedPanelId = panels.find(p => p.focused)?.id ?? panels[0].id
      return { ...prev, panels, focusedPanelId }
    })
  }, [])

  const focusPanel = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      panels: prev.panels.map(p => ({ ...p, focused: p.id === id })),
      focusedPanelId: id,
    }))
  }, [])

  const setLayout = useCallback((layout: WorkspaceLayoutType) => {
    setState(prev => ({ ...prev, layout }))
  }, [])

  const maximizePanel = useCallback((id: string) => {
    setState(prev => {
      const panel = prev.panels.find(p => p.id === id)
      if (!panel) return prev
      return { ...prev, layout: '1P', panels: [{ ...panel, focused: true }], focusedPanelId: id }
    })
  }, [])

  return { state, openScreen, closePanel, focusPanel, setLayout, maximizePanel }
}