import { useMacroDashboard, useMacroRefresh } from './hooks'
import { fixtureDashboard } from './fixtures'
import RegimeBar from './RegimeBar'
import AssetGrid from './AssetGrid'
import CatalystCalendar from './CatalystCalendar'
import TradeReadyTable from './TradeReadyTable'
import TodaysRead from './TodaysRead'
import LoadingBar from '../../shared/LoadingBar'
import theme from '../../../lib/theme'

const { color, type: typo, font } = theme

interface Props {
  onNavigate: (cmd: string) => void
}

const MacroIntelScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const { data, isLoading, isError, isFetching } = useMacroDashboard()
  const refreshMutation = useMacroRefresh()

  const dashboard = data ?? null
  const regime = dashboard?.regime ?? fixtureDashboard.regime
  const assets = dashboard?.asset_scores ?? fixtureDashboard.asset_scores
  const catalysts = dashboard?.catalysts ?? fixtureDashboard.catalysts
  const ideas = dashboard?.trade_ideas ?? fixtureDashboard.trade_ideas
  const narrative = dashboard?.narrative ?? fixtureDashboard.narrative
  const useFixtures = isError || !data

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'transparent',
      overflow: 'hidden',
    }}>
      <LoadingBar loading={isLoading || isFetching} />

      {dashboard?.stale && (
        <div style={{
          background: color.accentWarningDim,
          padding: '4px 12px',
          fontSize: '11px',
          color: color.accentWarning,
          fontFamily: font.sans,
        }}>
          Data is stale — last refresh: {dashboard.last_refresh ?? 'never'}. Click Refresh to update.
        </div>
      )}

      {isError && (
        <div style={{
          padding: '12px',
          color: color.accentNegative,
          fontSize: '12px',
          fontFamily: font.sans,
        }}>
          MACRO dashboard unavailable. Backend may not be running or pipeline has not executed yet.
          Showing mock data.
        </div>
      )}

      <div
        className="bb-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          padding: '6px 12px',
        }}
      >
        <span>MACRO INTEL</span>
        <button
          className="bb-btn"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          style={{ fontSize: '10px', padding: '4px 10px' }}
        >
          {refreshMutation.isPending ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <RegimeBar regime={regime} loading={isLoading && !useFixtures} />

        <div style={{ borderTop: `1px solid ${color.borderSubtle}` }}>
          <div style={{ ...typo.caption, color: color.textTertiary, padding: '8px 12px 4px' }}>
            ASSET GRID
          </div>
          <div style={{ padding: '0 12px 8px' }}>
            <AssetGrid assets={assets} loading={isLoading && !useFixtures} />
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${color.borderSubtle}` }}>
          <div style={{ ...typo.caption, color: color.textTertiary, padding: '8px 12px 4px' }}>
            CATALYST CALENDAR
          </div>
          <div style={{ padding: '0 8px 8px' }}>
            <CatalystCalendar catalysts={catalysts} loading={isLoading && !useFixtures} />
          </div>
        </div>

        <div style={{ display: 'flex', borderTop: `1px solid ${color.borderSubtle}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...typo.caption, color: color.textTertiary, padding: '8px 12px 4px' }}>
              TRADE READY
            </div>
            <div style={{ padding: '0 12px 8px' }}>
              <TradeReadyTable ideas={ideas} loading={isLoading && !useFixtures} />
            </div>
          </div>
          <div style={{
            width: 1,
            background: color.borderSubtle,
            flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...typo.caption, color: color.textTertiary, padding: '8px 12px 4px' }}>
              TODAY'S READ
            </div>
            <div style={{ padding: '0 12px 8px' }}>
              <TodaysRead narrative={narrative} loading={isLoading && !useFixtures} />
            </div>
          </div>
        </div>
      </div>

      <div style={{
        padding: '4px 12px',
        borderTop: `1px solid ${color.borderSubtle}`,
        display: 'flex',
        justifyContent: 'space-between',
        flexShrink: 0,
        ...typo.monoXs,
        color: color.textTertiary,
      }}>
        <span>
          {useFixtures ? 'FIXTURE DATA' : dashboard?.stale ? 'STALE' : 'LIVE'}
        </span>
        <span>
          {dashboard?.last_refresh
            ? `Updated ${new Date(dashboard.last_refresh).toLocaleTimeString('en-US', { hour12: false })}`
            : 'Awaiting data'}
        </span>
      </div>
    </div>
  )
}

export default MacroIntelScreen