import { useState, useCallback } from 'react'
import type { ScreenType, WorkspaceLayoutType, WorkspaceState, PanelConfig, PanelSnapshot } from '../types'

let panelIdCounter = Date.now()
function nextPanelId(): string {
  return `panel-${++panelIdCounter}`
}

const HISTORY_CAP = 20

function pushHistory(panel: PanelConfig): PanelSnapshot[] {
  const snap: PanelSnapshot = { screen: panel.screen, ticker: panel.ticker, sub: panel.sub }
  const prev = panel.history ?? []
  const next = [...prev, snap]
  if (next.length > HISTORY_CAP) next.shift()
  return next
}

const LAYOUT_MAX: Record<WorkspaceLayoutType, number> = {
  '1P': 1,
  '2P': 2,
  '2PT': 2,
  '3P': 3,
  '4P': 4,
  '1P+1S': 2,
}

function upgradeLayout(current: WorkspaceLayoutType, needed: number): WorkspaceLayoutType {
  if (needed <= LAYOUT_MAX[current]) return current
  if (needed <= 2) return '2P'
  if (needed <= 3) return '3P'
  return '4P'
}

function downgradeLayout(current: WorkspaceLayoutType, needed: number): WorkspaceLayoutType {
  if (needed <= 1) return '1P'
  if (needed <= 2) {
    return current === '1P+1S' ? '1P+1S' : '2P'
  }
  if (needed <= 3) return '3P'
  return '4P'
}

function equalSizes(count: number): number[] {
  if (count === 0) return []
  const s = 100 / count
  return Array(count).fill(s)
}

export function useWorkspace(): {
  state: WorkspaceState
  openScreen: (screen: ScreenType, ticker?: string, sub?: string) => void
  openScreenInNewPanel: (screen: ScreenType, ticker?: string, sub?: string) => void
  closePanel: (id: string) => void
  focusPanel: (id: string) => void
  setLayout: (layout: WorkspaceLayoutType) => void
  maximizePanel: (id: string) => void
  swapPanels: (idA: string, idB: string) => void
  resizePanels: (sizes: number[]) => void
  goBack: (panelId?: string) => void
  clearHistory: (panelId?: string) => void
} {
  const [state, setState] = useState<WorkspaceState>({
    layout: '1P+1S',
    panels: [{ id: nextPanelId(), screen: 'home', focused: true }],
    focusedPanelId: null,
    sizes: [100],
  })

  const openScreen = useCallback((screen: ScreenType, ticker?: string, sub?: string) => {
    setState(prev => {
      const newPanel: PanelConfig = { id: nextPanelId(), screen, ticker, sub, focused: true }
      const panels = prev.panels.map(p => ({ ...p, focused: false }))
      // Prefer replacing a panel already showing the same screen type (e.g.
      // switching chat threads should stay in the chat panel, not open elsewhere).
      const sameScreenIdx = panels.findIndex(p => p.screen === screen)
      const focusedIdx = prev.panels.findIndex(p => p.focused)
      const replaceIdx = sameScreenIdx >= 0 ? sameScreenIdx : focusedIdx
      const targetIdx = replaceIdx >= 0 ? replaceIdx : panels.length - 1
      const oldPanel = panels[targetIdx]
      const sameState =
        oldPanel &&
        oldPanel.screen === newPanel.screen &&
        oldPanel.ticker === newPanel.ticker &&
        oldPanel.sub === newPanel.sub
      const updated = [...panels]
      updated[targetIdx] = sameState
        ? { ...newPanel, history: oldPanel.history ?? [] }
        : { ...newPanel, history: pushHistory(oldPanel) }
      return { ...prev, panels: updated, focusedPanelId: newPanel.id }
    })
  }, [])

  const openScreenInNewPanel = useCallback((screen: ScreenType, ticker?: string, sub?: string) => {
    setState(prev => {
      const newPanel: PanelConfig = { id: nextPanelId(), screen, ticker, sub, focused: true }
      const panels = prev.panels.map(p => ({ ...p, focused: false }))

      if (panels.length >= 4) {
        const replaceIdx = panels.length - 1
        const updated = [...panels]
        updated[replaceIdx] = newPanel
        return { ...prev, panels: updated, focusedPanelId: newPanel.id }
      }

      const newLayout = upgradeLayout(prev.layout, panels.length + 1)
      const newSize = panels.length + 1
      return {
        layout: newLayout,
        panels: [...panels, newPanel],
        focusedPanelId: newPanel.id,
        sizes: equalSizes(newSize),
      }
    })
  }, [])

  const closePanel = useCallback((id: string) => {
    setState(prev => {
      const panels = prev.panels.filter(p => p.id !== id)
      if (panels.length === 0) {
        panels.push({ id: nextPanelId(), screen: 'home', focused: true })
      }
      if (!panels.some(p => p.focused)) {
        panels[0].focused = true
      }
      const focusedPanelId = panels.find(p => p.focused)?.id ?? panels[0].id
      const newLayout = downgradeLayout(prev.layout, panels.length)
      return { ...prev, layout: newLayout, panels, focusedPanelId, sizes: equalSizes(panels.length) }
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
    setState(prev => ({ ...prev, layout, sizes: equalSizes(prev.panels.length) }))
  }, [])

  const maximizePanel = useCallback((id: string) => {
    setState(prev => {
      const panel = prev.panels.find(p => p.id === id)
      if (!panel) return prev
      return { ...prev, layout: '1P', panels: [{ ...panel, focused: true }], focusedPanelId: id, sizes: [100] }
    })
  }, [])

  const swapPanels = useCallback((idA: string, idB: string) => {
    setState(prev => {
      const idxA = prev.panels.findIndex(p => p.id === idA)
      const idxB = prev.panels.findIndex(p => p.id === idB)
      if (idxA === -1 || idxB === -1 || idxA === idxB) return prev
      const panels = [...prev.panels]
      const sizes = [...prev.sizes]
      ;[panels[idxA], panels[idxB]] = [panels[idxB], panels[idxA]]
      ;[sizes[idxA], sizes[idxB]] = [sizes[idxB], sizes[idxA]]
      return { ...prev, panels, sizes }
    })
  }, [])

  const resizePanels = useCallback((sizes: number[]) => {
    setState(prev => ({ ...prev, sizes }))
  }, [])

  const goBack = useCallback((panelId?: string) => {
    setState(prev => {
      const targetId = panelId ?? prev.focusedPanelId ?? prev.panels.find(p => p.focused)?.id
      if (!targetId) return prev
      const idx = prev.panels.findIndex(p => p.id === targetId)
      if (idx < 0) return prev
      const panel = prev.panels[idx]
      const history = panel.history ?? []
      if (history.length === 0) return prev
      const restored = history[history.length - 1]
      const nextHistory = history.slice(0, -1)
      const panels = [...prev.panels]
      panels[idx] = {
        ...panel,
        screen: restored.screen,
        ticker: restored.ticker,
        sub: restored.sub,
        history: nextHistory,
      }
      return { ...prev, panels }
    })
  }, [])

  const clearHistory = useCallback((panelId?: string) => {
    setState(prev => {
      const targetId = panelId ?? prev.focusedPanelId ?? prev.panels.find(p => p.focused)?.id
      if (!targetId) return prev
      const idx = prev.panels.findIndex(p => p.id === targetId)
      if (idx < 0) return prev
      const panels = [...prev.panels]
      panels[idx] = { ...panels[idx], history: [] }
      return { ...prev, panels }
    })
  }, [])

  return { state, openScreen, openScreenInNewPanel, closePanel, focusPanel, setLayout, maximizePanel, swapPanels, resizePanels, goBack, clearHistory }
}