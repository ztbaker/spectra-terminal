import { useState, useCallback, useEffect } from 'react'
import type { ParsedCommand, ScreenType } from './types'
import { parseCommand } from './lib/commandParser'

import CommandBar from './components/Terminal/CommandBar'
import StatusBar from './components/Terminal/StatusBar'
import PanelLayout from './components/Terminal/PanelLayout'

import EquityScreen   from './components/screens/EquityScreen'
import ChartScreen    from './components/screens/ChartScreen'
import OptionsScreen  from './components/screens/OptionsScreen'
import NewsScreen     from './components/screens/NewsScreen'
import MacroScreen    from './components/screens/MacroScreen'
import PortfolioScreen from './components/screens/PortfolioScreen'
import WatchlistScreen from './components/screens/WatchlistScreen'
import EarningsScreen from './components/screens/EarningsScreen'
import ScreenerScreen from './components/screens/ScreenerScreen'
import FXScreen       from './components/screens/FXScreen'
import FXCScreen      from './components/screens/FXCScreen'
import CryptoScreen   from './components/screens/CryptoScreen'
import FilingsScreen  from './components/screens/FilingsScreen'
import DESScreen      from './components/screens/DESScreen'
import GScreen        from './components/screens/GScreen'
import GPOScreen      from './components/screens/GPOScreen'
import GIPScreen      from './components/screens/GIPScreen'
import WEIScreen      from './components/screens/WEIScreen'
import HSScreen       from './components/screens/HSScreen'
import ECSTScreen     from './components/screens/ECSTScreen'

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

// ─── Home screen ─────────────────────────────────────────────────────────────
function HomeScreen({ onNavigate }: { onNavigate: (cmd: string) => void }) {
  const quickLinks: { label: string; cmd: string; desc: string }[] = [
    { label: 'EQUITY',    cmd: 'AAPL',    desc: 'Type any ticker + EQUITY' },
    { label: 'CHART',     cmd: 'AAPL GP', desc: 'Candlestick chart' },
    { label: 'OPTIONS',   cmd: 'AAPL OPT', desc: 'Options chain' },
    { label: 'NEWS',      cmd: 'N',       desc: 'Market news feed' },
    { label: 'MACRO',     cmd: 'MACRO',   desc: 'FRED macro dashboard' },
    { label: 'WATCHLIST', cmd: 'WLT',     desc: 'Your watchlist' },
    { label: 'PORTFOLIO', cmd: 'PORT',    desc: 'Portfolio tracker' },
    { label: 'SCREENER',  cmd: 'SCR',     desc: 'Stock screener' },
    { label: 'FX',        cmd: 'FX',      desc: 'FX rates' },
    { label: 'FXC',       cmd: 'FXC',     desc: 'Cross currency matrix' },
    { label: 'CRYPTO',    cmd: 'CRYPTO',  desc: 'Crypto dashboard' },
    { label: 'EARNINGS',  cmd: 'EARN',    desc: 'Earnings calendar' },
    { label: 'FILINGS',   cmd: 'AAPL FILINGS', desc: 'SEC filings' },
    { label: 'ECST',      cmd: 'ECST',         desc: 'Economic statistics' },
  ]

  return (
    <div style={{ padding: '24px 32px', color: '#ff9900' }}>
      {/* ASCII art header */}
      <pre style={{ color: '#ff9900', fontSize: '11px', lineHeight: 1.3, marginBottom: '24px' }}>
{`╔════════════════════════════════════════════════════════════════════════╗
║    ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗        ║
║    ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║        ║
║       ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║        ║
║       ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║        ║
║       ██║   ███████╗██║  ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗   ║
║       ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ║
║                                B A K E R                               ║
╚════════════════════════════════════════════════════════════════════════╝`}
      </pre>

      <div style={{ color: '#cc7700', fontSize: '11px', marginBottom: '20px' }}>
        TYPE A COMMAND ABOVE OR SELECT A FUNCTION BELOW
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        maxWidth: '900px',
      }}>
        {quickLinks.map(({ label, cmd, desc }) => (
          <button
            key={label}
            className="bb-btn"
            onClick={() => onNavigate(cmd)}
            style={{ textAlign: 'left', padding: '10px 12px', height: 'auto' }}
          >
            <div style={{ color: '#ffcc00', fontSize: '12px', marginBottom: '4px' }}>{label}</div>
            <div style={{ color: '#554400', fontSize: '10px' }}>{desc}</div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: '32px', color: '#554400', fontSize: '11px', lineHeight: 1.8 }}>
        <div>KEYBOARD SHORTCUTS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: '0 24px', width: 'fit-content', marginTop: '8px' }}>
          {Object.entries(FKEY_COMMANDS).map(([key, cmd]) => (
            <div key={key}>
              <span style={{ color: '#cc7700' }}>[{key}]</span>
              {' → '}
              <span style={{ color: '#e0e0e0' }}>{cmd}</span>
            </div>
          ))}
          <div><span style={{ color: '#cc7700' }}>[ESC]</span>{' → '}Clear command bar</div>
          <div><span style={{ color: '#cc7700' }}>[↑↓]</span>{' → '}Command history</div>
        </div>
      </div>
    </div>
  )
}

// Screens that require a ticker — will inherit the last-used ticker when none is typed
const TICKER_SCREENS = new Set<ScreenType>([
  'equity', 'chart', 'options', 'filings', 'des', 'gpo', 'gip', 'news',
])

// ─── Main App ────────────────────────────────────────────────────────────────
function App() {
  const [activeCommand, setActiveCommand] = useState<ParsedCommand | null>(() => {
    // Restore last command from localStorage
    try {
      const saved = localStorage.getItem('bb_last_command')
      if (saved) return JSON.parse(saved) as ParsedCommand
    } catch { /* ignore */ }
    return null
  })

  // Sticky ticker: persisted so it survives page refresh
  const [lastTicker, setLastTicker] = useState<string>(() => {
    try {
      const t = localStorage.getItem('bb_last_ticker')
      if (t) return t
      // Fall back to ticker from last command
      const saved = localStorage.getItem('bb_last_command')
      if (saved) {
        const cmd = JSON.parse(saved) as ParsedCommand
        return cmd.ticker ?? ''
      }
    } catch { /* ignore */ }
    return ''
  })

  const handleCommand = useCallback((cmd: ParsedCommand) => {
    // If a ticker-required screen has no ticker, substitute the last-used ticker
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
  }, [lastTicker])

  // Allow screens to trigger navigation programmatically
  const handleNavigate = useCallback((raw: string) => {
    const cmd = parseCommand(raw)
    handleCommand(cmd)
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

  // ── Render active screen ──────────────────────────────────────────────────
  const renderScreen = () => {
    if (!activeCommand) return <HomeScreen onNavigate={handleNavigate} />

    const { screen, ticker } = activeCommand

    switch (screen as ScreenType) {
      case 'equity':
        return ticker
          ? <EquityScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreen onNavigate={handleNavigate} />

      case 'chart':
        return ticker
          ? <ChartScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreen onNavigate={handleNavigate} />

      case 'options':
        return ticker
          ? <OptionsScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreen onNavigate={handleNavigate} />

      case 'news':
        return <NewsScreen ticker={ticker} onNavigate={handleNavigate} />

      case 'filings':
        return ticker
          ? <FilingsScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreen onNavigate={handleNavigate} />

      case 'des':
        return ticker
          ? <DESScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreen onNavigate={handleNavigate} />

      // G (manager) and G1–G9 (graph slots)
      // ticker field carries the graph slot number ('1'–'9') or undefined for manager
      case 'graph':
        return <GScreen graphId={ticker} onNavigate={handleNavigate} />

      case 'gpo':
        return ticker
          ? <GPOScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreen onNavigate={handleNavigate} />

      case 'gip':
        return ticker
          ? <GIPScreen ticker={ticker} onNavigate={handleNavigate} />
          : <HomeScreen onNavigate={handleNavigate} />

      case 'wei':
        return <WEIScreen onNavigate={handleNavigate} />

      case 'hs':
        return <HSScreen onNavigate={handleNavigate} />

      case 'ecst':
        return <ECSTScreen onNavigate={handleNavigate} />

      case 'portfolio':
        return <PortfolioScreen onNavigate={handleNavigate} />

      case 'watchlist':
        return <WatchlistScreen onNavigate={handleNavigate} />

      case 'econ':
        return <MacroScreen onNavigate={handleNavigate} />

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

      case 'home':
      default:
        return <HomeScreen onNavigate={handleNavigate} />
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <CommandBar onCommand={handleCommand} activeCommand={activeCommand} contextTicker={lastTicker} />
      <PanelLayout>
        {renderScreen()}
      </PanelLayout>
      <StatusBar />
    </div>
  )
}

export default App
