import React, { useRef, useState, useCallback, useEffect } from 'react'
import theme from '../../lib/theme'
import { useBreakpoint } from '../../lib/useBreakpoint'
import type { WorkspaceState, WorkspaceLayoutType } from '../../types'

const T = theme

interface WorkspaceLayoutProps {
  state: WorkspaceState
  children: React.ReactNode[]
  onFocusPanel: (id: string) => void
  onSwapPanels: (idA: string, idB: string) => void
  onResizePanels: (sizes: number[]) => void
}

type LayoutAxis = 'horizontal' | 'vertical' | 'grid'

function layoutAxis(layout: WorkspaceLayoutType): LayoutAxis {
  if (layout === '2PT') return 'vertical'
  if (layout === '4P') return 'grid'
  return 'horizontal'
}

const MIN_SIZE_PCT = 15

function equalSizes(count: number): number[] {
  if (count === 0) return []
  const s = 100 / count
  return Array(count).fill(s)
}

type DragState = {
  panelId: string
  offsetX: number
  offsetY: number
  width: number
  height: number
}

const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  state,
  children,
  onFocusPanel,
  onSwapPanels,
  onResizePanels,
}) => {
  const bp = useBreakpoint()
  const gap = bp === 'compact' ? 4 : bp === 'expanded' ? 12 : 8
  const padding = gap
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const panelRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // ── Resize: mutable refs so the pointermove handler always sees latest state ──
  const resizeInfoRef = useRef<{
    splitIndex: number
    axis: 'horizontal' | 'vertical'
    containerRect: DOMRect
    startSizes: number[]
    panelCount: number
    gap: number
  } | null>(null)

  const { layout, panels, sizes } = state
  const panelCount = panels.length
  const axis = layoutAxis(layout)
  const isGrid = layout === '4P'
  const effectiveSizes = sizes.length === panelCount ? sizes : equalSizes(panelCount)
  const childrenArray = React.Children.toArray(children)
  const isVerticalAxis = axis === 'vertical'

  // ── Mac-style floating drag ────────────────────────────────────────────────

  const handlePanelDragStart = useCallback((panelId: string, e: React.PointerEvent<HTMLElement>) => {
    const cellEl = panelRefs.current.get(panelId)
    if (!cellEl) return
    const rect = cellEl.getBoundingClientRect()
    setDragState({
      panelId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
    setDragPos({ x: rect.left, y: rect.top })
  }, [])

  useEffect(() => {
    if (!dragState) return

    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault()
      setDragPos({
        x: e.clientX - dragState.offsetX,
        y: e.clientY - dragState.offsetY,
      })

      let hitId: string | null = null
      panelRefs.current.forEach((el, id) => {
        if (id === dragState.panelId) return
        const r = el.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          hitId = id
        }
      })
      setDragOverId(hitId)
    }

    const onPointerUp = () => {
      if (dragOverId && dragOverId !== dragState.panelId) {
        onSwapPanels(dragState.panelId, dragOverId)
      }
      setDragState(null)
      setDragPos(null)
      setDragOverId(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [dragState, dragOverId, onSwapPanels])

  // ── Resize: global pointermove handler ─────────────────────────────────────

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const info = resizeInfoRef.current
      if (!info) return

      const { splitIndex, containerRect, startSizes, panelCount: count, gap: g, axis: resizeAxis } = info
      const isVert = resizeAxis === 'vertical'
      const containerSize = isVert ? containerRect.height : containerRect.width
      const containerStart = isVert ? containerRect.top : containerRect.left
      const totalGapSpace = g * (count - 1)
      const availableSize = containerSize - totalGapSpace

      // Where is the cursor relative to the container start?
      const cursorOffset = (isVert ? e.clientY : e.clientX) - containerStart

      // Walk through sizes to find where the cursor falls and compute new proportions
      // We only need to adjust splitIndex and splitIndex+1
      let cumPx = 0
      for (let i = 0; i < splitIndex; i++) {
        cumPx += (startSizes[i] / 100) * availableSize
        if (i < count - 1) cumPx += g
      }

      // The new left panel size in px from container start minus cumPx
      const newLeftPx = cursorOffset - cumPx
      const newLeftPct = (newLeftPx / availableSize) * 100
      const totalPair = startSizes[splitIndex] + startSizes[splitIndex + 1]

      const clampedLeft = Math.min(totalPair - MIN_SIZE_PCT, Math.max(MIN_SIZE_PCT, newLeftPct))
      const clampedRight = totalPair - clampedLeft

      const newSizes = [...startSizes]
      newSizes[splitIndex] = clampedLeft
      newSizes[splitIndex + 1] = clampedRight
      onResizePanels(newSizes)
    }

    const onPointerUp = () => {
      resizeInfoRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onResizePanels])

  // ── Resize handle component ─────────────────────────────────────────────

  const ResizeHandle: React.FC<{ splitIndex: number; axis: 'horizontal' | 'vertical' }> = ({ splitIndex, axis: handleAxis }) => {
    const onPointerDown = (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Capture start state
      if (!containerRef.current) return
      resizeInfoRef.current = {
        splitIndex,
        axis: handleAxis,
        containerRect: containerRef.current.getBoundingClientRect(),
        startSizes: [...effectiveSizes],
        panelCount,
        gap,
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }

    const isVert = handleAxis === 'vertical'
    return (
      <div
        onPointerDown={onPointerDown}
        style={{
          flexShrink: 0,
          background: 'transparent',
          cursor: isVert ? 'row-resize' : 'col-resize',
          position: 'relative',
          zIndex: 10,
          touchAction: 'none',
          ...(isVert
            ? { height: `${gap + 8}px`, margin: `-${Math.floor(gap / 2) + 4}px 0` }
            : { width: `${gap + 8}px`, margin: `0 -${Math.floor(gap / 2) + 4}px` }),
        }}
      >
        <div style={{
          position: 'absolute',
          ...(isVert
            ? { top: '50%', left: '20%', right: '20%', height: '2px', transform: 'translateY(-50%)' }
            : { left: '50%', top: '20%', bottom: '20%', width: '2px', transform: 'translateX(-50%)' }),
          background: T.color.borderMedium,
          borderRadius: '1px',
          transition: 'background 150ms ease, box-shadow 150ms ease',
        }} />
      </div>
    )
  }

  // ── Render helper ───────────────────────────────────────────────────────

  const renderPanelCell = (idx: number) => {
    const panelId = panels[idx]?.id ?? ''
    const isDropTarget = panelId === dragOverId
    const isDragging = dragState?.panelId === panelId
    return (
      <div
        key={panelId || idx}
        ref={(el) => {
          if (el) panelRefs.current.set(panelId, el)
          else panelRefs.current.delete(panelId)
        }}
        onClick={() => { if (panelId) onFocusPanel(panelId) }}
        style={{
          flex: `${effectiveSizes[idx]} ${effectiveSizes[idx]} 0`,
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          borderRadius: '6px',
          outline: isDropTarget ? `2px dashed ${T.color.accentPositive}` : 'none',
          outlineOffset: '-2px',
          opacity: isDragging ? 0.3 : 1,
          transition: 'outline 150ms ease, opacity 200ms ease',
        }}
      >
        {React.cloneElement(childrenArray[idx] as React.ReactElement<any>, {
          onDragStart: (panelId: string, e: React.PointerEvent<HTMLElement>) => handlePanelDragStart(panelId, e),
        })}
      </div>
    )
  }

  // ── Floating drag overlay ─────────────────────────────────────────────

  const draggingPanelIndex = dragState ? panels.findIndex(p => p.id === dragState.panelId) : -1
  const floatingPanel = dragState && dragPos && draggingPanelIndex >= 0 ? (
    <div
      style={{
        position: 'fixed',
        left: dragPos.x,
        top: dragPos.y,
        width: dragState.width,
        height: dragState.height,
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: 0.85,
        transform: 'scale(1.02)',
        boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px ${T.color.borderStrong}`,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {childrenArray[draggingPanelIndex]}
    </div>
  ) : null

  // ── Single panel (1P) ───────────────────────────────────────────────────

  if (layout === '1P') {
    return (
      <>
        <div
          ref={containerRef}
          style={{
            position: 'fixed',
            top: '48px',
            bottom: '30px',
            left: 0,
            right: 0,
            background: T.color.bgBase,
            padding,
          }}
          onClick={() => {
            const panelId = panels[0]?.id
            if (panelId) onFocusPanel(panelId)
          }}
        >
          <div
            ref={(el) => {
              const pid = panels[0]?.id ?? ''
              if (el) panelRefs.current.set(pid, el)
              else panelRefs.current.delete(pid)
            }}
          >
            {React.cloneElement(childrenArray[0] as React.ReactElement<any>, {
              onDragStart: (panelId: string, e: React.PointerEvent<HTMLElement>) => handlePanelDragStart(panelId, e),
            })}
          </div>
        </div>
        {floatingPanel}
      </>
    )
  }

  // ── Grid layout (4P) ──────────────────────────────────────────────────

  if (isGrid) {
    return (
      <>
        <div
          ref={containerRef}
          style={{
            position: 'fixed',
            top: '48px',
            bottom: '30px',
            left: 0,
            right: 0,
            background: T.color.bgBase,
            padding,
            display: 'flex',
            flexDirection: 'column',
            gap: `${gap}px`,
          }}
        >
          <div style={{ display: 'flex', flex: `${effectiveSizes[0] + effectiveSizes[1]}%`, gap: `${gap}px`, minHeight: 0 }}>
            {renderPanelCell(0)}
            {panelCount > 1 && <ResizeHandle splitIndex={0} axis="horizontal" />}
            {panelCount > 1 && renderPanelCell(1)}
          </div>
          <ResizeHandle splitIndex={1} axis="vertical" />
          <div style={{ display: 'flex', flex: `${effectiveSizes[2] + (effectiveSizes[3] ?? 0)}%`, gap: `${gap}px`, minHeight: 0 }}>
            {panelCount > 2 && renderPanelCell(2)}
            {panelCount > 3 && <ResizeHandle splitIndex={2} axis="horizontal" />}
            {panelCount > 3 && renderPanelCell(3)}
          </div>
        </div>
        {floatingPanel}
      </>
    )
  }

  // ── Horizontal or vertical split (2P, 2PT, 3P, 1P+1S) ──────────────

  const cells: React.ReactNode[] = []
  for (let i = 0; i < panelCount; i++) {
    if (i > 0) {
      cells.push(
        <ResizeHandle key={`rh-${i}`} splitIndex={i - 1} axis={isVerticalAxis ? 'vertical' : 'horizontal'} />
      )
    }
    cells.push(renderPanelCell(i))
  }

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          top: '48px',
          bottom: '30px',
          left: 0,
          right: 0,
          background: T.color.bgBase,
          padding,
          display: 'flex',
          flexDirection: isVerticalAxis ? 'column' : 'row',
          gap: `${gap}px`,
        }}
      >
        {cells}
      </div>
      {floatingPanel}
    </>
  )
}

export default WorkspaceLayout