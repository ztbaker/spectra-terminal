import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchNews, fetchNewsCompany, fetchNewsWorld } from '../../lib/api'
import type { NewsItem } from '../../types'
import C from '../../lib/colors'
import TabBar from '../shared/TabBar'
import DataGrid from '../shared/DataGrid'
import LiveDot from '../shared/LiveDot'
import LoadingBar from '../shared/LoadingBar'
import { usePolling } from '../../hooks/usePolling'

interface Props {
  ticker?: string
  onNavigate: (cmd: string) => void
}

type Tab = 'COMPANY' | 'WORLD' | 'SENTIMENT'
type WorldTopic = 'general' | 'technology' | 'business' | 'science'

const TABS = [
  { key: 'COMPANY', label: 'COMPANY' },
  { key: 'WORLD', label: 'WORLD' },
  { key: 'SENTIMENT', label: 'SENTIMENT' },
]

const WORLD_TOPICS: { key: WorldTopic; label: string }[] = [
  { key: 'general', label: 'ECONOMY' },
  { key: 'technology', label: 'TECH' },
  { key: 'business', label: 'ENERGY' },
  { key: 'science', label: 'CRYPTO' },
  { key: 'general', label: 'POLITICS' },
]

const TOPIC_MAP: Record<string, WorldTopic> = {
  ECONOMY: 'general',
  TECH: 'technology',
  ENERGY: 'business',
  CRYPTO: 'science',
  POLITICS: 'general',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(unixSeconds: number): string {
  if (!unixSeconds) return '—'
  return new Date(unixSeconds * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function sentimentColor(s: NewsItem['sentiment']): string {
  if (s === 'positive') return C.green
  if (s === 'negative') return C.red
  return C.amberBright
}

function sentimentLabel(s: NewsItem['sentiment']): string {
  if (s === 'positive') return 'POS'
  if (s === 'negative') return 'NEG'
  if (s === 'neutral') return 'NEU'
  return '—'
}

function sentimentBg(s: NewsItem['sentiment']): string {
  if (s === 'positive') return C.greenDim
  if (s === 'negative') return C.redDim
  return 'transparent'
}

// ─── Sentiment Badge ─────────────────────────────────────────────────────────

const SentimentBadge: React.FC<{ sentiment: NewsItem['sentiment'] }> = ({ sentiment }) => (
  <span style={{
    display: 'inline-block',
    color: sentimentColor(sentiment),
    border: `1px solid ${sentimentColor(sentiment)}`,
    background: sentimentBg(sentiment),
    padding: '0 5px',
    fontSize: 10,
    fontFamily: C.fontMono,
    fontWeight: 700,
    letterSpacing: '0.06em',
    borderRadius: 2,
  }}>
    {sentimentLabel(sentiment)}
  </span>
)

// ─── News Item Row ────────────────────────────────────────────────────────────

interface NewsRowProps {
  item: NewsItem
  onHover?: (preview: string | null) => void
}

const NewsRow: React.FC<NewsRowProps> = ({ item, onHover }) => {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        borderBottom: `1px solid ${C.border0}`,
        padding: '8px 12px',
        borderLeft: item.sentiment ? `2px solid ${sentimentColor(item.sentiment)}` : `2px solid transparent`,
        cursor: 'pointer',
        transition: 'background 150ms ease',
        background: hovered ? C.surfaceGlow : 'transparent',
      }}
      onMouseEnter={() => { setHovered(true); onHover?.(item.summary || null) }}
      onMouseLeave={() => { setHovered(false); onHover?.(null) }}
      onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
    >
      <div style={{ lineHeight: 1.45, wordBreak: 'break-word' }}>
        <span style={{ color: C.amberBright, marginRight: 6, fontSize: 11, fontWeight: 700 }}>
          [{item.source.toUpperCase()}]
        </span>
        <span style={{ color: C.white, fontSize: 13, fontFamily: C.fontBody, fontWeight: 500 }}>{item.headline}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 11 }}>
        <span style={{ color: C.whiteGhost }}>{formatTimestamp(item.datetime)}</span>
        <SentimentBadge sentiment={item.sentiment} />
      </div>
      {hovered && item.summary && (
        <div style={{
          marginTop: 6,
          color: C.whiteDim,
          fontSize: 11,
          lineHeight: 1.4,
          maxHeight: 36,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {item.summary.slice(0, 200)}{item.summary.length > 200 ? '...' : ''}
        </div>
      )}
    </div>
  )
}

// ─── Sentiment Histogram ──────────────────────────────────────────────────────

interface SentimentHistogramProps {
  items: NewsItem[]
}

const SentimentHistogram: React.FC<SentimentHistogramProps> = ({ items }) => {
  const bins = useMemo(() => {
    const pos = items.filter(i => i.sentiment === 'positive').length
    const neu = items.filter(i => i.sentiment === 'neutral').length
    const neg = items.filter(i => i.sentiment === 'negative').length
    const total = pos + neu + neg || 1
    return [
      { label: 'POSITIVE', count: pos, pct: (pos / total) * 100, color: C.green },
      { label: 'NEUTRAL', count: neu, pct: (neu / total) * 100, color: C.amberBright },
      { label: 'NEGATIVE', count: neg, pct: (neg / total) * 100, color: C.red },
    ]
  }, [items])

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ color: C.amberMute, fontSize: 10, letterSpacing: '0.08em', marginBottom: 10, fontFamily: C.fontDisplay, fontWeight: 700 }}>
        SENTIMENT DISTRIBUTION
      </div>
      {bins.map(bin => (
        <div key={bin.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ color: C.whiteDim, fontSize: 10, fontFamily: C.fontMono, width: 70, textAlign: 'right' }}>{bin.label}</span>
          <div style={{ flex: 1, height: 14, background: C.surface2, borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${bin.pct}%`,
              background: bin.label === 'POSITIVE' ? `linear-gradient(90deg, ${C.greenDim}, ${C.green})`
                : bin.label === 'NEGATIVE' ? `linear-gradient(90deg, ${C.redDim}, ${C.red})`
                : bin.color,
              borderRadius: 2,
              transition: 'width 400ms ease',
              minWidth: bin.count > 0 ? 4 : 0,
            }} />
          </div>
          <span style={{ color: bin.color, fontSize: 11, fontFamily: C.fontMono, fontVariantNumeric: 'tabular-nums', width: 55, textAlign: 'right' }}>
            {bin.count} ({bin.pct.toFixed(0)}%)
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const NewsScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [activeTab, setActiveTab] = useState<Tab>('COMPANY')
  const [worldTopic, setWorldTopic] = useState<string>('ECONOMY')
  const [hoverPreview, setHoverPreview] = useState<string | null>(null)

  // COMPANY data
  const {
    data: companyData,
    isLoading: companyLoading,
    refetch: refetchCompany,
  } = useQuery({
    queryKey: ['news', ticker ?? 'MARKET'],
    queryFn: () => ticker ? fetchNewsCompany(ticker) : fetchNews(ticker, 100),
    staleTime: 60_000,
  })

  // WORLD data
  const {
    data: worldData,
    isLoading: worldLoading,
    refetch: refetchWorld,
  } = useQuery({
    queryKey: ['news-world', worldTopic],
    queryFn: () => fetchNewsWorld(TOPIC_MAP[worldTopic] ?? 'general'),
    enabled: activeTab === 'WORLD',
    staleTime: 60_000,
  })

  usePolling(refetchCompany, 5 * 60_000)
  usePolling(refetchWorld, 5 * 60_000, activeTab === 'WORLD')

  const companyItems = useMemo(() =>
    [...(companyData?.items ?? [])].sort((a, b) => b.datetime - a.datetime),
    [companyData]
  )

  const worldItems = useMemo(() =>
    [...(worldData?.items ?? [])].sort((a, b) => b.datetime - a.datetime),
    [worldData]
  )

  const sentimentData = useMemo(() => {
    const src = activeTab === 'WORLD' ? worldItems : companyItems
    return src.map(item => ({
      ...item,
      sentiment_score: item.sentiment === 'positive' ? 1 : item.sentiment === 'negative' ? -1 : 0,
    }))
  }, [activeTab, companyItems, worldItems])

  const sentimentColumns = [
    { key: 'headline', header: 'HEADLINE', type: 'text' as const, render: (row: any) => (
      <span style={{ color: C.white, fontSize: 12, fontFamily: C.fontBody, fontWeight: 500 }}>{row.headline}</span>
    )},
    { key: 'source', header: 'SOURCE', type: 'text' as const, width: '90px', render: (row: any) => (
      <span style={{ color: C.cyan, fontSize: 10, background: C.surface2, padding: '1px 5px', borderRadius: 2 }}>{(row.source || '').toUpperCase()}</span>
    )},
    { key: 'sentiment', header: 'SENT', type: 'text' as const, width: '55px', render: (row: any) => (
      <SentimentBadge sentiment={row.sentiment} />
    )},
    { key: 'sentiment_score', header: 'SCORE', type: 'number' as const, width: '60px', render: (row: any) => (
      <span style={{ color: row.sentiment_score > 0 ? C.green : row.sentiment_score < 0 ? C.red : C.amberBright }}>
        {row.sentiment_score > 0 ? '+1' : row.sentiment_score < 0 ? '-1' : '0'}
      </span>
    )},
  ]

  const isLoading = activeTab === 'COMPANY' ? companyLoading : activeTab === 'WORLD' ? worldLoading : companyLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <LoadingBar loading={isLoading} />

      {/* Tab bar */}
      <div style={{ padding: '8px 12px 0', borderBottom: `1px solid ${C.border1}` }}>
        <TabBar tabs={TABS} activeKey={activeTab} onChange={(k) => setActiveTab(k as Tab)} />
      </div>

      {/* Hover preview */}
      {hoverPreview && (
        <div style={{
          padding: '6px 16px',
          background: C.surface2,
          borderBottom: `1px solid ${C.border1}`,
          color: C.whiteDim,
          fontSize: 11,
          lineHeight: 1.4,
          fontFamily: C.fontMono,
        }}>
          {hoverPreview}
        </div>
      )}

      {/* COMPANY tab */}
      {activeTab === 'COMPANY' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {companyItems.length === 0 && !companyLoading && (
            <div style={{ padding: 24, color: C.whiteGhost, textAlign: 'center' }}>
              {ticker ? `No news found for ${ticker}` : 'No market news available'}
            </div>
          )}
          {companyItems.map((item, idx) => (
            <NewsRow key={`${item.datetime}-${idx}`} item={item} onHover={setHoverPreview} />
          ))}
        </div>
      )}

      {/* WORLD tab */}
      {activeTab === 'WORLD' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Topic chips */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${C.border0}`, background: C.bg1 }}>
            {WORLD_TOPICS.map(t => {
              const isActive = worldTopic === t.label
              return (
                <button
                  key={t.label}
                  onClick={() => setWorldTopic(t.label)}
                  style={{
                    background: isActive ? C.amberGhost : 'transparent',
                    color: isActive ? C.amber : C.whiteDim,
                    border: `1px solid ${isActive ? C.amberMute : C.border1}`,
                    padding: '4px 10px',
                    fontSize: 10,
                    fontFamily: C.fontMono,
                    fontWeight: isActive ? 700 : 400,
                    cursor: 'pointer',
                    borderRadius: 2,
                    letterSpacing: '0.05em',
                    transition: 'all 150ms ease',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          {worldItems.length === 0 && !worldLoading && (
            <div style={{ padding: 24, color: C.whiteGhost, textAlign: 'center' }}>No world news available</div>
          )}
          {worldItems.map((item, idx) => (
            <NewsRow key={`${item.datetime}-${idx}`} item={item} onHover={setHoverPreview} />
          ))}
        </div>
      )}

      {/* SENTIMENT tab */}
      {activeTab === 'SENTIMENT' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SentimentHistogram items={activeTab === 'WORLD' ? worldItems : companyItems} />
          <div style={{ borderTop: `1px solid ${C.border1}` }}>
            <DataGrid
              columns={sentimentColumns}
              data={sentimentData as any}
              keyField="headline"
              maxHeight="calc(100vh - 280px)"
              emptyMessage="No sentiment data"
            />
          </div>
        </div>
      )}

      {companyData?.cached && (
        <div style={{ padding: '4px 12px', color: C.amberMute, fontSize: 9, fontFamily: C.fontMono, letterSpacing: '0.05em', textAlign: 'right' }}>
          CACHED
        </div>
      )}
    </div>
  )
}

export default NewsScreen