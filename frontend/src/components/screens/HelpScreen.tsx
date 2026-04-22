import React from 'react'
import theme from '../../lib/theme'
import { useBreakpoint } from '../../lib/useBreakpoint'

const { color, font } = theme

interface HelpScreenProps {
  onNavigate: (cmd: string) => void
}

interface HelpRow {
  command: string
  aliases: string
  description: string
  needsTicker: boolean
}

const COMMANDS: HelpRow[] = [
  { command: 'HOME', aliases: '', description: 'Return to the landing page.', needsTicker: false },
  { command: 'BACK', aliases: '', description: 'Return the focused panel to its previous screen.', needsTicker: false },
  { command: 'HELP', aliases: '', description: 'Show this list of all commands.', needsTicker: false },
  { command: 'EQUITY', aliases: '<TICKER>', description: 'Open equity overview for a ticker.', needsTicker: true },
  { command: 'GP', aliases: 'CHART', description: 'Graph — price chart with technical indicators.', needsTicker: true },
  { command: 'OPT', aliases: 'OPTIONS', description: 'Open the options chain for a ticker.', needsTicker: true },
  { command: 'N', aliases: 'NEWS', description: 'View market and company news.', needsTicker: false },
  { command: 'DES', aliases: '', description: 'Detailed company description page.', needsTicker: true },
  { command: 'PORT', aliases: 'PORTFOLIO', description: 'Portfolio tracker and performance.', needsTicker: false },
  { command: 'WLT', aliases: 'WATCHLIST', description: 'Watchlist with real-time quotes.', needsTicker: false },
  { command: 'ECON', aliases: '', description: 'Economic data series and charts.', needsTicker: false },
  { command: 'ECST', aliases: '', description: 'Economic statistics.', needsTicker: false },
  { command: 'EARN', aliases: 'EARNINGS', description: 'Earnings calendar with dates and estimates.', needsTicker: false },
  { command: 'SCR', aliases: 'SCREENER', description: 'Stock screener with customizable filters.', needsTicker: false },
  { command: 'MACRO', aliases: '', description: 'Macro dashboard with key indicators.', needsTicker: false },
  { command: 'FX', aliases: '', description: 'Foreign exchange rates dashboard.', needsTicker: false },
  { command: 'FXC', aliases: '', description: 'Cross-currency rates table.', needsTicker: false },
  { command: 'CRYPTO', aliases: '', description: 'Crypto market dashboard.', needsTicker: false },
  { command: 'MEME', aliases: '', description: 'Meme coin tracker with real-time prices.', needsTicker: false },
  { command: 'PROF', aliases: 'PROFILE', description: 'User profile. PROF @username for others.', needsTicker: false },
  { command: 'FILINGS', aliases: '', description: 'SEC filings browser for a ticker.', needsTicker: true },
  { command: 'GPO', aliases: '', description: 'Plot bar or candlestick charts.', needsTicker: true },
  { command: 'GIP', aliases: '', description: 'Graph intraday plot.', needsTicker: true },
  { command: 'WEI', aliases: 'WINDEX', description: 'World Equity Indices.', needsTicker: false },
  { command: 'HS', aliases: '', description: 'Historical spread.', needsTicker: false },
  { command: 'ETF', aliases: '', description: 'ETF holdings and analysis.', needsTicker: true },
  { command: 'BOND', aliases: 'YLD', description: 'Bond and yield curve data.', needsTicker: false },
  { command: 'COMD', aliases: 'COMMODITY', description: 'Commodity spot prices and outlook.', needsTicker: false },
  { command: 'CONG', aliases: 'CONGRESS', description: 'Congressional bills and trading data.', needsTicker: false },
  { command: 'QUANT', aliases: '', description: 'Quantitative analytics and regression.', needsTicker: true },
  { command: 'ASK', aliases: '', description: 'AI-powered ask assistant.', needsTicker: false },
  { command: 'TOP', aliases: '', description: 'Top world news — Economy, Tech, Energy, Crypto, Politics.', needsTicker: false },
  { command: 'TRUMP', aliases: '', description: 'Live feed of Trump\'s Truth Social posts.', needsTicker: false },
  { command: 'WSB', aliases: '', description: 'WallStreetBets daily discussion thread — live comments.', needsTicker: false },
  { command: 'CHAT', aliases: 'CHAT #room, CHAT @user', description: 'Chat rooms and private messages with other users.', needsTicker: false },
  { command: 'QUIT', aliases: 'EXIT', description: 'Exit the terminal.', needsTicker: false },
]

const HelpScreen: React.FC<HelpScreenProps> = ({ onNavigate }) => {
  const bp = useBreakpoint()
  const isCompact = bp === 'compact'

  return (
    <div style={{
      padding: isCompact ? '12px' : '24px 32px',
    }}>
      {/* Header */}
      <div style={{
        fontFamily: font.sans,
        fontSize: isCompact ? '14px' : '18px',
        fontWeight: 700,
        color: color.textPrimary,
        marginBottom: '6px',
      }}>
        Command Reference
      </div>
      <div style={{
        fontFamily: font.mono,
        fontSize: isCompact ? '10px' : '11px',
        color: color.textSecondary,
        marginBottom: isCompact ? '16px' : '24px',
      }}>
        Type a command in the bar above, or click any command below to navigate.
      </div>

      {/* Table */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isCompact
          ? '90px 1fr'
          : '100px 100px 1fr',
        gap: '0',
        fontSize: isCompact ? '11px' : '12px',
        fontFamily: font.mono,
      }}>
        {/* Header row */}
        <div style={{
          padding: '6px 8px',
          color: color.textSecondary,
          fontSize: '11px',
          fontWeight: 600,
          borderBottom: `1px solid ${color.borderSubtle}`,
        }}>Command</div>
        {!isCompact && (
          <div style={{
            padding: '6px 8px',
            color: color.textSecondary,
            fontSize: '11px',
            fontWeight: 600,
            borderBottom: `1px solid ${color.borderSubtle}`,
          }}>Aliases</div>
        )}
        <div style={{
          padding: '6px 8px',
          color: color.textSecondary,
          fontSize: '11px',
          fontWeight: 600,
          borderBottom: `1px solid ${color.borderSubtle}`,
        }}>Description</div>

        {/* Data rows */}
        {COMMANDS.map((cmd, i) => {
          const bg = i % 2 === 0 ? 'transparent' : color.bgSurface
          return (
            <React.Fragment key={cmd.command}>
              <div
                onClick={() => onNavigate(cmd.command)}
                style={{
                  padding: '6px 8px',
                  color: color.ticker,
                  cursor: 'pointer',
                  background: bg,
                  borderRadius: '2px',
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = color.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = bg }}
              >
                {cmd.command}{cmd.needsTicker ? ' <T>' : ''}
              </div>
              {!isCompact && (
                <div style={{
                  padding: '6px 8px',
                  color: color.textSecondary,
                  background: bg,
                  fontStyle: cmd.aliases ? 'normal' : 'italic',
                }}>
                  {cmd.aliases || '—'}
                </div>
              )}
              <div style={{
                padding: '6px 8px',
                color: color.textPrimary,
                background: bg,
                fontSize: isCompact ? '11px' : '12px',
              }}>
                {cmd.description}
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {/* Footer hint */}
      <div style={{
        marginTop: isCompact ? '16px' : '24px',
        paddingTop: '12px',
        borderTop: `1px solid ${color.borderSubtle}`,
        fontFamily: font.mono,
        fontSize: '10px',
        color: color.textTertiary,
      }}>
        <span style={{ color: color.accentPositive }}>T</span> = ticker required &nbsp;·&nbsp;
        <span style={{ color: color.accentPositive }}>SHIFT+ENTER</span> = open in new panel &nbsp;·&nbsp;
        <span style={{ color: color.accentPositive }}>F1-F10</span> = quick access keys
      </div>
    </div>
  )
}

export default HelpScreen