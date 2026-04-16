import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { chatNotifications } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { ChatNotification } from '../types'
import C from '../lib/colors'

const STORAGE_KEY = 'spectra_chat_last_seen_id'
const TOAST_DURATION_MS = 8_000
const POLL_INTERVAL_MS = 10_000

interface Props {
  onNavigate: (raw: string) => void
}

export default function ChatNotificationToast({ onNavigate }: Props) {
  const { user } = useAuth()
  const [lastSeenId, setLastSeenId] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? parseInt(stored, 10) || 0 : 0
  })
  const [queue, setQueue] = useState<ChatNotification[]>([])
  const [visible, setVisible] = useState<ChatNotification | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Poll for new messages
  const { data } = useQuery<ChatNotification[]>({
    queryKey: ['chat', 'notifications', lastSeenId],
    queryFn: () => chatNotifications(lastSeenId),
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS - 2000,
    enabled: !!user,
  })

  // When new notifications arrive, queue them and advance lastSeenId
  useEffect(() => {
    if (!data || data.length === 0) return
    const maxId = Math.max(...data.map((n) => n.id))
    if (maxId > lastSeenId) {
      setLastSeenId(maxId)
      localStorage.setItem(STORAGE_KEY, String(maxId))
      setQueue((prev) => [...prev, ...data])
    }
  }, [data, lastSeenId])

  // Show next queued notification
  useEffect(() => {
    if (visible || queue.length === 0) return
    const [next, ...rest] = queue
    setVisible(next)
    setQueue(rest)
  }, [visible, queue])

  // Auto-dismiss timer
  useEffect(() => {
    if (!visible) return
    timerRef.current = setTimeout(() => setVisible(null), TOAST_DURATION_MS)
    return () => clearTimeout(timerRef.current)
  }, [visible])

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current)
    setVisible(null)
  }, [])

  const navigate = useCallback(() => {
    if (!visible) return
    clearTimeout(timerRef.current)
    if (visible.kind === 'room' && visible.room_slug) {
      onNavigate(`CHAT #${visible.room_slug}`)
    } else if (visible.kind === 'dm') {
      onNavigate(`CHAT @${visible.sender_username}`)
    }
    setVisible(null)
  }, [visible, onNavigate])

  if (!visible) return null

  const label =
    visible.kind === 'room' && visible.room_slug
      ? `#${visible.room_slug}`
      : `@${visible.sender_username}`

  const preview =
    visible.body.length > 80 ? visible.body.slice(0, 77) + '...' : visible.body

  return (
    <div
      onClick={navigate}
      style={{
        position: 'fixed',
        bottom: '52px',
        right: '16px',
        zIndex: 1100,
        background: C.surface1,
        border: `1px solid ${C.amber}`,
        boxShadow: `0 0 20px ${C.amberGlow}`,
        padding: '12px 16px',
        maxWidth: '360px',
        minWidth: '260px',
        cursor: 'pointer',
        fontFamily: C.fontMono,
        animation: 'slideInRight 200ms ease-out',
      }}
    >
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '6px',
      }}>
        <div style={{
          fontSize: '9px',
          fontFamily: C.fontDisplay,
          fontWeight: 700,
          letterSpacing: '0.2em',
          color: C.amber,
        }}>
          NEW MESSAGE
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); dismiss() }}
          style={{
            background: 'none',
            border: 'none',
            color: C.whiteGhost,
            fontSize: '14px',
            cursor: 'pointer',
            padding: '0 0 0 8px',
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>

      {/* Sender + channel */}
      <div style={{
        fontSize: '12px',
        marginBottom: '4px',
        display: 'flex',
        gap: '8px',
        alignItems: 'baseline',
      }}>
        <span style={{
          color: visible.kind === 'room' ? C.amber : C.cyan,
          fontWeight: 700,
        }}>
          {label}
        </span>
        <span style={{ color: C.whiteDim, fontSize: '11px' }}>
          {visible.sender_username}
        </span>
      </div>

      {/* Message preview */}
      <div style={{
        fontSize: '11px',
        color: C.white,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {preview}
      </div>
    </div>
  )
}
