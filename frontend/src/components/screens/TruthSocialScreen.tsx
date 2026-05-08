import React from 'react'
import { useQuery } from '@tanstack/react-query'
import theme from '../../lib/theme'
import { fetchTrumpFeed } from '../../lib/api'
import type { FeedPost } from '../../lib/api'
import LoadingBar from '../shared/LoadingBar'

const { color, font } = theme

interface Props {
  onNavigate: (cmd: string) => void
}

const SOURCE_CONFIG = {
  truth: { color: color.accentWarning, label: 'TRUTH', handle: '@realDonaldTrump' },
  rr47:  { color: color.accentInfo,    label: 'RR47',  handle: '@RapidResponse47' },
  wh:    { color: color.accentPositive,label: 'WH',    handle: '@WhiteHouse' },
} as const

type SourceKey = keyof typeof SOURCE_CONFIG

function sourceKey(p: FeedPost): SourceKey {
  if (p.source === 'truth') return 'truth'
  if (p.username === 'RapidResponse47') return 'rr47'
  return 'wh'
}

function timeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr.replace(' ', 'T') + ':00Z')
    const now = Date.now()
    const diff = now - date.getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return dateStr
  } catch {
    return dateStr
  }
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

const PostRow: React.FC<{ post: FeedPost }> = ({ post }) => {
  const [hovered, setHovered] = React.useState(false)
  const key = sourceKey(post)
  const cfg = SOURCE_CONFIG[key]

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        background: hovered ? 'rgba(255, 153, 0, 0.04)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ background: cfg.color, color: '#000', padding: '1px 6px', fontSize: '9px', fontWeight: 700, fontFamily: font.mono, marginRight: '8px' }}>
            {cfg.label}
          </span>
          <span style={{ color: cfg.color, fontSize: '10px', fontFamily: font.mono, marginRight: '8px' }}>
            {cfg.handle}
          </span>
          <span style={{
            color: color.textTertiary,
            fontSize: '10px',
            fontFamily: font.mono,
            letterSpacing: '0.5px',
          }}>
            {post.created_at}
            <span style={{ marginLeft: '8px', color: color.textTertiary }}>
              {timeAgo(post.created_at)}
            </span>
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ color: color.textTertiary, fontSize: '10px', fontFamily: font.mono }}>
            <span style={{ color: '#ff6b6b' }}>&#9825;</span> {fmtNum(post.favourites_count)}
          </span>
          <span style={{ color: color.textTertiary, fontSize: '10px', fontFamily: font.mono }}>
            <span style={{ color: color.accentPositive }}>&#8635;</span> {fmtNum(post.reblogs_count)}
          </span>
          <span style={{ color: color.textTertiary, fontSize: '10px', fontFamily: font.mono }}>
            <span style={{ color: color.accentInfo }}>&#9993;</span> {fmtNum(post.replies_count)}
          </span>
        </div>
      </div>

      <div style={{
        color: color.textPrimary,
        fontSize: '12px',
        fontFamily: font.mono,
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {post.content}
      </div>

      <div style={{ marginTop: '6px' }}>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: color.accentWarning,
            fontSize: '10px',
            fontFamily: font.mono,
            textDecoration: 'none',
            opacity: 0.6,
          }}
        >
          {post.source === 'truth' ? 'VIEW ON TRUTH SOCIAL \u2197' : 'VIEW ON X \u2197'}
        </a>
      </div>
    </div>
  )
}

const TrumpScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const [active, setActive] = React.useState<{ truth: boolean; rr47: boolean; wh: boolean }>({
    truth: true,
    rr47: true,
    wh: true,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['trumpFeed'],
    queryFn: fetchTrumpFeed,
    staleTime: 500,
    refetchInterval: 1_000,
  })

  const toggle = (key: SourceKey) => {
    setActive(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const filtered = data ? data.posts.filter(p => active[sourceKey(p)]) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            color: color.textPrimary,
            fontSize: '13px',
            fontFamily: font.sans,
            fontWeight: 700,
          }}>
            TRUMP FEED
          </span>
          {(['truth', 'rr47', 'wh'] as SourceKey[]).map(key => {
            const cfg = SOURCE_CONFIG[key]
            const src = data?.sources[key]
            const isActive = active[key]
            const hasError = src && !src.ok
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                title={hasError && src ? src.error ?? undefined : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  fontSize: '10px',
                  fontFamily: font.mono,
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: isActive ? 1 : 0.35,
                  background: 'transparent',
                  color: color.textPrimary,
                  border: `1px solid ${hasError ? '#ff4444' : color.borderSubtle}`,
                  borderRadius: '3px',
                  transition: 'opacity 0.15s',
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  background: cfg.color,
                }} />
                {cfg.label}
                {src != null && ` ${src.count}`}
              </button>
            )
          })}
        </div>
        {data?.cached && (
          <span style={{
            color: color.textTertiary,
            fontSize: '9px',
            fontFamily: font.mono,
            background: 'rgba(255,255,255,0.05)',
            padding: '2px 6px',
            borderRadius: '3px',
          }}>
            CACHED
          </span>
        )}
      </div>

      <LoadingBar loading={isLoading} />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {error && (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: color.accentNegative,
            fontSize: '12px',
            fontFamily: font.mono,
          }}>
            Failed to load Trump feed. Try again later.
          </div>
        )}

        {filtered.map(post => (
          <PostRow key={post.id} post={post} />
        ))}

        {!isLoading && data && filtered.length === 0 && (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: color.textTertiary,
            fontSize: '12px',
            fontFamily: font.mono,
          }}>
            {data.posts.length === 0
              ? 'No posts found.'
              : 'No sources active. Click a chip above to enable.'}
          </div>
        )}
      </div>
    </div>
  )
}

export default TrumpScreen