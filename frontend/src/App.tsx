import { useState, useCallback, useEffect, useRef } from 'react'
import type { ParsedCommand, ScreenType } from './types'
import { parseCommand } from './lib/commandParser'
import { useWorkspace } from './lib/useWorkspace'

import CommandBarV3 from './components/Terminal/CommandBarV3'
import StatusBarV3 from './components/Terminal/StatusBarV3'
import WorkspaceLayout from './components/Terminal/WorkspaceLayout'
import PanelV3 from './components/Terminal/PanelV3'
import BackgroundLayer from './components/Terminal/BackgroundLayer'

import EquityScreenV3   from './components/screens/EquityScreenV3'
import ChartScreen      from './components/screens/ChartScreen'
import OptionsScreen    from './components/screens/OptionsScreen'
import NewsScreen       from './components/screens/NewsScreen'
import MacroScreen      from './components/screens/MacroScreen'
import PortfolioScreen  from './components/screens/PortfolioScreen'
import WatchlistScreen  from './components/screens/WatchlistScreen'
import EarningsScreen   from './components/screens/EarningsScreen'
import ScreenerScreen   from './components/screens/ScreenerScreen'
import FXScreen         from './components/screens/FXScreen'
import FXCScreen        from './components/screens/FXCScreen'
import CryptoScreen     from './components/screens/CryptoScreen'
import FilingsScreen    from './components/screens/FilingsScreen'
import DESScreen        from './components/screens/DESScreen'
import GScreen          from './components/screens/GScreen'
import GPOScreen        from './components/screens/GPOScreen'
import GIPScreen        from './components/screens/GIPScreen'
import WEIScreen        from './components/screens/WEIScreen'
import HSScreen         from './components/screens/HSScreen'
import ECSTScreen       from './components/screens/ECSTScreen'
import ETFScreen        from './components/screens/ETFScreen'
import BondScreen       from './components/screens/BondScreen'
import CommodityScreen  from './components/screens/CommodityScreen'
import CongressScreen   from './components/screens/CongressScreen'
import QuantScreen      from './components/screens/QuantScreen'
import FAScreen         from './components/screens/FAScreen'
import EconScreen       from './components/screens/EconScreen'
import HomeScreenV3     from './components/screens/HomeScreenV3'
import HelpScreen       from './components/screens/HelpScreen'
import ChatScreen       from './components/screens/ChatScreen'
import { UpdateToast } from './components/UpdateToast'
import ChatNotificationToast from './components/ChatNotificationToast'
import { BugReportDialog } from './components/BugReportDialog'
import { WhatsNewDialog } from './components/WhatsNewDialog'

import C from './lib/colors'
import { accentFor } from './lib/screenAccents'
import { useAuth } from './lib/auth'
import LoginScreen from './components/Auth/LoginScreen'

function QuitModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onConfirm, onCancel])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: `${C.surface0}E6`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: C.surface1,
        border: `1px solid ${C.amber}`,
        padding: '32px 48px',
        textAlign: 'center',
        borderRadius: '4px',
        boxShadow: `0 0 30px ${C.amberGlow}`,
      }}>
        <div style={{
          color: C.amber,
          fontSize: '16px',
          fontWeight: 700,
          fontFamily: C.fontDisplay,
          letterSpacing: '0.1em',
          marginBottom: '24px',
        }}>
          ARE YOU SURE?
        </div>
        <div style={{
          color: C.amberDim,
          fontSize: '12px',
          fontFamily: C.fontBody,
          marginBottom: '32px',
        }}>
          This will close SpectraTerminal.
        </div>
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center' }}>
          <button
            onClick={onConfirm}
            autoFocus
            style={{
              background: C.amber,
              color: C.surface0,
              border: 'none',
              padding: '8px 24px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: C.fontDisplay,
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            YES
          </button>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              color: C.amberDim,
              border: `1px solid ${C.amberMute}`,
              padding: '8px 24px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: C.fontDisplay,
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            NO
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── F-key → command map ────────────────────────────────────────────────────
const FKEY_COMMANDS: Record<string, string> = {
  F1:  'WLT',
  F2:  'PORT',
  F3:  'MACRO',
  F4:  'ECON',
  F5:  'N',
  F6:  'EARN',
  F7:  'SCR',
  F8:  'FX',
  F9:  'CRYPTO',
  F10: 'MACRO',
}

// ─── Screen title generator ────────────────────────────────────────────────
function screenTitle(screen: ScreenType, ticker?: string): string {
  const labels: Record<string, string> = {
    equity: 'EQUITY', chart: 'CHART', options: 'OPTIONS', news: 'NEWS',
    filings: 'FILINGS', portfolio: 'PORTFOLIO', watchlist: 'WATCHLIST',
    econ: 'ECON', earnings: 'EARNINGS', screener: 'SCREENER',
    fx: 'FX', fxc: 'FXC', crypto: 'CRYPTO', macro: 'MACRO',
    home: 'HOME', des: 'DES', graph: 'GRAPH', gpo: 'GPO', gip: 'GIP',
    wei: 'WEI', hs: 'HS', ecst: 'ECST', etf: 'ETF', bond: 'BOND',
    comd: 'COMD', cong: 'CONG', quant: 'QUANT', fa: 'FA', ask: 'ASK', help: 'HELP',
    chat: 'CHAT',
  }
  const label = labels[screen] ?? screen.toUpperCase()
  return ticker ? `${label} · ${ticker}` : label
}

// ─── Main terminal (renders only when authenticated) ─────────────────────────
function TerminalApp() {
  const [activeCommand, setActiveCommand] = useState<ParsedCommand | null>(null)
  const [showQuitModal, setShowQuitModal] = useState(false)
  const [bugOpen, setBugOpen] = useState(false)
  const [lastError, setLastError] = useState<string | undefined>(undefined)
  const { state, openScreen, openScreenInNewPanel, closePanel, focusPanel, maximizePanel, swapPanels, resizePanels, goBack, clearHistory } = useWorkspace()
  const focusedPanelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handler = (e: ErrorEvent) => setLastError(`${e.message} @ ${e.filename}:${e.lineno}`)
    window.addEventListener('error', handler)
    return () => window.removeEventListener('error', handler)
  }, [])

  // Sticky ticker: persisted so it survives page refresh
  const [lastTicker, setLastTicker] = useState<string>(() => {
    try {
      const t = localStorage.getItem('bb_last_ticker')
      if (t) return t
      const saved = localStorage.getItem('bb_last_command')
      if (saved) {
        const cmd = JSON.parse(saved) as ParsedCommand
        return cmd.ticker ?? ''
      }
    } catch { /* ignore */ }
    return ''
  })

  const handleCommand = useCallback((cmd: ParsedCommand, inNewPanel = false) => {
    // Handle BACK before any side effects — it's a history pop, not a navigation
    if (cmd.screen === 'back') {
      goBack()
      return
    }

    // If a ticker-required screen has no ticker, substitute the last-used ticker
    const TICKER_SCREENS = new Set<ScreenType>([
      'equity', 'chart', 'options', 'filings', 'des', 'gpo', 'gip', 'news',
      'etf', 'bond', 'comd', 'cong', 'quant', 'fa',
    ])
    let resolved = cmd
    if (!cmd.ticker && TICKER_SCREENS.has(cmd.screen) && lastTicker) {
      resolved = { ...cmd, ticker: lastTicker }
    }
    // Update sticky ticker whenever one is explicitly provided
    if (resolved.ticker && TICKER_SCREENS.has(resolved.screen)) {
      setLastTicker(resolved.ticker)
      try { localStorage.setItem('bb_last_ticker', resolved.ticker) } catch { /* ignore */ }
    }
    setActiveCommand(resolved)
    try {
      localStorage.setItem('bb_last_command', JSON.stringify(resolved))
    } catch { /* ignore */ }

    // Open in workspace
    const open = inNewPanel ? openScreenInNewPanel : openScreen
    if (resolved.screen === 'quit') {
      setShowQuitModal(true)
    } else if (resolved.screen === 'bugreport') {
      setBugOpen(true)
    } else if (resolved.screen === 'home') {
      open('home')
      clearHistory()
      setActiveCommand(null)
      setLastTicker('')
      try { localStorage.removeItem('bb_last_ticker') } catch { /* ignore */ }
      try { localStorage.removeItem('bb_last_command') } catch { /* ignore */ }
    } else {
      open(resolved.screen, resolved.ticker, resolved.sub)
    }
  }, [lastTicker, openScreen, openScreenInNewPanel, goBack])

  // Allow screens to trigger navigation programmatically
  const handleNavigate = useCallback((raw: string) => {
    const cmd = parseCommand(raw)
    handleCommand(cmd)
  }, [handleCommand])

  // Command bar: Shift+Enter opens in new panel
  const handleCommandNewPanel = useCallback((cmd: ParsedCommand) => {
    handleCommand(cmd, true)
  }, [handleCommand])

  // F-key shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = FKEY_COMMANDS[e.key]
      if (cmd && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleNavigate(cmd)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleNavigate])

  // Handle quit
  const handleQuit = useCallback(() => {
    setShowQuitModal(false)
    setActiveCommand(null)
    setTimeout(() => {
      if (window.electronAPI?.quit) {
        window.electronAPI.quit()
      } else {
        window.close()
      }
    }, 100)
  }, [])

  // ── Render screen for a panel ──────────────────────────────────────────────
  const renderScreen = (screen: ScreenType, ticker?: string, sub?: string) => {
    switch (screen) {
      case 'equity':
        return ticker
          ? <EquityScreenV3 ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'chart':
        return ticker
          ? <ChartScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'options':
        return ticker
          ? <OptionsScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'news':
        return <NewsScreen ticker={ticker} onNavigate={handleNavigate} />

      case 'filings':
        return ticker
          ? <FilingsScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'des':
        return ticker
          ? <DESScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'graph':
        return <GScreen graphId={ticker} onNavigate={handleNavigate} />

      case 'gpo':
        return ticker
          ? <GPOScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'gip':
        return ticker
          ? <GIPScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'wei':
        return <WEIScreen onNavigate={handleNavigate} />

      case 'hs':
        return <HSScreen onNavigate={handleNavigate} />

      case 'ecst':
        return <ECSTScreen onNavigate={handleNavigate} />

      case 'etf':
        return ticker
          ? <ETFScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'bond':
        return <BondScreen ticker={ticker} onNavigate={handleNavigate} />

      case 'comd':
        return <CommodityScreen onNavigate={handleNavigate} />

      case 'cong':
        return <CongressScreen onNavigate={handleNavigate} />

      case 'quant':
        return ticker
          ? <QuantScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'fa':
        return ticker
          ? <FAScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreenV3 onNavigate={handleNavigate} />

      case 'portfolio':
        return <PortfolioScreen onNavigate={handleNavigate} />

      case 'watchlist':
        return <WatchlistScreen onNavigate={handleNavigate} />

      case 'econ':
        return <EconScreen onNavigate={handleNavigate} />

      case 'earnings':
        return <EarningsScreen onNavigate={handleNavigate} />

      case 'screener':
        return <ScreenerScreen onNavigate={handleNavigate} />

      case 'fx':
        return <FXScreen onNavigate={handleNavigate} />

      case 'fxc':
        return <FXCScreen onNavigate={handleNavigate} />

      case 'crypto':
        return <CryptoScreen onNavigate={handleNavigate} />

      case 'macro':
        return <MacroScreen onNavigate={handleNavigate} />

      case 'help':
        return <HelpScreen onNavigate={handleNavigate} />

      case 'chat':
        return <ChatScreen sub={sub} onNavigate={handleNavigate} />

      case 'home':
      default:
        return <HomeScreenV3 onNavigate={handleNavigate} />
    }
  }

  // ── Build panel children ──────────────────────────────────────────────────
  const panelChildren = state.panels.map(panel => {
    const title = screenTitle(panel.screen, panel.ticker)
    const accent = accentFor(panel.screen)
    const refFn = (el: HTMLDivElement | null) => {
      if (panel.focused) focusedPanelRef.current = el
    }

    return (
      <PanelV3
        key={panel.id}
        ref={refFn}
        title={title}
        accent={accent}
        focused={panel.focused}
        panelId={panel.id}
        onClose={() => closePanel(panel.id)}
        onMaximize={() => maximizePanel(panel.id)}
      >
        {renderScreen(panel.screen, panel.ticker, panel.sub)}
      </PanelV3>
    )
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.surface0, overflow: 'hidden' }}>
      <BackgroundLayer focusedPanelRef={focusedPanelRef} />
      <CommandBarV3 onCommand={handleCommand} onCommandNewPanel={handleCommandNewPanel} activeCommand={activeCommand} contextTicker={lastTicker} />
      <WorkspaceLayout state={state} onFocusPanel={focusPanel} onSwapPanels={swapPanels} onResizePanels={resizePanels}>
        {panelChildren}
      </WorkspaceLayout>
      <StatusBarV3 />
      {/* CRT phosphor scanlines + edge vignette */}
      <div className="bb-scanlines" />
      <div className="bb-vignette" />
      <UpdateToast />
      <ChatNotificationToast onNavigate={handleNavigate} />
      <BugReportDialog
        open={bugOpen}
        onClose={() => setBugOpen(false)}
        currentScreen={state.panels.find(p => p.focused)?.screen}
        lastError={lastError}
      />
      {showQuitModal && (
        <QuitModal
          onConfirm={handleQuit}
          onCancel={() => setShowQuitModal(false)}
        />
      )}
    </div>
  )
}

// ─── Auth gate ────────────────────────────────────────────────────────────────
function AuthSplash() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: C.surface0,
      color: C.amberDim,
      fontFamily: C.fontDisplay,
      fontSize: '11px',
      letterSpacing: '0.3em',
    }}>
      SPECTRA TERMINAL · LOADING
    </div>
  )
}

function App() {
  const { status } = useAuth()
  const inner =
    status === 'loading' ? <AuthSplash />
    : status === 'anonymous' ? <LoginScreen />
    : <TerminalApp />
  return (
    <>
      {inner}
      <WhatsNewDialog />
    </>
  )
}

export default App