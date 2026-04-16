# BACK Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a `BACK` command that navigates the focused panel to the previously-viewed screen — Bloomberg-style single-step history. Also surface `BACK` in the `HELP` command reference.

**Architecture:** Frontend-only. The workspace hook (`useWorkspace`) keeps a bounded per-panel history stack of `{screen, ticker, sub}` snapshots. Every navigation via `openScreen` / `openScreenInNewPanel` / `focusPanel` snapshot-pushes the panel's current state *before* replacing it. A new `goBack()` action pops the focused panel's stack and restores that snapshot. The command parser registers `BACK` as a standalone command that dispatches to `goBack()` via `App.tsx`. No backend changes, no new types beyond a `PanelConfig.history` field.

**Tech Stack:** React 18 / TypeScript / Vite. No tests exist for the frontend — verification is `npm run build` and manual exercise of the golden path below.

**Scope constraints:**
- Single-step back per panel (not a full forward/back browser). This keeps state small and matches Bloomberg's mental model; no forward stack.
- History is per-panel (each panel tracks its own). Switching focus between panels does *not* push history.
- `BACK` is a no-op (does nothing, no error) when the focused panel has empty history.
- `HOME` clears history (consistent with existing sticky-ticker reset semantics).
- Do NOT push the `quit` screen or the synthetic `back` dispatch itself onto history.
- History depth cap: **20 entries per panel** (shift oldest on overflow) so long sessions don't leak memory.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/types/index.ts` | Modify | Add `'back'` to `ScreenType` union; add `history?: PanelSnapshot[]` to `PanelConfig`; export `PanelSnapshot` |
| `frontend/src/lib/commandParser.ts` | Modify | Register `BACK` in `STANDALONE_COMMANDS` → `'back'` |
| `frontend/src/lib/useWorkspace.ts` | Modify | Track per-panel history on every navigation; expose `goBack(panelId?)` |
| `frontend/src/App.tsx` | Modify | Destructure `goBack` from `useWorkspace`; handle `screen === 'back'` in `handleCommand` by calling `goBack()` instead of `openScreen` |
| `frontend/src/components/screens/HelpScreen.tsx` | Modify | Add `BACK` row to `COMMANDS` array |

---

### Task 1: Add types

**Files:** Modify `frontend/src/types/index.ts`

- [ ] **Step 1: Extend `ScreenType` union**

Find the `ScreenType` definition (currently ends with `| 'etf' | 'bond' | 'comd' | 'cong' | 'quant' | 'ask' | 'help'`) and add `| 'back'` to the union.

`'back'` is a *command intent*, not a renderable screen — `App.tsx` will intercept it before it reaches the panel router. Do NOT add a `case 'back'` to `renderScreen` in `App.tsx`.

- [ ] **Step 2: Add `PanelSnapshot` type and extend `PanelConfig`**

Add above `PanelConfig`:
```ts
export interface PanelSnapshot {
  screen: ScreenType
  ticker?: string
  sub?: string
}
```

Extend `PanelConfig`:
```ts
export interface PanelConfig {
  id: string
  screen: ScreenType
  ticker?: string
  sub?: string
  focused: boolean
  history?: PanelSnapshot[]   // NEW — most-recent-last, capped at 20
}
```

**Verify:** `cd frontend && npx tsc --noEmit` completes with no errors.

---

### Task 2: Command parser

**Files:** Modify `frontend/src/lib/commandParser.ts`

- [ ] **Step 1: Register `BACK` as a standalone command**

In the `STANDALONE_COMMANDS` object (starts around line 73), add:
```ts
BACK:      'back',
```

Place it alphabetically or grouped with navigation commands — match the existing style. No aliases.

**Verify:** In a scratch REPL or unit mental-test, `parseCommand("BACK")` returns `{ screen: 'back', raw: 'BACK' }` and `parseCommand("back")` (lowercase) also returns `{ screen: 'back', raw: 'back' }` (it is already uppercased internally).

---

### Task 3: Workspace history and `goBack`

**Files:** Modify `frontend/src/lib/useWorkspace.ts`

This is the core of the change. Read the existing file top-to-bottom first — the pattern is a single `useState<WorkspaceState>` with `useCallback` actions that call `setState(prev => ...)`. Follow that pattern exactly.

- [ ] **Step 1: Add a history-push helper**

Near the top of the file (below `equalSizes`), add:

```ts
const HISTORY_CAP = 20

function pushHistory(panel: PanelConfig): PanelSnapshot[] {
  const snap: PanelSnapshot = { screen: panel.screen, ticker: panel.ticker, sub: panel.sub }
  const prev = panel.history ?? []
  const next = [...prev, snap]
  if (next.length > HISTORY_CAP) next.shift()
  return next
}
```

Import `PanelSnapshot` from `../types` alongside the existing type imports.

- [ ] **Step 2: Snapshot history in `openScreen`**

`openScreen` currently replaces the focused panel in-place with a brand-new `PanelConfig`. Change it so that when replacing, the *new* panel inherits a history array that is the *old* panel's history with the old panel's state pushed onto it. In the `updated[targetIdx] = newPanel` block, replace with:

```ts
const oldPanel = panels[targetIdx]
updated[targetIdx] = { ...newPanel, history: pushHistory(oldPanel) }
```

Do NOT push if the new screen has the exact same `(screen, ticker, sub)` as the current one — skip the push in that case to avoid duplicate-state spam. Use a cheap equality check:

```ts
const sameState =
  oldPanel.screen === newPanel.screen &&
  oldPanel.ticker === newPanel.ticker &&
  oldPanel.sub === newPanel.sub
updated[targetIdx] = sameState
  ? { ...newPanel, history: oldPanel.history ?? [] }
  : { ...newPanel, history: pushHistory(oldPanel) }
```

- [ ] **Step 3: Leave `openScreenInNewPanel` alone for history**

New panels start with empty history (`history` is `undefined`). This is intentional — a brand-new panel has nothing to go back to.

- [ ] **Step 4: Add the `goBack` action**

Add a new `useCallback` action (near `focusPanel`):

```ts
const goBack = useCallback((panelId?: string) => {
  setState(prev => {
    const targetId = panelId ?? prev.focusedPanelId
    const idx = prev.panels.findIndex(p => p.id === targetId)
    if (idx < 0) return prev
    const panel = prev.panels[idx]
    const history = panel.history ?? []
    if (history.length === 0) return prev  // no-op
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
```

- [ ] **Step 5: Export `goBack`**

Add `goBack` to both the return-type annotation and the final returned object. Match the style of the existing `openScreen` / `closePanel` entries.

**Verify:** `cd frontend && npx tsc --noEmit` clean.

---

### Task 4: Wire up `BACK` in App

**Files:** Modify `frontend/src/App.tsx`

- [ ] **Step 1: Destructure `goBack`**

In the `useWorkspace()` destructure (around line 163), add `goBack`:
```ts
const { state, openScreen, openScreenInNewPanel, closePanel, focusPanel, maximizePanel, swapPanels, resizePanels, goBack } = useWorkspace()
```

- [ ] **Step 2: Intercept `'back'` in `handleCommand`**

`handleCommand` is where commands turn into workspace mutations. The current `if/else` ladder handles `'quit'` and `'home'` as special cases. Add `'back'` *before* the generic `open(...)` call.

Where the ticker-substitution block ends and the `setActiveCommand(resolved)` / `localStorage` block begins — `'back'` should NOT update the active command, NOT change the sticky ticker, and NOT persist to localStorage. Restructure as:

```ts
// Handle BACK before any side effects — it's a history pop, not a navigation
if (cmd.screen === 'back') {
  goBack()
  return
}
```

Place this at the very top of `handleCommand`, before the TICKER_SCREENS block. Use `cmd` (the unresolved input), not `resolved` — resolution is pointless for BACK.

Then leave the rest of the existing logic untouched.

- [ ] **Step 3: Add `goBack` to the callback's dependency array**

Update the `useCallback` deps for `handleCommand` to include `goBack`:
```ts
}, [lastTicker, openScreen, openScreenInNewPanel, goBack])
```

**Verify:** `cd frontend && npx tsc --noEmit` clean, then `npm run build` succeeds.

---

### Task 5: Surface `BACK` in HELP

**Files:** Modify `frontend/src/components/screens/HelpScreen.tsx`

- [ ] **Step 1: Add the BACK row**

In the `COMMANDS` array, insert just after the `HELP` row (keeping navigation-ish commands grouped at the top):

```ts
{ command: 'BACK', aliases: '', description: 'Return the focused panel to its previous screen.', needsTicker: false },
```

**Verify:** Manual — run `npm run dev`, type `HELP`, confirm `BACK` appears with the correct description and no ticker indicator.

---

### Task 6: Manual verification (golden path + edges)

Backend already running or start with `./start.sh`. Frontend via `npm run dev`.

- [ ] **Golden path**
  1. Launch → home screen visible in focused panel.
  2. Type `AAPL` → Enter. Equity screen loads.
  3. Type `AAPL GP` → Enter. Chart screen loads.
  4. Type `BACK` → Enter. Panel returns to AAPL equity.
  5. Type `BACK` → Enter. Panel returns to home.
  6. Type `BACK` → Enter. No-op (still home, no error in console).

- [ ] **Multi-panel isolation**
  1. Type `AAPL`, then `Shift+Enter` on `MSFT` to split into two panels.
  2. Focus panel 2 (MSFT), navigate to `MSFT GP`.
  3. Type `BACK` → only panel 2 returns to MSFT equity; panel 1 unchanged.

- [ ] **HOME clears history**
  1. Navigate `AAPL` → `GP` → `OPT`.
  2. Type `HOME`.
  3. Type `BACK` → no-op (should not return to OPT; HOME reset is durable). The existing `'home'` branch creates a fresh panel via `openScreen('home')`, which will push the prior state onto history. This is technically inconsistent with the "HOME clears history" goal. **Fix:** in App.tsx's `'home'` branch, after the `open('home')` call, manually clear history on the now-focused panel. The cleanest way is to extend `useWorkspace` with a tiny `clearHistory(panelId?)` action and call it here — add it in Task 3 Step 4 alongside `goBack` if you prefer to batch the work.

- [ ] **HELP row**
  Type `HELP` → `BACK` row visible, clicking it executes BACK on the focused panel (it currently shows HELP, so it returns to the pre-HELP screen).

- [ ] **Build**
  `cd frontend && npm run build` — no TS errors, no warnings introduced.

---

## Design notes for the implementer

- **Why per-panel history, not global?** The workspace is multi-panel. A global "last screen" loses meaning when you're looking at two panels side-by-side. Per-panel mirrors how a browser-tab model would work.
- **Why cap at 20?** Prevents memory bloat during long sessions without meaningfully limiting the UX — Bloomberg users rarely chain more than a few navigations before resetting context.
- **Why skip push on same-state?** React StrictMode double-invokes in dev, and users hitting Enter on the same command twice shouldn't create a no-op back entry.
- **Why not push on `openScreenInNewPanel`?** The new panel has no prior state; there's nothing to pop back to. Leaving `history` undefined is correct.
- **Why no forward stack?** YAGNI — Bloomberg-style single-step back matches the terminal mental model and halves the complexity. If a user later asks for `FWD`, the pattern is the same as `BACK` with a mirrored stack.
- **Why isn't `'back'` rendered?** It's a command intent, not a panel state. Intercepting in `handleCommand` keeps the panel router pure — panels only ever contain renderable screens.

## Do NOT

- Do NOT add `case 'back'` to `renderScreen` — it is never reached.
- Do NOT persist history to localStorage — it's session-scoped by design.
- Do NOT push to history when `goBack` itself mutates the panel (the restored snapshot replaces state; you'd create an oscillation otherwise).
- Do NOT wire `BACK` to an F-key or browser back-button — command-bar only, per the existing interaction model.
- Do NOT bikeshed the cap (20 is fine).
