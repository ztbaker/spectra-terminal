import Panel from '../Terminal/Panel'
import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'
import DataGrid from '../shared/DataGrid'
import LiveDot from '../shared/LiveDot'
import LoadingBar from '../shared/LoadingBar'
import { fetchCongressBills, fetchCongressBill } from '../../lib/api'

interface Props {
  onNavigate: (cmd: string) => void
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function statusPill(action: string | null): { label: string; color: string; bg: string } {
  if (!action) return { label: 'UNKNOWN', color: C.whiteGhost, bg: 'transparent' }
  const lower = action.toLowerCase()
  if (lower.includes('enacted') || lower.includes('became law') || lower.includes('signed')) {
    return { label: 'ENACTED', color: C.green, bg: C.greenDim }
  }
  if (lower.includes('passed') || lower.includes('agreed to')) {
    return { label: 'PASSED', color: C.amberBright, bg: `${C.amberBright}11` }
  }
  if (lower.includes('introduced') || lower.includes('referred')) {
    return { label: 'INTRODUCED', color: C.amberDim, bg: C.amberMute }
  }
  if (lower.includes('committee') || lower.includes('reported')) {
    return { label: 'COMMITTEE', color: C.amber, bg: C.amberMute }
  }
  return { label: 'ACTIVE', color: C.whiteDim, bg: C.surface2 }
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  billId: string | null
  onClose: () => void
}

const DetailPanel: React.FC<DetailPanelProps> = ({ billId, onClose }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['congress-bill', billId],
    queryFn: () => fetchCongressBill(billId!),
    enabled: !!billId,
    staleTime: 300_000,
  })

  const bill = data?.bill

  return (
    <div style={{
      width: 400,
      height: '100%',
      background: C.surface1,
      borderLeft: `1px solid ${C.border1}`,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      animation: 'fadeSlideUp 200ms ease',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: `1px solid ${C.border1}`,
        background: C.surface2,
      }}>
        <span style={{ color: C.amberBright, fontSize: 13, fontFamily: C.fontMono, fontWeight: 700, letterSpacing: '0.05em' }}>
          {billId ?? 'BILL DETAIL'}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: C.whiteDim,
            border: `1px solid ${C.border1}`,
            padding: '2px 8px',
            fontSize: 11,
            fontFamily: C.fontMono,
            cursor: 'pointer',
            borderRadius: 2,
          }}
        >
          ESC
        </button>
      </div>

      {isLoading && (
        <div style={{ padding: 24, color: C.amberMute, fontSize: 11, textAlign: 'center' }}>Loading bill details...</div>
      )}

      {bill && !isLoading && (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {/* Title */}
          <div style={{ color: C.white, fontSize: 14, fontFamily: C.fontDisplay, fontWeight: 600, lineHeight: 1.4, marginBottom: 16 }}>
            {bill.title || '—'}
          </div>

          {/* Metadata grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 2 }}>TYPE</div>
              <div style={{ color: C.white, fontSize: 12, fontFamily: C.fontMono }}>{bill.type?.toUpperCase() ?? '—'}</div>
            </div>
            <div>
              <div style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 2 }}>CONGRESS</div>
              <div style={{ color: C.white, fontSize: 12, fontFamily: C.fontMono }}>{bill.congress ?? '—'}</div>
            </div>
            <div>
              <div style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 2 }}>SPONSOR</div>
              <div style={{ color: C.white, fontSize: 12, fontFamily: C.fontMono }}>{bill.sponsor || '—'}</div>
            </div>
            <div>
              <div style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 2 }}>PARTY</div>
              <div style={{
                color: bill.sponsor_party === 'D' ? C.cyan : bill.sponsor_party === 'R' ? C.red : C.whiteDim,
                fontSize: 12,
                fontFamily: C.fontMono,
                fontWeight: 700,
              }}>
                {bill.sponsor_party || '—'}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 2 }}>INTRODUCED</div>
              <div style={{ color: C.white, fontSize: 12, fontFamily: C.fontMono }}>{bill.introduced_date || '—'}</div>
            </div>
          </div>

          {/* Latest action */}
          {bill.latest_action && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>LATEST ACTION</div>
              <div style={{
                background: C.surface2,
                border: `1px solid ${C.border0}`,
                padding: '8px 12px',
                color: C.amberDim,
                fontSize: 11,
                fontFamily: C.fontMono,
                lineHeight: 1.4,
              }}>
                {bill.latest_action}
              </div>
            </div>
          )}

          {/* Summary */}
          {bill.summary && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontDisplay, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>SUMMARY</div>
              <div style={{
                background: C.surface2,
                border: `1px solid ${C.border0}`,
                padding: '10px 12px',
                color: C.whiteDim,
                fontSize: 11,
                fontFamily: C.fontMono,
                lineHeight: 1.5,
                maxHeight: 200,
                overflow: 'auto',
              }}>
                {bill.summary}
              </div>
            </div>
          )}

          {/* Link */}
          {bill.url && (
            <div>
              <a
                href={bill.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: C.cyan, fontSize: 11, fontFamily: C.fontMono, textDecoration: 'none' }}
              >
                View on Congress.gov →
              </a>
            </div>
          )}
        </div>
      )}

      {!bill && !isLoading && billId && (
        <div style={{ padding: 24, color: C.whiteGhost, fontSize: 11, textAlign: 'center' }}>
          Bill details not available
        </div>
      )}
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CongressScreen(_props: Props) {
  const [selectedBill, setSelectedBill] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')

  const { data: billsData, isLoading } = useQuery({
    queryKey: ['congress-bills'],
    queryFn: () => fetchCongressBills(50),
    staleTime: 300_000,
  })

  const allBills = useMemo(() => (billsData?.bills ?? []) as any[], [billsData])

  const filteredBills = useMemo(() => {
    if (!searchFilter.trim()) return allBills
    const q = searchFilter.toLowerCase()
    return allBills.filter(b =>
      (b.bill_id || '').toLowerCase().includes(q) ||
      (b.title || '').toLowerCase().includes(q) ||
      (b.latest_action || '').toLowerCase().includes(q)
    )
  }, [allBills, searchFilter])

  const columns = useMemo(() => [
    { key: 'bill_id', header: 'BILL', type: 'text' as const, width: '100px', render: (row: any) => (
      <span style={{ color: C.amberBright, fontWeight: 700, fontFamily: C.fontMono }}>{row.bill_id}</span>
    )},
    { key: 'title', header: 'TITLE', type: 'text' as const, render: (row: any) => (
      <span style={{ color: C.white, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
        {row.title || '—'}
      </span>
    )},
    { key: 'type', header: 'TYPE', type: 'text' as const, width: '50px', align: 'center' as const, render: (row: any) => (
      <span style={{ color: C.whiteDim, fontSize: 10 }}>{(row.type || '').toUpperCase()}</span>
    )},
    { key: 'congress', header: 'CONG', type: 'text' as const, width: '45px', align: 'center' as const },
    { key: 'latest_action', header: 'STATUS', type: 'text' as const, width: '110px', render: (row: any) => {
      const pill = statusPill(row.latest_action)
      return (
        <span style={{
          display: 'inline-block',
          padding: '2px 6px',
          borderRadius: 2,
          fontSize: 9,
          fontFamily: C.fontMono,
          fontWeight: 700,
          letterSpacing: '0.05em',
          color: pill.color,
          background: pill.bg,
          border: `1px solid ${pill.color}33`,
        }}>
          {pill.label}
        </span>
      )
    }},
  ], [])

  return (
    <Panel title="US CONGRESS" actions={<LiveDot label={isLoading ? 'LOADING' : 'LIVE'} active={!isLoading} />}>
      <LoadingBar loading={isLoading} />

      <div style={{ display: 'flex', height: '100%' }}>
        {/* Main list area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Search/filter bar */}
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border1}`, background: C.surface1 }}>
            <input
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Search bills by ID, title, or action..."
              style={{
                width: '100%',
                background: C.surface2,
                border: `1px solid ${C.border1}`,
                color: C.white,
                fontFamily: C.fontMono,
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 2,
                outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = C.amberMute }}
              onBlur={e => { e.currentTarget.style.borderColor = C.border1 }}
            />
          </div>

          {/* Bills grid */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <DataGrid
              columns={columns}
              data={filteredBills}
              keyField="bill_id"
              onRowClick={(row: any) => setSelectedBill(row.bill_id)}
              emptyMessage="No bills found"
            />
          </div>

          {billsData?.cached && (
            <div style={{ padding: '4px 12px', color: C.amberMute, fontSize: 9, fontFamily: C.fontMono, letterSpacing: '0.05em', textAlign: 'right' }}>
              CACHED
            </div>
          )}
        </div>

        {/* Slide-in detail panel */}
        {selectedBill && (
          <DetailPanel billId={selectedBill} onClose={() => setSelectedBill(null)} />
        )}
      </div>
    </Panel>
  )
}