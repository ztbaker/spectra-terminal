import Panel from '../Terminal/Panel'
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFilings, fetch13F, fetchInstitutionSearch, fetchLitigation } from '../../lib/api'
import type { Filing } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'


const FORM_TYPES = [
  { label: '10-K',    value: '10-K' },
  { label: '10-Q',    value: '10-Q' },
  { label: '8-K',     value: '8-K' },
  { label: 'DEF 14A', value: 'DEF 14A' },
  { label: '13F',     value: '13F' },
  { label: 'LIT',     value: 'LIT' },
  { label: 'ALL',     value: 'ALL' },
]

const LIMIT_OPTIONS = [10, 25, 50]

type Tab = 'filings' | '13f' | 'lit'

function truncate(s: string, max: number): string {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max) + '…' : s
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

interface FilingRowProps {
  filing: Filing
  index: number
}

const FilingRow: React.FC<FilingRowProps> = ({ filing, index }) => {
  const isEven = index % 2 === 1
  return (
    <tr style={{ background: isEven ? 'rgba(255, 255, 255, 0.02)' : 'transparent' }}>
      <td style={{ color: theme.color.ticker, padding: '4px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'left', fontFamily: theme.font.mono }}>{filing.form_type}</td>
      <td style={{ color: theme.color.textPrimary, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right' }}>{formatDate(filing.filed_date)}</td>
      <td style={{ color: theme.color.textSecondary, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right' }}>{filing.period_of_report ? formatDate(filing.period_of_report) : '—'}</td>
      <td style={{ color: theme.color.textPrimary, padding: '4px 8px', fontSize: 11, textAlign: 'left', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={filing.description}>{truncate(filing.description, 60)}</td>
      <td style={{ padding: '4px 8px', textAlign: 'right' }}>
        {filing.url ? (
          <a href={filing.url} target="_blank" rel="noopener noreferrer" style={{ color: theme.color.accentInfo, fontSize: 11, textDecoration: 'none', border: `1px solid ${theme.color.accentInfo}`, padding: '1px 6px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>VIEW →</a>
        ) : <span style={{ color: theme.color.textTertiary, fontSize: 11 }}>—</span>}
      </td>
    </tr>
  )
}

// ─── 13F Holdings Tab ────────────────────────────────────────────────────────

const Tab13F: React.FC<{ ticker: string }> = ({ ticker }) => {
  const [query, setQuery] = useState(ticker)
  const [searchCik, setSearchCik] = useState('')

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['institution-search', query],
    queryFn: () => fetchInstitutionSearch(query),
    enabled: query.length >= 1,
  })

  const { data: holdings, isLoading: holdingsLoading } = useQuery({
    queryKey: ['13f-holdings', searchCik],
    queryFn: () => fetch13F(searchCik),
    enabled: !!searchCik,
  })

  return (
    <div style={{ padding: '8px 16px', color: theme.color.textPrimary }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search institutions..."
          style={{ background: theme.color.bgElevated, border: `1px solid ${theme.color.borderMedium}`, color: theme.color.textPrimary, padding: '4px 8px', fontSize: 12, width: 260, outline: 'none' }}
        />
      </div>

      {searchLoading && <div style={{ color: theme.color.textTertiary, fontSize: 11 }}>Searching...</div>}

      {searchResults?.results?.length > 0 && !searchCik && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.color.borderMedium}` }}>
              <th style={{ color: theme.color.textSecondary, textAlign: 'left', padding: 4 }}>Name</th>
              <th style={{ color: theme.color.textSecondary, textAlign: 'left', padding: 4 }}>CIK</th>
              <th style={{ color: theme.color.textSecondary, textAlign: 'left', padding: 4 }}>Ticker</th>
              <th style={{ color: theme.color.textSecondary, textAlign: 'right', padding: 4 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {searchResults.results.map((r: any) => (
              <tr key={r.cik} style={{ borderBottom: `1px solid ${theme.color.borderSubtle}` }}>
                <td style={{ color: theme.color.textPrimary, padding: 4 }}>{r.name}</td>
                <td style={{ color: theme.color.textSecondary, padding: 4 }}>{r.cik}</td>
                <td style={{ color: theme.color.textTertiary, padding: 4 }}>{r.ticker || '—'}</td>
                <td style={{ padding: 4, textAlign: 'right' }}>
                  <button className="bb-btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setSearchCik(r.cik)}>VIEW 13F</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {holdingsLoading && <div style={{ color: theme.color.textTertiary, fontSize: 11, marginTop: 12 }}>Loading holdings...</div>}

      {holdings?.holdings?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: theme.color.textPrimary, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>13F Holdings — CIK {searchCik} ({holdings.holdings.length} positions)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.color.borderMedium}` }}>
                <th style={{ color: theme.color.textSecondary, textAlign: 'left', padding: 4 }}>Issuer</th>
                <th style={{ color: theme.color.textSecondary, textAlign: 'left', padding: 4 }}>Class</th>
                <th style={{ color: theme.color.textSecondary, textAlign: 'left', padding: 4 }}>CUSIP</th>
                <th style={{ color: theme.color.textSecondary, textAlign: 'right', padding: 4 }}>Value ($000)</th>
                <th style={{ color: theme.color.textSecondary, textAlign: 'right', padding: 4 }}>Shares</th>
                <th style={{ color: theme.color.textSecondary, textAlign: 'left', padding: 4 }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {holdings.holdings.slice(0, 50).map((h: any, i: number) => (
                <tr key={i} style={{ background: i % 2 ? theme.color.bgElevated : 'transparent' }}>
                  <td style={{ color: theme.color.textPrimary, padding: 4, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.nameOfIssuer || '—'}</td>
                  <td style={{ color: theme.color.textSecondary, padding: 4 }}>{h.titleOfClass || '—'}</td>
                  <td style={{ color: theme.color.textTertiary, padding: 4, fontSize: 10, fontFamily: theme.font.mono }}>{h.cusip || '—'}</td>
                  <td style={{ color: theme.color.textPrimary, padding: 4, textAlign: 'right' }}>{h.value ? Number(h.value).toLocaleString() : '—'}</td>
                  <td style={{ color: theme.color.textPrimary, padding: 4, textAlign: 'right' }}>{h.sshPrnamt ? Number(h.sshPrnamt).toLocaleString() : '—'}</td>
                  <td style={{ color: theme.color.textSecondary, padding: 4 }}>{h.sshPrnamtType || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Litigation Tab ─────────────────────────────────────────────────────────

const TabLit: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['litigation'],
    queryFn: () => fetchLitigation(),
    staleTime: 60_000,
  })

  if (isLoading) return <div style={{ padding: 24, color: theme.color.textTertiary, fontSize: 12 }}>Loading litigation...</div>

  return (
    <div style={{ padding: '8px 16px', color: theme.color.textPrimary }}>
      <div style={{ color: theme.color.textPrimary, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>SEC Litigation Releases</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.color.borderMedium}` }}>
            <th style={{ color: theme.color.textSecondary, textAlign: 'left', padding: 4 }}>Title</th>
            <th style={{ color: theme.color.textSecondary, textAlign: 'right', padding: 4 }}>Date</th>
            <th style={{ color: theme.color.textSecondary, textAlign: 'right', padding: 4 }}>Link</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items || []).map((item: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid ' + theme.color.borderSubtle }}>
              <td style={{ color: theme.color.textPrimary, padding: 4, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || '—'}</td>
              <td style={{ color: theme.color.textSecondary, padding: 4, textAlign: 'right', whiteSpace: 'nowrap' }}>{item.published ? formatDate(item.published) : '—'}</td>
              <td style={{ padding: 4, textAlign: 'right' }}>
                {item.link ? <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: theme.color.accentInfo, fontSize: 11, textDecoration: 'none', border: `1px solid ${theme.color.accentInfo}`, padding: '1px 6px' }}>VIEW →</a> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!data?.items || data.items.length === 0) && <div style={{ color: theme.color.textTertiary, fontSize: 11, marginTop: 8 }}>No litigation releases found.</div>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

const FilingsScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [formType, setFormType] = useState<string>('10-K')
  const [limit, setLimit] = useState<number>(10)
  const [tab, setTab] = useState<Tab>('filings')

  const apiType = formType === 'ALL' ? undefined : formType

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['filings', ticker, formType, limit],
    queryFn: () => fetchFilings(ticker, apiType, limit),
    staleTime: 10 * 60_000,
    enabled: !!ticker && tab === 'filings',
  })

  const filings: Filing[] = data?.filings ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.color.bgBase }}>
      <LoadingBar loading={isLoading || isFetching} />

      <Panel
        title={`SEC Filings — ${ticker.toUpperCase()}`}
        actions={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ color: theme.color.textTertiary, fontSize: '10px', marginRight: '4px' }}>Limit:</span>
            {LIMIT_OPTIONS.map(l => (
              <button
                key={l}
                className={limit === l ? 'bb-btn bb-btn-active' : 'bb-btn'}
                style={{ fontSize: '10px', padding: '1px 6px' }}
                onClick={() => setLimit(l)}
              >
                {l}
              </button>
            ))}
          </div>
        }
      >
        {/* ── Tab bar ── */}
        <div style={{ borderBottom: `1px solid ${theme.color.borderMedium}`, padding: '6px 8px', display: 'flex', gap: '4px', background: theme.color.bgElevated }}>
          {(['filings', '13f', 'lit'] as Tab[]).map(t => (
            <button
              key={t}
              className={tab === t ? 'bb-btn bb-btn-active' : 'bb-btn'}
              style={{ fontSize: 11, padding: '2px 10px' }}
              onClick={() => setTab(t)}
            >
              {t === 'filings' ? 'Filings' : t === '13f' ? '13F' : 'Litigation'}
            </button>
          ))}
        </div>

        {/* ── Filings tab ── */}
        {tab === 'filings' && (
          <>
            <div style={{ borderBottom: `1px solid ${theme.color.borderMedium}`, padding: '6px 8px', display: 'flex', gap: '4px', background: theme.color.bgElevated, flexWrap: 'wrap' }}>
              {FORM_TYPES.filter(ft => ft.value !== '13F' && ft.value !== 'LIT').map(ft => (
                <button
                  key={ft.value}
                  className={formType === ft.value ? 'bb-btn bb-btn-active' : 'bb-btn'}
                  style={{ fontSize: 11, padding: '2px 10px' }}
                  onClick={() => setFormType(ft.value)}
                >
                  {ft.label}
                </button>
              ))}
            </div>

            {error && !isLoading && (
              <div style={{ padding: 12, color: theme.color.accentNegative, fontSize: 12, borderBottom: `1px solid ${theme.color.borderMedium}` }}>
                ERR: {(error as Error).message ?? 'Failed to load filings'}
              </div>
            )}

            {isLoading && !data && (
              <div style={{ padding: 24, color: theme.color.textTertiary, fontSize: 12, textAlign: 'center' }}>Loading filings...</div>
            )}

            {!isLoading && filings.length > 0 && (
              <div style={{ overflow: 'auto', flex: 1 }}>
                <table className="bb-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Form</th>
                      <th>Filed date</th>
                      <th>Period</th>
                      <th style={{ textAlign: 'left' }}>Description</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filings.map((filing, i) => (
                      <FilingRow key={filing.accession_number || `${filing.form_type}-${filing.filed_date}-${i}`} filing={filing} index={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoading && !error && filings.length === 0 && (
              <div style={{ padding: 32, color: theme.color.textTertiary, fontSize: 12, textAlign: 'center' }}>No filings found</div>
            )}

            {filings.length > 0 && (
              <div style={{ borderTop: `1px solid ${theme.color.borderMedium}`, padding: '4px 12px', display: 'flex', justifyContent: 'space-between', color: theme.color.textTertiary, fontSize: 10 }}>
                <span>{filings.length} filing{filings.length !== 1 ? 's' : ''}{formType !== 'ALL' ? ` · ${formType}` : ''}</span>
                {data?.cached && <span>CACHED</span>}
              </div>
            )}
          </>
        )}

        {/* ── 13F tab ── */}
        {tab === '13f' && <Tab13F ticker={ticker} />}

        {/* ── Litigation tab ── */}
        {tab === 'lit' && <TabLit />}
      </Panel>
    </div>
  )
}

export default FilingsScreen
