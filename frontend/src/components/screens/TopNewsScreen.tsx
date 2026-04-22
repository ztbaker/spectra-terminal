import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchNewsWorld } from '../../lib/api'
import type { NewsItem } from '../../types'
import theme from '../../lib/theme'
import LoadingBar from '../shared/LoadingBar'
import ReaderPanel from '../news/ReaderPanel'
import { usePolling } from '../../hooks/usePolling'

const { color, font } = theme

interface Props {
  onNavigate: (cmd: string) => void
}

type WorldTopic = 'general' | 'technology' | 'business' | 'science'

const TOPICS: { key: WorldTopic; label: string }[] = [
  { key: 'general', label: 'Economy' },
  { key: 'technology', label: 'Tech' },
  { key: 'business', label: 'Energy' },
  { key: 'science', label: 'Crypto' },
  { key: 'general', label: 'Politics' },
]

const TOPIC_MAP: Record<string, WorldTopic> = {
  Economy: 'general',
  Tech: 'technology',
  Energy: 'business',
  Crypto: 'science',
  Politics: 'general',
}

function formatTimestamp(unixSeconds: number): string {
  if (!unixSeconds) return '—'
  return new Date(unixSeconds * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(unixSeconds: number): string {
  if (!unixSeconds) return ''
  const diff = Date.now() / 1000 - unixSeconds
  const mins = Math.floor(diff / 60)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const NewsRow: React.FC<{ item: NewsItem; onOpen: (item: NewsItem) => void }> = ({ item, onOpen }) => {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={() => onOpen(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        cursor: 'pointer',
        background: hovered ? 'rgba(255, 153, 0, 0.04)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: '4px',
      }}>
        <span style={{
          color: color.textPrimary,
          fontSize: '12px',
          fontFamily: font.mono,
          fontWeight: 500,
          lineHeight: '1.5',
          flex: 1,
        }}>
          {item.headline}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span style={{
          color: color.accentInfo,
          fontSize: '10px',
          fontFamily: font.mono,
          background: color.bgSurface,
          padding: '1px 5px',
          borderRadius: 2,
        }}>
          {(item.source || '').toUpperCase()}
        </span>
        <span style={{ color: color.textTertiary, fontSize: '10px', fontFamily: font.mono }}>
          {formatTimestamp(item.datetime)}
        </span>
        <span style={{ color: color.textTertiary, fontSize: '10px', fontFamily: font.mono, opacity: 0.6 }}>
          {timeAgo(item.datetime)}
        </span>
      </div>
    </div>
  )
}

const TopNewsScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const [topic, setTopic] = useState<string>('Economy')
  const [reading, setReading] = useState<NewsItem | null>(null)

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['top-news', topic],
    queryFn: () => fetchNewsWorld(TOPIC_MAP[topic] ?? 'general'),
    staleTime: 10_000,
  })

  usePolling(refetch, 15_000)

  const items = useMemo(() =>
    [...(data?.items ?? [])].sort((a, b) => b.datetime - a.datetime),
    [data]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        flexShrink: 0,
      }}>
        <span style={{
          color: color.textPrimary,
          fontSize: '13px',
          fontFamily: font.sans,
          fontWeight: 700,
        }}>
          TOP NEWS
        </span>
        {data && (
          <span style={{
            color: color.textTertiary,
            fontSize: '10px',
            fontFamily: font.mono,
          }}>
            {items.length} ARTICLES
          </span>
        )}
      </div>

      <LoadingBar loading={isLoading} />

      {/* Topic chips */}
      <div style={{
        display: 'flex',
        gap: 6,
        padding: '8px 12px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        background: color.bgElevated,
        flexShrink: 0,
      }}>
        {TOPICS.map(t => {
          const isActive = topic === t.label
          return (
            <button
              key={t.label}
              onClick={() => setTopic(t.label)}
              style={{
                background: isActive ? color.bgSurface : 'transparent',
                color: isActive ? color.textPrimary : color.textSecondary,
                border: `1px solid ${isActive ? color.borderStrong : color.borderMedium}`,
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: font.sans,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                borderRadius: 4,
                transition: 'all 150ms ease',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Articles */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.length === 0 && !isLoading && (
          <div style={{ padding: 24, color: color.textTertiary, textAlign: 'center', fontSize: 12, fontFamily: font.mono }}>
            No world news available
          </div>
        )}
        {items.map((item, idx) => (
          <NewsRow key={`${item.datetime}-${idx}`} item={item} onOpen={setReading} />
        ))}
      </div>

      {data?.cached && (
        <div style={{ padding: '4px 12px', color: color.textTertiary, fontSize: 9, fontFamily: font.mono, letterSpacing: '0.05em', textAlign: 'right' }}>
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

export default TopNewsScreen
