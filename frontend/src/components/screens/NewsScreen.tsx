import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchNews, fetchNewsCompany } from '../../lib/api'
import type { NewsItem } from '../../types'
import theme from '../../lib/theme'
import TabBar from '../shared/TabBar'
import DataGrid from '../shared/DataGrid'
import LoadingBar from '../shared/LoadingBar'
import ReaderPanel from '../news/ReaderPanel'
import { usePolling } from '../../hooks/usePolling'

interface Props {
  ticker?: string
  onNavigate: (cmd: string) => void
}

type Tab = 'COMPANY' | 'SENTIMENT'

const TABS = [
  { key: 'COMPANY', label: 'Company' },
  { key: 'SENTIMENT', label: 'Sentiment' },
]

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
  if (s === 'positive') return theme.color.accentPositive
  if (s === 'negative') return theme.color.accentNegative
  return theme.color.textSecondary
}

function sentimentLabel(s: NewsItem['sentiment']): string {
  if (s === 'positive') return 'POS'
  if (s === 'negative') return 'NEG'
  if (s === 'neutral') return 'NEU'
  return '—'
}

function sentimentBg(s: NewsItem['sentiment']): string {
  if (s === 'positive') return theme.color.accentPositiveDim
  if (s === 'negative') return theme.color.accentNegativeDim
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
    fontFamily: theme.font.mono,
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
  onOpen: (item: NewsItem) => void
}

const NewsRow: React.FC<NewsRowProps> = ({ item, onOpen }) => {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.color.borderSubtle}`,
        padding: '8px 12px',
        borderLeft: item.sentiment ? `2px solid ${sentimentColor(item.sentiment)}` : `2px solid transparent`,
        cursor: 'pointer',
        transition: 'background 150ms ease',
        background: hovered ? theme.color.bgHover : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(item)}
    >
      <div style={{ lineHeight: 1.45, wordBreak: 'break-word' }}>
        <span style={{ color: theme.color.textSecondary, marginRight: 6, fontSize: 11, fontWeight: 600, fontFamily: theme.font.mono }}>
          [{item.source.toUpperCase()}]
        </span>
        <span style={{ color: theme.color.textPrimary, fontSize: 13, fontWeight: 500 }}>{item.headline}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 11 }}>
        <span style={{ color: theme.color.textTertiary, fontFamily: theme.font.mono }}>{formatTimestamp(item.datetime)}</span>
        <SentimentBadge sentiment={item.sentiment} />
      </div>
      {hovered && item.summary && (
        <div style={{
          marginTop: 6,
          color: theme.color.textSecondary,
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
      { label: 'Positive', count: pos, pct: (pos / total) * 100, color: theme.color.accentPositive },
      { label: 'Neutral',  count: neu, pct: (neu / total) * 100, color: theme.color.textSecondary },
      { label: 'Negative', count: neg, pct: (neg / total) * 100, color: theme.color.accentNegative },
    ]
  }, [items])

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ ...theme.type.caption, color: theme.color.textTertiary, marginBottom: 10 }}>
        Sentiment distribution
      </div>
      {bins.map(bin => (
        <div key={bin.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ color: theme.color.textSecondary, fontSize: 10, fontFamily: theme.font.mono, width: 70, textAlign: 'right' }}>{bin.label}</span>
          <div style={{ flex: 1, height: 14, background: theme.color.bgSurface, borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${bin.pct}%`,
              background: bin.color,
              borderRadius: 2,
              transition: 'width 400ms ease',
              minWidth: bin.count > 0 ? 4 : 0,
            }} />
          </div>
          <span style={{ color: bin.color, fontSize: 11, fontFamily: theme.font.mono, fontVariantNumeric: 'tabular-nums', width: 55, textAlign: 'right' }}>
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
  const [reading, setReading] = useState<NewsItem | null>(null)

  // COMPANY data
  const {
    data: companyData,
    isLoading: companyLoading,
    refetch: refetchCompany,
  } = useQuery({
    queryKey: ['news', ticker ?? 'MARKET'],
    queryFn: () => ticker ? fetchNewsCompany(ticker) : fetchNews(ticker, 100),
    staleTime: 10_000,
  })

  usePolling(refetchCompany, 15_000)

  const companyItems = useMemo(() =>
    [...(companyData?.items ?? [])].sort((a, b) => b.datetime - a.datetime),
    [companyData]
  )

  const sentimentData = useMemo(() => {
    const src = companyItems
    return src.map(item => ({
      ...item,
      sentiment_score: item.sentiment === 'positive' ? 1 : item.sentiment === 'negative' ? -1 : 0,
    }))
  }, [companyItems])

  const sentimentColumns = [
    { key: 'headline', header: 'Headline', type: 'text' as const, render: (row: any) => (
      <span style={{ color: theme.color.textPrimary, fontSize: 12, fontWeight: 500 }}>{row.headline}</span>
    )},
    { key: 'source', header: 'Source', type: 'text' as const, width: '90px', render: (row: any) => (
      <span style={{ color: theme.color.accentInfo, fontSize: 10, background: theme.color.bgSurface, padding: '1px 5px', borderRadius: 2, fontFamily: theme.font.mono }}>{(row.source || '').toUpperCase()}</span>
    )},
    { key: 'sentiment', header: 'Sent', type: 'text' as const, width: '55px', render: (row: any) => (
      <SentimentBadge sentiment={row.sentiment} />
    )},
    { key: 'sentiment_score', header: 'Score', type: 'number' as const, width: '60px', render: (row: any) => (
      <span style={{ color: row.sentiment_score > 0 ? theme.color.accentPositive : row.sentiment_score < 0 ? theme.color.accentNegative : theme.color.textSecondary }}>
        {row.sentiment_score > 0 ? '+1' : row.sentiment_score < 0 ? '-1' : '0'}
      </span>
    )},
  ]

  const isLoading = companyLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <LoadingBar loading={isLoading} />

      {/* Tab bar */}
      <div style={{ padding: '8px 12px 0', borderBottom: `1px solid ${theme.color.borderMedium}` }}>
        <TabBar tabs={TABS} activeKey={activeTab} onChange={(k) => setActiveTab(k as Tab)} />
      </div>

      {/* COMPANY tab */}
      {activeTab === 'COMPANY' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {companyItems.length === 0 && !companyLoading && (
            <div style={{ padding: 24, color: theme.color.textTertiary, textAlign: 'center' }}>
              {ticker ? `No news found for ${ticker}` : 'No market news available'}
            </div>
          )}
          {companyItems.map((item, idx) => (
            <NewsRow key={`${item.datetime}-${idx}`} item={item} onOpen={setReading} />
          ))}
        </div>
      )}

      {/* SENTIMENT tab */}
      {activeTab === 'SENTIMENT' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SentimentHistogram items={companyItems} />
          <div style={{ borderTop: `1px solid ${theme.color.borderMedium}` }}>
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
        <div style={{ padding: '4px 12px', color: theme.color.textTertiary, fontSize: 9, fontFamily: theme.font.mono, letterSpacing: '0.05em', textAlign: 'right' }}>
          CACHED
        </div>
      )}

      {reading && (
        <ReaderPanel
          url={reading.url}
          fallbackHeadline={reading.headline}
          fallbackSource={reading.source}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  )
}

export default NewsScreen
