# Plan 1: Panel System Overhaul

## Goal
Transform the basic multi-panel workspace into a fully interactive, Bloomberg-grade panel management system.

## Current State
- PanelV3.tsx has basic glass header, focus state, maximize/close buttons
- WorkspaceLayout.tsx uses CSS Grid with fixed layouts (1P, 2P, 2PT, 3P, 4P, 1P+1S)
- No resize handles, no minimize, no drag reorder, no panel state indicators

## Tasks

### 1. Resizable Panels
**File:** `frontend/src/components/Terminal/WorkspaceLayout.tsx`

Replace the static CSS Grid with a draggable-resize grid:
- Add invisible resize handles (6px wide) between panels on the grid gaps
- Track column/row sizes in `useWorkspace` state as percentages
- On drag: update `gridTemplateColumns` / `gridTemplateRows` dynamically
- Enforce minimum panel size of 280px width, 200px height
- Show a glowing amber line on the resize handle during drag
- Persist panel sizes in localStorage per layout type
- Double-click resize handle to reset to equal splits

Implementation approach:
- Add a `ResizeHandle` component rendered between grid children
- Use `onPointerDown` / `onPointerMove` / `onPointerUp` for drag tracking
- Store sizes as `{ columns: number[], rows: number[] }` in workspace state
- Apply via `gridTemplateColumns: sizes.columns.map(s => `${s}fr`).join(' ')`

### 2. Minimize / Collapse
**File:** `frontend/src/components/Terminal/PanelV3.tsx`

Add a minimize button (─) to the panel header between maximize and close:
- Minimized panels collapse to header-only (36px height)
- Set `flex: 0 0 36px` when minimized instead of `flex: 1`
- Content div gets `display: none` when minimized
- Click the minimize button again or double-click header to restore
- Animate collapse with `max-height` transition (200ms ease-out)
- Add minimized state to `PanelConfig` in types

### 3. Drag-to-Reorder Panels
**File:** `frontend/src/components/Terminal/WorkspaceLayout.tsx`

Allow panels to be reordered via drag:
- Drag from the panel header (PanelV3 title area)
- Show a translucent ghost of the panel while dragging
- Highlight the drop zone with a dashed amber border
- On drop, reorder the `panels` array in workspace state
- Use HTML5 Drag & Drop API (no library needed)
- Add `draggable` attribute to panel header, handle `onDragStart`, `onDragOver`, `onDrop`

### 4. Panel State Indicators
**File:** `frontend/src/components/Terminal/PanelV3.tsx`

Add visual state badges to panel headers:
- Loading: small spinning amber dot next to title
- Error: red dot with tooltip showing error message
- Stale/Cached: dim amber "CACHED" badge
- Pass these as props: `loading?: boolean`, `error?: string`, `cached?: boolean`

### 5. Tab Bar for Multiple Screens per Panel
**File:** `frontend/src/components/Terminal/PanelV3.tsx`

Allow each panel to have multiple tabs:
- Tab bar below the header (28px, same glass style)
- Each tab shows screen name + close (x) button
- Active tab has amber underline
- Click tab to switch, middle-click to close
- Drag tabs between panels to move screens
- Add `tabs: { screen: ScreenType, ticker?: string }[]` to PanelConfig

### 6. Panel Keyboard Shortcuts
**File:** `frontend/src/components/Terminal/WorkspaceLayout.tsx` + `App.tsx`

- `Ctrl+1-4`: Focus panel 1-4
- `Ctrl+W`: Close focused panel
- `Ctrl+Shift+M`: Minimize/restore focused panel
- `Ctrl+Shift+F`: Maximize/restore focused panel
- `Ctrl+Tab`: Cycle focus to next panel

## Color/Style Constants
Use from `colors.ts`:
- Resize handle glow: `C.amber + '40'` idle, `C.amber` dragging
- Minimize icon color: `C.whiteDim` idle, `C.white` hover
- Tab bar: `background: C.glass`, active underline `C.amber`
- Loading dot: `C.amber` with `pulseGlow` animation
- Error dot: `C.red` with `borderBreathe` animation
