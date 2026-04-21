import React from 'react'
import { useQuery } from '@tanstack/react-query'
import theme from '../../lib/theme'
import { fetchTruthSocial } from '../../lib/api'
import type { TruthPost } from '../../lib/api'
import LoadingBar from '../shared/LoadingBar'

const { color, font } = theme

interface Props {
  onNavigate: (cmd: string) => void
}

// ─── Format helpers ─────────────────────────────────────────────────────────

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

// ─── Post row ───────────────────────────────────────────────────────────────

const TruthRow: React.FC<{ post: TruthPost }> = ({ post }) => {
  const [hovered, setHovered] = React.useState(false)

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
      {/* Header: time + engagement */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
      }}>
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

      {/* Content */}
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

      {/* Link */}
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
          VIEW ON TRUTH SOCIAL &#8594;
        </a>
      </div>
    </div>
  )
}

// ─── Main screen ────────────────────────────────────────────────────────────

const TruthSocialScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['truthsocial', 'realDonaldTrump'],
    queryFn: () => fetchTruthSocial('realDonaldTrump', 40),
    staleTime: 500,
    refetchInterval: 1_000,
  })

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            color: color.textPrimary,
            fontSize: '13px',
            fontFamily: font.sans,
            fontWeight: 700,
          }}>
            TRUTH SOCIAL
          </span>
          <span style={{
            color: color.accentWarning,
            fontSize: '11px',
            fontFamily: font.mono,
            fontWeight: 700,
          }}>
            @realDonaldTrump
          </span>
          {data && (
            <span style={{
              color: color.textTertiary,
              fontSize: '10px',
              fontFamily: font.mono,
            }}>
              {data.posts.length} POSTS
            </span>
          )}
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

      {/* Posts */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {error && (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: color.accentNegative,
            fontSize: '12px',
            fontFamily: font.mono,
          }}>
            Failed to load Truth Social posts. Try again later.
          </div>
        )}

        {data?.posts.map(post => (
          <TruthRow key={post.id} post={post} />
        ))}

        {!isLoading && data?.posts.length === 0 && (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: color.textTertiary,
            fontSize: '12px',
            fontFamily: font.mono,
          }}>
            No posts found.
          </div>
        )}
      </div>
    </div>
  )
}

export default TruthSocialScreen
