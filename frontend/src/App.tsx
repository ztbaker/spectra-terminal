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
import CryptoScreen   from './components/screens/CryptoScreen'
import FilingsScreen  from './components/screens/FilingsScreen'
import DESScreen      from './components/screens/DESScreen'

// ─── F-key → command map ────────────────────────────────────────────────────
const FKEY_COMMANDS: Record<string, string> = {
  F1:  'WLT',
  F2:  'PORT',
  F3:  'MACRO',
  F4:  'ECON',
  F5:  'NEWS',
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
    { label: 'NEWS',      cmd: 'NEWS',    desc: 'Market news feed' },
    { label: 'MACRO',     cmd: 'MACRO',   desc: 'FRED macro dashboard' },
    { label: 'WATCHLIST', cmd: 'WLT',     desc: 'Your watchlist' },
    { label: 'PORTFOLIO', cmd: 'PORT',    desc: 'Portfolio tracker' },
    { label: 'SCREENER',  cmd: 'SCR',     desc: 'Stock screener' },
    { label: 'FX',        cmd: 'FX',      desc: 'FX rates' },
    { label: 'CRYPTO',    cmd: 'CRYPTO',  desc: 'Crypto dashboard' },
    { label: 'EARNINGS',  cmd: 'EARN',    desc: 'Earnings calendar' },
    { label: 'FILINGS',   cmd: 'AAPL FILINGS', desc: 'SEC filings' },
  ]

  return (
    <div style={{ padding: '24px 32px', color: '#ff9900' }}>
      {/* ASCII art header */}
      <pre style={{ color: '#ff9900', fontSize: '11px', lineHeight: 1.3, marginBottom: '24px' }}>
{`╔══════════════════════════════════════════════════════════╗
║  ██████╗ ██╗    ██╗ █████╗ ██╗  ██╗███████╗██████╗      ║
║  ╚════██╗██║    ██║██╔══██╗██║ ██╔╝██╔════╝██╔══██╗     ║
║   █████╔╝██║ █╗ ██║███████║█████╔╝ █████╗  ██████╔╝     ║
║  ██╔═══╝ ██║███╗██║██╔══██║██╔═██╗ ██╔══╝  ██╔══██╗     ║
║  ███████╗╚███╔███╔╝██║  ██║██║  ██╗███████╗██║  ██║     ║
║  ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝     ║
║                    Z A C   T E R M I N A L               ║
╚══════════════════════════════════════════════════════════╝`}
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

  const handleCommand = useCallback((cmd: ParsedCommand) => {
    setActiveCommand(cmd)
    try {
      localStorage.setItem('bb_last_command', JSON.stringify(cmd))
    } catch { /* ignore */ }
  }, [])

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
      <CommandBar onCommand={handleCommand} activeCommand={activeCommand} />
      <PanelLayout>
        {renderScreen()}
      </PanelLayout>
      <StatusBar />
    </div>
  )
}

export default App
