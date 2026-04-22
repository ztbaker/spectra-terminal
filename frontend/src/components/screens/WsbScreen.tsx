import React from 'react'
import { useQuery } from '@tanstack/react-query'
import theme from '../../lib/theme'
import { fetchWsb } from '../../lib/api'
import type { WsbComment } from '../../lib/api'
import LoadingBar from '../shared/LoadingBar'

const { color, font } = theme

interface Props {
  onNavigate: (cmd: string) => void
}

// ─── Format helpers ─────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const now = Date.now() / 1000
  const diff = now - ts
  if (diff < 60) return 'just now'
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function fmtScore(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function scoreColor(score: number): string {
  if (score >= 10) return color.accentPositive
  if (score <= -5) return color.accentNegative
  return color.textSecondary
}

// ─── Cashtag rendering ──────────────────────────────────────────────────────

function renderBody(body: string, onNavigate: (cmd: string) => void): React.ReactNode {
  // Split on $TICKER patterns
  const parts = body.split(/(\$[A-Z]{1,5})/g)
  if (parts.length === 1) return body

  return parts.map((part, i) => {
    if (/^\$[A-Z]{1,5}$/.test(part)) {
      const ticker = part.slice(1)
      return (
        <span
          key={i}
          onClick={(e) => { e.stopPropagation(); onNavigate(ticker) }}
          style={{
            color: color.accentWarning,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// ─── Comment row ────────────────────────────────────────────────────────────

const CommentRow: React.FC<{ comment: WsbComment; onNavigate: (cmd: string) => void }> = ({ comment, onNavigate }) => {
  const [hovered, setHovered] = React.useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: comment.depth > 0 ? '8px 16px 8px 32px' : '10px 16px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        background: hovered ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      {/* Header: author + score + time */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '4px',
      }}>
        <span style={{
          color: comment.is_op ? color.accentInfo : color.accentWarning,
          fontSize: '10px',
          fontFamily: font.mono,
          fontWeight: 600,
        }}>
          {comment.author}
          {comment.is_op && (
            <span style={{
              marginLeft: '4px',
              color: color.accentInfo,
              fontSize: '9px',
              background: color.accentInfoDim,
              padding: '1px 4px',
              borderRadius: '2px',
            }}>OP</span>
          )}
        </span>

        <span style={{
          color: scoreColor(comment.score),
          fontSize: '10px',
          fontFamily: font.mono,
          fontWeight: 600,
        }}>
          {comment.score > 0 ? '+' : ''}{fmtScore(comment.score)}
        </span>

        <span style={{
          color: color.textTertiary,
          fontSize: '10px',
          fontFamily: font.mono,
          marginLeft: 'auto',
        }}>
          {timeAgo(comment.created_utc)}
        </span>
      </div>

      {/* Body */}
      <div style={{
        color: color.textPrimary,
        fontSize: '12px',
        fontFamily: font.mono,
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {renderBody(comment.body, onNavigate)}
      </div>
    </div>
  )
}

// ─── Main screen ────────────────────────────────────────────────────────────

type SortMode = 'new' | 'top'

const WsbScreen: React.FC<Props> = ({ onNavigate }) => {
  const [sort, setSort] = React.useState<SortMode>('new')

  const { data, isLoading, error } = useQuery({
    queryKey: ['wsb', sort],
    queryFn: () => fetchWsb(sort, 200),
    staleTime: 5_000,
    refetchInterval: 5_000,
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
            r/WALLSTREETBETS
          </span>
          <span style={{
            color: color.accentPositive,
            fontSize: '11px',
            fontFamily: font.mono,
            fontWeight: 700,
          }}>
            DAILY DISCUSSION
          </span>
          {data?.thread && (
            <span style={{
              color: color.textTertiary,
              fontSize: '10px',
              fontFamily: font.mono,
            }}>
              {data.total_comments.toLocaleString()} COMMENTS
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Sort toggle */}
          {(['new', 'top'] as SortMode[]).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              style={{
                background: sort === s ? color.bgActive : 'transparent',
                border: `1px solid ${sort === s ? color.borderStrong : color.borderSubtle}`,
                borderRadius: '3px',
                padding: '2px 10px',
                color: sort === s ? color.textPrimary : color.textTertiary,
                fontSize: '10px',
                fontFamily: font.mono,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {s.toUpperCase()}
            </button>
          ))}

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
      </div>

      {/* Thread title bar */}
      {data?.thread && (
        <div style={{
          padding: '6px 16px',
          borderBottom: `1px solid ${color.borderSubtle}`,
          flexShrink: 0,
        }}>
          <a
            href={data.thread.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: color.textSecondary,
              fontSize: '11px',
              fontFamily: font.mono,
              textDecoration: 'none',
            }}
          >
            {data.thread.title}
            <span style={{ color: color.textTertiary, marginLeft: '8px', fontSize: '10px' }}>
              &#8594; OPEN ON REDDIT
            </span>
          </a>
        </div>
      )}

      <LoadingBar loading={isLoading} />

      {/* Comments */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {error && (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: color.accentNegative,
            fontSize: '12px',
            fontFamily: font.mono,
          }}>
            Failed to load WSB thread. Try again later.
          </div>
        )}

        {data?.error && !data.comments.length && (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: color.accentWarning,
            fontSize: '12px',
            fontFamily: font.mono,
          }}>
            {data.error}
          </div>
        )}

        {data?.comments.map(comment => (
          <CommentRow key={comment.id} comment={comment} onNavigate={onNavigate} />
        ))}

        {!isLoading && data && !data.error && data.comments.length === 0 && (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: color.textTertiary,
            fontSize: '12px',
            fontFamily: font.mono,
          }}>
            No comments yet. The daily thread may not be posted yet today.
          </div>
        )}
      </div>
    </div>
  )
}

export default WsbScreen
