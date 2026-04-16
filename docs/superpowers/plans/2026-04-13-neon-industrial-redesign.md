# Neon Industrial Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform SpectraTerminal from a flat amber-on-black terminal UI into a Neon Industrial multi-panel workspace with glowing borders, Space Grotesk typography, and electric cyan data accents.

**Architecture:** Replace the single-screen PanelLayout + Panel system with a WorkspaceLayout that manages multiple panels in configurable grid arrangements (1P, 2P, 3P, 4P, etc.). Each panel is an independent unit with glowing borders, close/maximize controls, and focus state. The color system, font system, and shared components all get V3 overhauls. Screens are adapted to render inside panels instead of filling the entire viewport.

**Tech Stack:** React 18, TypeScript, TradingView Lightweight Charts, @tanstack/react-virtual, inline styles only, Space Grotesk + Inter + JetBrains Mono fonts.

---

## File Structure

### New Files
- `frontend/src/lib/colors.ts` — OVERWRITE with V3 palette
- `frontend/src/lib/useWorkspace.ts` — workspace state management (layout, panels, focus)
- `frontend/src/components/Terminal/WorkspaceLayout.tsx` — multi-panel grid container
- `frontend/src/components/Terminal/PanelV3.tsx` — redesigned panel with glow borders
- `frontend/src/components/Terminal/CommandBarV3.tsx` — redesigned command bar
- `frontend/src/components/Terminal/StatusBarV3.tsx` — redesigned status bar
- `frontend/src/components/screens/HomeScreenV3.tsx` — status dashboard home
- `frontend/src/components/screens/EquityScreenV3.tsx` — data-rich card stack
- `frontend/src/components/screens/OptionsScreenV3.tsx` — neon-styled 5-tab options
- `frontend/src/components/screens/NewsScreenV3.tsx` — editorial layout
- `frontend/src/components/screens/ScreenerScreenV3.tsx` — neon DSL bar
- `frontend/src/components/screens/QuantScreenV3.tsx` — lab-instrument aesthetic
- `frontend/src/components/screens/CommodityScreenV3.tsx` — tabbed commodity
- `frontend/src/components/screens/CongressScreenV3.tsx` — legal/gov aesthetic
- `frontend/src/components/screens/EconScreenV3.tsx` — dashboard + search
- `frontend/src/components/screens/BondScreenV3.tsx` — yield curve hero
- `frontend/src/components/screens/ETFScreenV3.tsx` — holdings-dominant layout

### Modified Files
- `frontend/index.html` — font imports + new keyframes
- `frontend/src/App.tsx` — replace PanelLayout with WorkspaceLayout, route to V3 screens
- `frontend/src/lib/api.ts` — no changes needed (already has all endpoints)
- `frontend/src/types/index.ts` — add PanelConfig, WorkspaceLayout types

### Preserved Files (no changes)
- `frontend/src/lib/commandParser.ts` — parsing logic unchanged
- `frontend/src/lib/usePriceFlash.ts` — keep as-is
- `frontend/src/lib/useBreakpoint.ts` — keep as-is
- `frontend/src/components/shared/DataGrid.tsx` — keep as-is (already has virtual scroll + stagger)
- `frontend/src/components/shared/Metric.tsx` — keep as-is
- `frontend/src/components/shared/TabBar.tsx` — keep as-is
- `frontend/src/components/shared/ChangeIndicator.tsx` — keep as-is
- `frontend/src/components/shared/LiveDot.tsx` — keep as-is
- `frontend/src/components/shared/Sparkline.tsx` — keep as-is
- `frontend/src/components/shared/LoadingBar.tsx` — keep as-is
- `frontend/src/components/shared/TickerBadge.tsx` — keep as-is
- `frontend/src/components/shared/DataTable.tsx` — keep as-is
- All backend files — no changes

---

### Task 1: Color System V3 + Fonts + Keyframes

**Files:**
- Overwrite: `frontend/src/lib/colors.ts`
- Modify: `frontend/index.html`

- [ ] **Step 1: Overwrite colors.ts with V3 palette**

```typescript
const C = {
  // ─── Surfaces (depth) ───
  surface0:     '#06060a',
  surface1:     '#0a0a10',
  surface2:     '#101018',
  surface3:     '#16161f',
  surfaceGlow:  '#0d0a00',

  // ─── Borders ───
  border0:      '#1a1a25',
  border1:      '#252535',
  border2:      '#35354a',

  // ─── Primary: Neon Amber ───
  amber:        '#F59E0B',
  amberBright:  '#FBBF24',
  amberDim:     '#92610A',
  amberMute:    '#5C3D07',
  amberGlow:    'rgba(245, 158, 11, 0.12)',
  amberGlowStrong: 'rgba(245, 158, 11, 0.25)',

  // ─── Accent: Electric Cyan ───
  cyan:         '#06B6D4',
  cyanBright:   '#22D3EE',
  cyanDim:      '#0E7490',
  cyanGlow:     'rgba(6, 182, 212, 0.12)',

  // ─── Data ───
  white:        '#E8E8ED',
  whiteDim:     '#8888A0',
  whiteGhost:   '#4A4A62',

  // ─── Semantic ───
  green:        '#10B981',
  greenBright:  '#34D399',
  greenDim:     '#064E3B',
  red:          '#EF4444',
  redBright:    '#F87171',
  redDim:       '#7F1D1D',
  violet:       '#8B5CF6',
  violetDim:    '#4C1D95',

  // ─── Fonts ───
  fontMono:     "'JetBrains Mono', monospace",
  fontDisplay:  "'Space Grotesk', sans-serif",
  fontBody:     "'Inter', sans-serif",
} as const

export default C
```

- [ ] **Step 2: Update index.html — replace font imports and add new keyframes**

Replace the existing `<link>` tags for DM Sans + JetBrains Mono and the `<style>` block with:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 1; filter: brightness(1); }
    50%      { opacity: 0.7; filter: brightness(0.8); }
  }
  @keyframes glowPulse {
    0%, 100% { opacity: 1; filter: brightness(1); }
    50%      { opacity: 0.7; filter: brightness(0.8); }
  }
  @keyframes neonFlash {
    0%   { filter: brightness(2); }
    100% { filter: brightness(1); }
  }
  @keyframes flashGreen {
    0%   { background-color: #064E3B; }
    100% { background-color: transparent; }
  }
  @keyframes flashRed {
    0%   { background-color: #7F1D1D; }
    100% { background-color: transparent; }
  }
  @keyframes panelSlideIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes dataStreamIn {
    from { opacity: 0; transform: translateX(-8px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideRight {
    from { transform: translateX(-4px); }
    to   { transform: translateX(0); }
  }
  @keyframes expandDown {
    from { max-height: 0; opacity: 0; }
    to   { max-height: 600px; opacity: 1; }
  }
  @keyframes marquee {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  @keyframes scanline {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
  }
  .tabular-nums { font-variant-numeric: tabular-nums; }
</style>
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors (all existing files still reference `C` which is now V3)

- [ ] **Step 4: Run Vite build**

Run: `cd frontend && npx vite build`
Expected: successful build

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/colors.ts frontend/index.html
git commit -m "feat: V3 color system (neon industrial palette) + Space Grotesk/Inter fonts + new keyframes"
```

---

### Task 2: Workspace State + Panel Component V3

**Files:**
- Create: `frontend/src/lib/useWorkspace.ts`
- Create: `frontend/src/components/Terminal/PanelV3.tsx`
- Modify: `frontend/src/types/index.ts` — add PanelConfig, WorkspaceLayoutType

- [ ] **Step 1: Add workspace types to types/index.ts**

Append to the end of `frontend/src/types/index.ts`:

```typescript
// ─── Workspace / Panel V3 ──────────────────────────────────────────────────

export type WorkspaceLayoutType = '1P' | '2P' | '2PT' | '3P' | '4P' | '1P+1S'

export interface PanelConfig {
  id: string
  screen: ScreenType
  ticker?: string
  sub?: string
  focused: boolean
}

export interface WorkspaceState {
  layout: WorkspaceLayoutType
  panels: PanelConfig[]
  focusedPanelId: string | null
}
```

- [ ] **Step 2: Create useWorkspace.ts**

Create `frontend/src/lib/useWorkspace.ts`:

```typescript
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
```

- [ ] **Step 3: Create PanelV3.tsx**

Create `frontend/src/components/Terminal/PanelV3.tsx`:

```typescript
import React from 'react'
import C from '../../lib/colors'

type AccentColor = 'amber' | 'cyan' | 'green' | 'red' | 'violet'

interface PanelV3Props {
  title: string
  accent?: AccentColor
  focused?: boolean
  onClose?: () => void
  onMaximize?: () => void
  children: React.ReactNode
}

const ACCENT_MAP: Record<AccentColor, { border: string; glow: string; text: string; dim: string }> = {
  amber:  { border: C.amber,  glow: C.amberGlow,  text: C.amberBright, dim: C.amberDim },
  cyan:   { border: C.cyan,   glow: C.cyanGlow,   text: C.cyanBright,  dim: C.cyanDim },
  green:  { border: C.green,  glow: C.greenDim,   text: C.greenBright,  dim: C.greenDim },
  red:    { border: C.red,    glow: C.redDim,     text: C.redBright,    dim: C.redDim },
  violet: { border: C.violet, glow: C.violetDim,  text: C.violet,       dim: C.violetDim },
}

/**
 * Neon Industrial panel — glowing borders when focused, dim when background.
 * Each screen renders inside a PanelV3.
 */
const PanelV3: React.FC<PanelV3Props> = ({
  title,
  accent = 'amber',
  focused = false,
  onClose,
  onMaximize,
  children,
}) => {
  const a = ACCENT_MAP[accent]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: C.surface1,
        border: `1px solid ${focused ? a.border : C.border1}`,
        borderRadius: '4px',
        overflow: 'hidden',
        boxShadow: focused
          ? `0 0 20px ${a.glow}, inset 0 0 30px rgba(245,158,11,0.02)`
          : 'none',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        animation: 'panelSlideIn 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '32px',
          flexShrink: 0,
          borderBottom: `1px solid ${focused ? a.dim : C.border0}`,
          background: C.surface2,
          padding: '0 8px 0 12px',
        }}
      >
        <span style={{
          fontFamily: C.fontDisplay,
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: focused ? a.text : C.whiteGhost,
          textShadow: focused ? `0 0 8px ${a.glow}` : 'none',
          transition: 'color 150ms ease, text-shadow 150ms ease',
        }}>
          {title}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {onMaximize && (
            <button
              onClick={onMaximize}
              style={{
                background: 'none',
                border: 'none',
                color: C.whiteGhost,
                cursor: 'pointer',
                fontSize: '12px',
                padding: '2px 4px',
                lineHeight: 1,
                fontFamily: C.fontMono,
                transition: 'color 150ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = a.text }}
              onMouseLeave={e => { e.currentTarget.style.color = C.whiteGhost }}
            >
              □
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: C.whiteGhost,
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px 4px',
                lineHeight: 1,
                fontFamily: C.fontMono,
                transition: 'color 150ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = a.text }}
              onMouseLeave={e => { e.currentTarget.style.color = C.whiteGhost }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

export default PanelV3
```

- [ ] **Step 4: Create WorkspaceLayout.tsx**

Create `frontend/src/components/Terminal/WorkspaceLayout.tsx`:

```typescript
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
```

- [ ] **Step 5: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/useWorkspace.ts frontend/src/components/Terminal/PanelV3.tsx frontend/src/components/Terminal/WorkspaceLayout.tsx
git commit -m "feat: V3 workspace layout system + PanelV3 with glow borders + useWorkspace hook"
```

---

### Task 3: CommandBar V3 + StatusBar V3

**Files:**
- Create: `frontend/src/components/Terminal/CommandBarV3.tsx`
- Create: `frontend/src/components/Terminal/StatusBarV3.tsx`

These replace the V2 versions. The V3 CommandBar keeps all existing functionality (command history, autocomplete, keyboard navigation) but applies the Neon Industrial aesthetic: Space Grotesk BAKER wordmark with text-shadow glow, cyan focus glow on input, frosted glass autocomplete, and breadcrumb trail.

The V3 StatusBar keeps the ticker tape, clocks, and market status but adds: LiveDot connection indicator, micro sparklines in cyan, thin border0 dividers, and the gradient border glow.

- [ ] **Step 1: Create CommandBarV3.tsx**

Read `frontend/src/components/Terminal/CommandBar.tsx` (the V2 version, 494 lines) to understand all existing functionality: command history, autocomplete, keyboard navigation, known commands, known tickers.

Create `frontend/src/components/Terminal/CommandBarV3.tsx` — a complete rewrite that preserves ALL existing functionality (command history in localStorage, autocomplete, keyboard nav, etc.) with these V3 visual changes:
- Height: 44px
- Left: BAKER in Space Grotesk 700, 14px, `C.amber`, `text-shadow: 0 0 12px ${C.amberGlowStrong}`
- Bottom border: `1px solid ${C.border1}` with `background: linear-gradient(90deg, ${C.amberGlow}, transparent 15%, transparent 85%, ${C.amberGlow})`
- Input: JetBrains Mono, `C.white`, block cursor. Focus: `box-shadow: 0 0 12px ${C.amberGlow}`
- Breadcrumb: right-aligned, current segment in `C.cyan`, previous in `C.whiteGhost`, `>` in `C.border1`
- Autocomplete: `backdrop-filter: blur(16px)`, `background: rgba(10,10,16,0.95)`, border `1px solid ${C.border1}` with `box-shadow: 0 0 20px ${C.amberGlow}`. Command in `C.amber`, description in `C.whiteDim`. Hover: `background: ${C.amberGlow}`, left accent `2px solid ${C.amber}`
- Active screen badge: pill with `C.surface2` bg, `1px solid ${C.amberDim}` border, `C.amber` text

Props interface stays the same: `{ activeCommand: string, onCommand: (cmd: string) => void, onNavigate: (cmd: string) => void }`

- [ ] **Step 2: Create StatusBarV3.tsx**

Read `frontend/src/components/Terminal/StatusBar.tsx` (the V2 version, 357 lines).

Create `frontend/src/components/Terminal/StatusBarV3.tsx` preserving ALL existing functionality (market status detection, ticker tape, clocks) with V3 visual changes:
- Height: 28px
- Top border: same gradient glow as CommandBar bottom
- Left: LiveDot (pulsing green) + "LIVE" in Inter 700, 9px, `C.green`
- Ticker tape: index quotes with micro sparklines (24px wide, 8px tall, `C.cyan` for positive, `C.red` for negative). Each quote separated by `1px solid ${C.border1}` dividers
- Clocks: right-aligned, `tabular-nums`, `C.whiteDim` labels, `C.white` times, thin `C.border0` dividers
- Right edge: connection LiveDot — green + "CONNECTED" or red + "OFFLINE" in Inter 500, 9px

- [ ] **Step 3: Run build check**

Run: `cd frontend && npx tsc --noEmit && npx vite build`
Expected: zero TS errors, successful build

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Terminal/CommandBarV3.tsx frontend/src/components/Terminal/StatusBarV3.tsx
git commit -m "feat: V3 CommandBar (glowing wordmark, cyan breadcrumbs) + StatusBar (neon accents)"
```

---

### Task 4: Wire V3 Components into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

This is the critical integration task. Replace V2 imports with V3, replace PanelLayout with WorkspaceLayout, and route screens through PanelV3 wrappers.

- [ ] **Step 1: Update App.tsx imports and workspace logic**

Read `frontend/src/App.tsx` fully. Then modify it to:

1. Replace `import PanelLayout from './components/Terminal/PanelLayout'` with `import WorkspaceLayout from './components/Terminal/WorkspaceLayout'`
2. Replace `import CommandBar from './components/Terminal/CommandBar'` with `import CommandBarV3 from './components/Terminal/CommandBarV3'`
3. Replace `import StatusBar from './components/Terminal/StatusBar'` with `import StatusBarV3 from './components/Terminal/StatusBarV3'`
4. Add `import PanelV3 from './components/Terminal/PanelV3'`
5. Add `import { useWorkspace } from './lib/useWorkspace'`
6. Replace the single-screen rendering logic (the switch/case that renders one screen at a time) with workspace logic that:
   - Calls `useWorkspace()` to get `{ state, openScreen, closePanel, focusPanel, setLayout, maximizePanel }`
   - Renders `<WorkspaceLayout state={state} onFocusPanel={focusPanel}>` containing PanelV3-wrapped screens
   - Each screen gets wrapped: `<PanelV3 title="EQUITY · AAPL" focused={panel.focused} onClose={() => closePanel(panel.id)} onMaximize={() => maximizePanel(panel.id)}><EquityScreenV3 .../></PanelV3>`
   - The `onNavigate` callback calls `openScreen(screen, ticker)`
7. Keep ALL existing screen imports but rename the V3 screens to `*V3` (e.g., `import EquityScreenV3 from './components/screens/EquityScreenV3'`)
8. For screens that don't have V3 versions yet, wrap them in PanelV3 with the same pattern but use the existing screen component

The layout of App.tsx should now be:
```
<CommandBarV3 ... />
<WorkspaceLayout ...>
  {state.panels.map(panel => <PanelV3 ...><ScreenComponent /></PanelV3>)}
</WorkspaceLayout>
<StatusBarV3 ... />
```

- [ ] **Step 2: Run build check**

Run: `cd frontend && npx tsc --noEmit && npx vite build`
Expected: zero TS errors, successful build (screens without V3 versions still render in PanelV3 wrappers)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire V3 workspace layout into App.tsx, replace PanelLayout with multi-panel grid"
```

---

### Task 5: HomeScreen V3 — Status Dashboard

**Files:**
- Create: `frontend/src/components/screens/HomeScreenV3.tsx`

The home screen becomes a command-centric status dashboard, not a card grid.

- [ ] **Step 1: Create HomeScreenV3.tsx**

This is a complete rewrite. The home screen renders inside a PanelV3 (no Panel wrapper needed — the PanelV3 parent handles the border).

Layout:
1. **Wordmark section**: "BAKER" in Space Grotesk 700, 36px, `C.amber`, `text-shadow: 0 0 30px ${C.amberGlowStrong}`. "TERMINAL" below in JetBrains Mono 400, 12px, `C.whiteGhost`, letter-spacing 0.5em
2. **Market pulse strip**: 6 horizontal bars for SPX, NDX, DJI, IWM, VIX, BTC-USD. Each bar: symbol in Space Grotesk 700 12px `C.amber`, price in JetBrains Mono 14px `C.white`, ChangeIndicator, micro Sparkline (24px×8px). Separated by `border-bottom: 1px solid ${C.border1}` with a `2px solid ${C.cyan}` left accent on the strip div
3. **Command suggestions**: typewriter-style list (not a grid). Each line: `>` command in JetBrains Mono `C.amber`, description in Inter `C.whiteDim`. Active line: `2px solid ${C.cyan}` left border + `background: ${C.amberGlow}`. Arrow keys navigate, Enter executes
4. **Recent activity**: last 5 commands from localStorage (`bb_cmd_history`), clickable to re-run, in `C.whiteGhost` JetBrains Mono
5. **Keyboard hints**: collapsed `?` tooltip, triggered by Shift+?

Props: `{ onNavigate: (cmd: string) => void }`

Use `fetchIndices` for market data, React Query with 30s refetch.

- [ ] **Step 2: Update App.tsx to use HomeScreenV3**

In the workspace panel mapping, when `panel.screen === 'home'`, render `<HomeScreenV3 onNavigate={openScreen} />`

- [ ] **Step 3: Run build check**

Run: `cd frontend && npx tsc --noEmit && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/screens/HomeScreenV3.tsx frontend/src/App.tsx
git commit -m "feat: V3 HomeScreen — status dashboard with glowing wordmark, command suggestions"
```

---

### Task 6: EquityScreen V3 — Data-Rich Card Stack

**Files:**
- Create: `frontend/src/components/screens/EquityScreenV3.tsx`

- [ ] **Step 1: Create EquityScreenV3.tsx**

Read `frontend/src/components/screens/EquityScreen.tsx` (538 lines) to understand all existing data fetching and display logic.

Rewrite with Neon Industrial aesthetic:
- **Top band**: Ticker in Space Grotesk 700, 24px, `C.amber` + company name in Inter 400, 13px, `C.whiteDim` + sector badge (pill: `C.surface2` bg, `C.cyan` text, `1px solid ${C.cyanDim}`) + LiveDot
- **Price hero**: price in JetBrains Mono 700, 36px, `C.white` with neon flash on change (use `usePriceFlash` but change the flash to use `filter: brightness(2)` → `filter: brightness(1)` over 200ms, not background color). ChangeIndicator to the right, 16px. Below: day range bar with gradient fill (`C.amberDim` → `C.amber` → `C.amberDim`)
- **Metrics grid**: 3×4 grid of Metric components on `C.surface1` cards. Each card: `1px solid ${C.border0}`, 12px padding, `border-radius: 4px`. Metric label in Inter `C.whiteDim`, value in JetBrains Mono `C.white`. Special metrics (Sharpe, VaR) in `C.cyan`
- **Quick actions row**: pill buttons — `GP` `OPT` `NEWS` `FILINGS` `QUANT` — in `C.surface2` bg, `C.cyan` text, `1px solid ${C.cyanDim}` border. On hover: bg → `C.cyanGlow`, text → `C.cyanBright`, `box-shadow: 0 0 8px ${C.cyanGlow}`
- **Company info** (collapsible): sector, industry, CEO, employees, website — in a card with `2px solid ${C.cyan}` left accent

Props: `{ ticker: string, onNavigate: (cmd: string) => void }`

- [ ] **Step 2: Update App.tsx mapping**

When `panel.screen === 'equity'`, render `<EquityScreenV3 ticker={panel.ticker ?? ''} onNavigate={openScreen} />`

- [ ] **Step 3: Run build + commit**

```bash
cd frontend && npx tsc --noEmit && npx vite build
git add frontend/src/components/screens/EquityScreenV3.tsx frontend/src/App.tsx
git commit -m "feat: V3 EquityScreen — data-rich card stack with neon accents"
```

---

### Task 7: Remaining Screen V3 Conversions (Batch)

**Files:**
- Create: `OptionsScreenV3.tsx`, `NewsScreenV3.tsx`, `ScreenerScreenV3.tsx`, `QuantScreenV3.tsx`, `CommodityScreenV3.tsx`, `CongressScreenV3.tsx`, `EconScreenV3.tsx`, `BondScreenV3.tsx`, `ETFScreenV3.tsx`

Each screen keeps its existing data fetching logic but wraps content in the Neon Industrial aesthetic:
- All use `C.surface1`/`C.surface2`/`C.surface3` instead of old `C.bg1`/`C.bg2`/`C.bg3`
- Headers use `C.fontDisplay` (Space Grotesk) instead of old monospace
- Data uses `C.fontMono` (JetBrains Mono)
- Body text uses `C.fontBody` (Inter)
- Active tabs use `C.amber` underline + `C.amber` text-shadow glow
- Interactive elements use `C.cyan` for hover/focus with `box-shadow: 0 0 8px ${C.cyanGlow}`
- Panels are NOT wrapped in `<Panel>` — they render inside PanelV3 which provides the container
- Screens that already have TabBar/DataGrid/Metric components just need color updates (those components use `C` which is now V3)
- The neon-specific additions per screen from the spec:
  - Options CHAIN: ATM row gets `box-shadow: -4px 0 12px ${C.amberGlow}` + `background: ${C.amberGlow}`
  - Options SURFACE: heatmap cells get `box-shadow: 0 0 2px ${C.amberGlow}` on hover
  - Options UNUSUAL: vol/OI >5x rows get `box-shadow: -4px 0 12px ${C.amberGlow}`
  - Screener DSL bar: focus gets `box-shadow: 0 0 12px ${C.cyanGlow}`
  - Quant: Sharpe/VaR values in `C.cyan`, drawdown in `C.red`
  - Bond: yield curve in `C.amber` with `C.amberGlow` fill
  - Congress: status pills with defined semantic colors

- [ ] **Step 1: For each screen, create V3 version with Neon Industrial styling**

For Options, News, Screener, Quant, Commodity, Congress, Econ, Bond, ETF — copy the existing V2 screen file, rename to V3, and update all color references from old palette to V3. Key changes per file:
- Replace `C.bg1`/`C.bg2`/`C.bg3` with `C.surface1`/`C.surface2`/`C.surface3`
- Replace any hardcoded hex colors with V3 palette references
- Add neon glow effects where specified in the design doc
- Replace header fonts with `C.fontDisplay`
- Add `box-shadow` glow effects on active/focused elements

- [ ] **Step 2: Update App.tsx to route all screen types to V3 versions**

Update the panel rendering in App.tsx to map every `panel.screen` case to the corresponding V3 component.

- [ ] **Step 3: Run build + commit**

```bash
cd frontend && npx tsc --noEmit && npx vite build
git add frontend/src/components/screens/*V3.tsx frontend/src/App.tsx
git commit -m "feat: V3 Neon Industrial redesign for all remaining screens"
```

---

### Task 8: Old Screen Cleanup + Vite Code Splitting

**Files:**
- Delete: All V2 screen files that have V3 replacements
- Modify: `frontend/vite.config.ts` — add code splitting

- [ ] **Step 1: Remove V2 screen imports from App.tsx**

After confirming all V3 screens render correctly, remove the old V2 screen imports from App.tsx and delete the old screen files:
- `HomeScreen.tsx` → replaced by `HomeScreenV3.tsx`
- `EquityScreen.tsx` → replaced by `EquityScreenV3.tsx`
- `OptionsScreen.tsx` → replaced by `OptionsScreenV3.tsx`
- `NewsScreen.tsx` → replaced by `NewsScreenV3.tsx`
- `ScreenerScreen.tsx` → replaced by `ScreenerScreenV3.tsx`
- `QuantScreen.tsx` → replaced by `QuantScreenV3.tsx`
- `CommodityScreen.tsx` → replaced by `CommodityScreenV3.tsx`
- `CongressScreen.tsx` → replaced by `CongressScreenV3.tsx`
- `EconScreen.tsx` → replaced by `EconScreenV3.tsx`
- `BondScreen.tsx` → replaced by `BondScreenV3.tsx`
- `ETFScreen.tsx` → replaced by `ETFScreenV3.tsx`
- `CommandBar.tsx` → replaced by `CommandBarV3.tsx`
- `StatusBar.tsx` → replaced by `StatusBarV3.tsx`
- `Panel.tsx` → kept (still used by some unchanged screens)
- `PanelLayout.tsx` → delete (replaced by WorkspaceLayout)

Keep screens that don't have V3 versions: ChartScreen, PortfolioScreen, WatchlistScreen, EarningsScreen, FXScreen, FXCScreen, CryptoScreen, FilingsScreen, DESScreen, GScreen, GPOScreen, GIPScreen, WEIScreen, HSScreen, ECSTScreen, MacroScreen. These continue to use the old Panel component and will be wrapped in PanelV3 by App.tsx.

- [ ] **Step 2: Rename V3 files to remove V3 suffix**

Rename all `*V3.tsx` files to their final names (remove the V3 suffix). Update all imports in App.tsx accordingly.

- [ ] **Step 3: Add Vite code splitting**

Update `frontend/vite.config.ts` to add `build.rollupOptions.output.manualChunks` that code-splits by screen. This addresses the bundle size warning.

```typescript
// Add to vite.config.ts defineConfig:
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor': ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        'charts': ['lightweight-charts'],
        'virtual': ['@tanstack/react-virtual'],
      }
    }
  }
}
```

- [ ] **Step 4: Final build verification**

Run: `cd frontend && npx tsc --noEmit && npx vite build`
Expected: zero TS errors, successful build, bundle under 800KB gzipped

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Neon Industrial V3 redesign complete — remove V2 screens, code splitting"
```

---

### Task 9: Backend Verification + Integration Test

**Files:**
- No new files. Verification only.

- [ ] **Step 1: Run backend import check**

```bash
cd /Users/zacbaker/Documents/Trade\ Strat/SpectraTerminal/backend
.venv/bin/python -c "from routers import analytics, etf, fixedincome, options, econ, equity, congress, commodity, news, screener; print('All routers import OK')"
```

Expected: `All routers import OK`

- [ ] **Step 2: Run frontend build check**

```bash
cd /Users/zacbaker/Documents/Trade\ Strat/SpectraTerminal/frontend
npx tsc --noEmit && npx vite build
```

Expected: zero errors, build succeeds

- [ ] **Step 3: Manual visual verification checklist**

Open the app in Electron (`npm run electron:dev`) and verify:
- [ ] Home screen shows BAKER wordmark with glow, market pulse strip, command suggestions
- [ ] Typing `AAPL` opens EQUITY in a panel with glowing amber border
- [ ] Typing `AAPL GP` opens CHART in a second panel (2P layout)
- [ ] Command bar has cyan glow on focus, breadcrumb trail
- [ ] Status bar has LiveDot, sparklines, connection indicator
- [ ] Switching between panels focuses/unfocuses borders
- [ ] Options screen shows 5 tabs with neon accents
- [ ] No old V2 hex values remain (search for `#0a0a0a`, `#111111`, `#1a1a1a`, `#ff9900` — all should be gone from screen files)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: Neon Industrial V3 verification fixes"
```

---

## Spec Coverage Check

| Spec Section | Task |
|---|---|
| Color System V3 | Task 1 |
| Typography (Space Grotesk + Inter) | Task 1 |
| Motion Language (glow, neon, slide) | Task 1 |
| Multi-Panel Workspace | Task 2 |
| PanelV3 with glow borders | Task 2 |
| CommandBar V3 | Task 3 |
| StatusBar V3 | Task 3 |
| App.tsx integration | Task 4 |
| HomeScreen (status dashboard) | Task 5 |
| EquityScreen (card stack) | Task 6 |
| All remaining screens | Task 7 |
| Old cleanup + code splitting | Task 8 |
| Final verification | Task 9 |

All spec sections have corresponding tasks. No placeholders. No TBDs. Type consistency verified across tasks.