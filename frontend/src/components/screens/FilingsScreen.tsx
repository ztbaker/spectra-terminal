import Panel from '../Terminal/Panel'
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFilings, fetch13F, fetchInstitutionSearch, fetchLitigation } from '../../lib/api'
import type { Filing } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import C from '../../lib/colors'


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
    <tr style={{ background: isEven ? C.surfaceGlow : 'transparent' }}>
      <td style={{ color: C.amberBright, padding: '4px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'left' }}>{filing.form_type}</td>
      <td style={{ color: C.white, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right' }}>{formatDate(filing.filed_date)}</td>
      <td style={{ color: C.amberDim, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right' }}>{filing.period_of_report ? formatDate(filing.period_of_report) : '—'}</td>
      <td style={{ color: C.white, padding: '4px 8px', fontSize: 11, textAlign: 'left', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={filing.description}>{truncate(filing.description, 60)}</td>
      <td style={{ padding: '4px 8px', textAlign: 'right' }}>
        {filing.url ? (
          <a href={filing.url} target="_blank" rel="noopener noreferrer" style={{ color: C.cyanBright, fontSize: 11, textDecoration: 'none', border: `1px solid ${C.cyanBright}`, padding: '1px 6px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>VIEW →</a>
        ) : <span style={{ color: C.amberMute, fontSize: 11 }}>—</span>}
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
    <div style={{ padding: '8px 16px', color: C.amber }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search institutions..."
          style={{ background: C.surface1, border: `1px solid ${C.border1}`, color: C.white, padding: '4px 8px', fontSize: 12, width: 260, outline: 'none' }}
        />
      </div>

      {searchLoading && <div style={{ color: C.amberMute, fontSize: 11 }}>Searching...</div>}

      {searchResults?.results?.length > 0 && !searchCik && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border1}` }}>
              <th style={{ color: C.amberMute, textAlign: 'left', padding: 4 }}>Name</th>
              <th style={{ color: C.amberMute, textAlign: 'left', padding: 4 }}>CIK</th>
              <th style={{ color: C.amberMute, textAlign: 'left', padding: 4 }}>Ticker</th>
              <th style={{ color: C.amberMute, textAlign: 'right', padding: 4 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {searchResults.results.map((r: any) => (
              <tr key={r.cik} style={{ borderBottom: `1px solid ${C.border0}` }}>
                <td style={{ color: C.white, padding: 4 }}>{r.name}</td>
                <td style={{ color: C.amberDim, padding: 4 }}>{r.cik}</td>
                <td style={{ color: C.amberMute, padding: 4 }}>{r.ticker || '—'}</td>
                <td style={{ padding: 4, textAlign: 'right' }}>
                  <button className="bb-btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setSearchCik(r.cik)}>VIEW 13F</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {holdingsLoading && <div style={{ color: C.amberMute, fontSize: 11, marginTop: 12 }}>Loading holdings...</div>}

      {holdings?.holdings?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: C.amberBright, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>13F HOLDINGS — CIK {searchCik} ({holdings.holdings.length} positions)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border1}` }}>
                <th style={{ color: C.amberMute, textAlign: 'left', padding: 4 }}>Issuer</th>
                <th style={{ color: C.amberMute, textAlign: 'left', padding: 4 }}>Class</th>
                <th style={{ color: C.amberMute, textAlign: 'left', padding: 4 }}>CUSIP</th>
                <th style={{ color: C.amberMute, textAlign: 'right', padding: 4 }}>Value ($000)</th>
                <th style={{ color: C.amberMute, textAlign: 'right', padding: 4 }}>Shares</th>
                <th style={{ color: C.amberMute, textAlign: 'left', padding: 4 }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {holdings.holdings.slice(0, 50).map((h: any, i: number) => (
                <tr key={i} style={{ background: i % 2 ? C.surfaceGlow : 'transparent' }}>
                  <td style={{ color: C.white, padding: 4, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.nameOfIssuer || '—'}</td>
                  <td style={{ color: C.amberMute, padding: 4 }}>{h.titleOfClass || '—'}</td>
                  <td style={{ color: C.amberDim, padding: 4, fontSize: 10 }}>{h.cusip || '—'}</td>
                  <td style={{ color: C.white, padding: 4, textAlign: 'right' }}>{h.value ? Number(h.value).toLocaleString() : '—'}</td>
                  <td style={{ color: C.white, padding: 4, textAlign: 'right' }}>{h.sshPrnamt ? Number(h.sshPrnamt).toLocaleString() : '—'}</td>
                  <td style={{ color: C.amberMute, padding: 4 }}>{h.sshPrnamtType || '—'}</td>
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

  if (isLoading) return <div style={{ padding: 24, color: C.amberMute, fontSize: 12 }}>Loading litigation...</div>

  return (
    <div style={{ padding: '8px 16px', color: C.amber }}>
      <div style={{ color: C.amberBright, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>SEC LITIGATION RELEASES</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border1}` }}>
            <th style={{ color: C.amberMute, textAlign: 'left', padding: 4 }}>Title</th>
            <th style={{ color: C.amberMute, textAlign: 'right', padding: 4 }}>Date</th>
            <th style={{ color: C.amberMute, textAlign: 'right', padding: 4 }}>Link</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items || []).map((item: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid ' + C.border0 }}>
              <td style={{ color: C.white, padding: 4, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || '—'}</td>
              <td style={{ color: C.amberDim, padding: 4, textAlign: 'right', whiteSpace: 'nowrap' }}>{item.published ? formatDate(item.published) : '—'}</td>
              <td style={{ padding: 4, textAlign: 'right' }}>
                {item.link ? <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: C.cyanBright, fontSize: 11, textDecoration: 'none', border: `1px solid ${C.cyanBright}`, padding: '1px 6px' }}>VIEW →</a> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!data?.items || data.items.length === 0) && <div style={{ color: C.amberMute, fontSize: 11, marginTop: 8 }}>No litigation releases found.</div>}
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface0 }}>
      <LoadingBar loading={isLoading || isFetching} />

      <Panel
        title={`SEC FILINGS — ${ticker.toUpperCase()}`}
        actions={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ color: C.amberMute, fontSize: '10px', marginRight: '4px' }}>LIMIT:</span>
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
        <div style={{ borderBottom: `1px solid ${C.border1}`, padding: '6px 8px', display: 'flex', gap: '4px', background: C.surface1 }}>
          {(['filings', '13f', 'lit'] as Tab[]).map(t => (
            <button
              key={t}
              className={tab === t ? 'bb-btn bb-btn-active' : 'bb-btn'}
              style={{ fontSize: 11, padding: '2px 10px' }}
              onClick={() => setTab(t)}
            >
              {t === 'filings' ? 'FILINGS' : t === '13f' ? '13F' : 'LIT'}
            </button>
          ))}
        </div>

        {/* ── Filings tab ── */}
        {tab === 'filings' && (
          <>
            <div style={{ borderBottom: `1px solid ${C.border1}`, padding: '6px 8px', display: 'flex', gap: '4px', background: C.surface1, flexWrap: 'wrap' }}>
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
              <div style={{ padding: 12, color: C.red, fontSize: 12, borderBottom: `1px solid ${C.border1}` }}>
                ERR: {(error as Error).message ?? 'Failed to load filings'}
              </div>
            )}

            {isLoading && !data && (
              <div style={{ padding: 24, color: C.amberMute, fontSize: 12, textAlign: 'center', letterSpacing: '0.05em' }}>LOADING FILINGS...</div>
            )}

            {!isLoading && filings.length > 0 && (
              <div style={{ overflow: 'auto', flex: 1 }}>
                <table className="bb-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>FORM</th>
                      <th>FILED DATE</th>
                      <th>PERIOD</th>
                      <th style={{ textAlign: 'left' }}>DESCRIPTION</th>
                      <th>LINK</th>
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
              <div style={{ padding: 32, color: C.amberMute, fontSize: 12, textAlign: 'center', letterSpacing: '0.05em' }}>NO FILINGS FOUND</div>
            )}

            {filings.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border1}`, padding: '4px 12px', display: 'flex', justifyContent: 'space-between', color: C.amberMute, fontSize: 10 }}>
                <span>{filings.length} FILING{filings.length !== 1 ? 'S' : ''}{formType !== 'ALL' ? ` · ${formType}` : ''}</span>
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