import theme from '../../lib/theme'

const { color, font } = theme

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

const FUNCTIONS: { key: string; label: string; description: string }[] = [
  { key: 'EQUITY', label: 'EQUITY',  description: 'Overview — price, volume, fundamentals' },
  { key: 'DES',    label: 'DES',     description: 'Description — company profile & details' },
  { key: 'GP',     label: 'GP',      description: 'Graph — price chart with technicals' },
  { key: 'FA',     label: 'FA',      description: 'Financial Analysis — income, balance sheet, cash flow' },
  { key: 'OPT',    label: 'OPT',     description: 'Options — chain with Greeks' },
  { key: 'N',      label: 'N',       description: 'News — headlines for this security' },
  { key: 'FILINGS',label: 'FILINGS', description: 'Filings — SEC 10-K, 10-Q, 8-K' },
  { key: 'HS',     label: 'HS',      description: 'Historical Spread — compare against another security' },
  { key: 'QUANT',  label: 'QUANT',   description: 'Quantitative — CAPM, Fama-French, regression' },
  { key: 'ETF',    label: 'ETF',     description: 'ETF Analysis — holdings, sectors, performance' },
]

export default function TickerMenuScreen({ ticker, onNavigate }: Props) {
  return (
    <div style={{ padding: '32px 48px', color: color.textPrimary, fontFamily: font.mono, maxWidth: 700 }}>
      {/* Ticker header */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: color.ticker, letterSpacing: 1 }}>{ticker}</span>
      </div>

      <div style={{
        fontSize: 13,
        color: color.textSecondary,
        marginBottom: 24,
        borderBottom: `1px solid ${color.borderSubtle}`,
        paddingBottom: 16,
      }}>
        Select a function or type <span style={{ color: color.accentWarning }}>{ticker} &lt;function&gt;</span> in the command bar
      </div>

      {/* Function list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {FUNCTIONS.map((fn) => (
          <div
            key={fn.key}
            onClick={() => onNavigate(`${ticker} ${fn.key}`)}
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr',
              gap: 16,
              padding: '10px 12px',
              cursor: 'pointer',
              borderRadius: 2,
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = color.bgHover }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: color.accentWarning,
              fontFamily: font.mono,
            }}>
              {fn.label}
            </span>
            <span style={{
              fontSize: 12,
              color: color.textSecondary,
              fontFamily: font.sans,
            }}>
              {fn.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
