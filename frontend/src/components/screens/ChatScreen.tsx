import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  chatListRooms,
  chatCreateRoom,
  chatJoinRoom,
  chatLeaveRoom,
  chatRoomMessages,
  chatSendRoomMessage,
  chatListDMs,
  chatDMMessages,
  chatSendDM,
  chatSearchUsers,
} from '../../lib/api'
import type { ChatMessage, ChatRoom, ChatDMThread } from '../../types'
import { useAuth, errorMessage } from '../../lib/auth'
import theme from '../../lib/theme'

const { color, font } = theme

type Thread =
  | { kind: 'none' }
  | { kind: 'room'; slug: string }
  | { kind: 'dm'; username: string }

interface Props {
  sub?: string
  onNavigate: (raw: string) => void
}

function parseSub(sub?: string): Thread {
  if (!sub) return { kind: 'none' }
  if (sub.startsWith('room:')) return { kind: 'room', slug: sub.slice(5) }
  if (sub.startsWith('dm:')) return { kind: 'dm', username: sub.slice(3) }
  return { kind: 'none' }
}

function formatTime(iso: string): string {
  const utc = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'
  const d = new Date(utc)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hhmm = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
  if (sameDay) return hhmm
  const dayMonth = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${dayMonth} ${hhmm}`
}

export default function ChatScreen({ sub, onNavigate }: Props) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const thread = useMemo(() => parseSub(sub), [sub])
  const [composer, setComposer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showNewRoom, setShowNewRoom] = useState(false)
  const [showNewDM, setShowNewDM] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLInputElement>(null)
  const lastMsgCountRef = useRef(0)

  // ── Sidebar queries ────────────────────────────────────────────────────
  const roomsQ = useQuery<ChatRoom[]>({
    queryKey: ['chat', 'rooms'],
    queryFn: chatListRooms,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })
  const dmsQ = useQuery<ChatDMThread[]>({
    queryKey: ['chat', 'dms'],
    queryFn: chatListDMs,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  // ── Active thread messages (poll every 2s) ─────────────────────────────
  const msgsQ = useQuery<ChatMessage[]>({
    queryKey: ['chat', 'thread', thread],
    enabled: thread.kind !== 'none',
    queryFn: () => {
      if (thread.kind === 'room') return chatRoomMessages(thread.slug, 0)
      if (thread.kind === 'dm') return chatDMMessages(thread.username, 0)
      return Promise.resolve([])
    },
    refetchInterval: 2_000,
    staleTime: 1_000,
  })

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const count = msgsQ.data?.length ?? 0
    if (count !== lastMsgCountRef.current) {
      lastMsgCountRef.current = count
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      })
    }
  }, [msgsQ.data])

  // Reset count when switching threads and focus composer
  useEffect(() => {
    lastMsgCountRef.current = 0
    setError(null)
    setTimeout(() => composerRef.current?.focus(), 50)
  }, [sub])

  // ── Mutations ───────────────────────────────────────────────────────────
  const sendMut = useMutation({
    mutationFn: async (body: string) => {
      if (thread.kind === 'room') return chatSendRoomMessage(thread.slug, body)
      if (thread.kind === 'dm') return chatSendDM(thread.username, body)
      throw new Error('no thread selected')
    },
    onSuccess: () => {
      setComposer('')
      qc.invalidateQueries({ queryKey: ['chat', 'thread', thread] })
      qc.invalidateQueries({ queryKey: ['chat', 'dms'] })
      // Keep focus in chat composer after sending
      setTimeout(() => composerRef.current?.focus(), 0)
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const joinMut = useMutation({
    mutationFn: (slug: string) => chatJoinRoom(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'rooms'] }),
    onError: (e) => setError(errorMessage(e)),
  })
  const leaveMut = useMutation({
    mutationFn: (slug: string) => chatLeaveRoom(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'rooms'] }),
    onError: (e) => setError(errorMessage(e)),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const body = composer.trim()
    if (!body || thread.kind === 'none') return
    setError(null)
    sendMut.mutate(body)
  }

  // ── Active thread header info ──────────────────────────────────────────
  const activeRoom =
    thread.kind === 'room'
      ? roomsQ.data?.find((r) => r.slug.toLowerCase() === thread.slug.toLowerCase())
      : undefined

  const titleText =
    thread.kind === 'room' ? `#${thread.slug}`
    : thread.kind === 'dm' ? `@${thread.username}`
    : 'CHAT'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'transparent',
      color: color.textPrimary,
      fontFamily: font.sans,
    }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <div style={{
          width: '220px',
          borderRight: `1px solid ${color.borderSubtle}`,
          background: 'rgba(19, 22, 25, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <SidebarSection
            title="ROOMS"
            action={<TinyButton onClick={() => setShowNewRoom(true)}>+ NEW</TinyButton>}
          >
            {roomsQ.isLoading && <SidebarHint>loading…</SidebarHint>}
            {roomsQ.data && roomsQ.data.length === 0 && (
              <SidebarHint>No rooms yet — create one.</SidebarHint>
            )}
            {roomsQ.data?.map((r) => (
              <SidebarItem
                key={r.id}
                active={thread.kind === 'room' && thread.slug.toLowerCase() === r.slug.toLowerCase()}
                onClick={() => onNavigate(`CHAT #${r.slug}`)}
              >
                <span style={{ color: color.accentPositive }}>#</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.slug}
                </span>
                <span style={{ color: color.textTertiary, fontSize: '9px' }}>
                  {r.member_count}
                </span>
              </SidebarItem>
            ))}
          </SidebarSection>

          <SidebarSection
            title="DIRECT MESSAGES"
            action={<TinyButton onClick={() => setShowNewDM(true)}>+ NEW</TinyButton>}
          >
            {dmsQ.isLoading && <SidebarHint>loading…</SidebarHint>}
            {dmsQ.data && dmsQ.data.length === 0 && (
              <SidebarHint>No conversations yet.</SidebarHint>
            )}
            {dmsQ.data?.map((t) => (
              <SidebarItem
                key={t.peer_id}
                active={thread.kind === 'dm' && thread.username.toLowerCase() === t.peer_username.toLowerCase()}
                onClick={() => onNavigate(`CHAT @${t.peer_username}`)}
              >
                <span style={{ color: color.accentInfo }}>@</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.peer_username}
                </span>
              </SidebarItem>
            ))}
          </SidebarSection>
        </div>

        {/* ── Main pane ────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}>
          {/* Thread header */}
          <div style={{
            padding: '10px 16px',
            borderBottom: `1px solid ${color.borderSubtle}`,
            background: 'rgba(19, 22, 25, 0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              color: color.textPrimary,
              fontFamily: font.sans,
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.12em',
            }}>
              {titleText}
            </div>
            {activeRoom?.description && (
              <div style={{ color: color.textSecondary, fontSize: '11px' }}>
                {activeRoom.description}
              </div>
            )}
            {thread.kind === 'room' && activeRoom && (
              <div style={{ marginLeft: 'auto' }}>
                {activeRoom.joined ? (
                  <TinyButton onClick={() => leaveMut.mutate(activeRoom.slug)}>
                    LEAVE
                  </TinyButton>
                ) : (
                  <TinyButton onClick={() => joinMut.mutate(activeRoom.slug)} primary>
                    JOIN
                  </TinyButton>
                )}
              </div>
            )}
          </div>

          {/* Message log */}
          <div
            ref={logRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 16px',
              fontFamily: font.mono,
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            {thread.kind === 'none' && (
              <EmptyState>
                Select a room or DM to start chatting.<br />
                Type <code style={{ color: color.accentInfo }}>CHAT #slug</code> or{' '}
                <code style={{ color: color.accentInfo }}>CHAT @username</code>.
              </EmptyState>
            )}
            {thread.kind !== 'none' && msgsQ.isLoading && (
              <EmptyState>Loading…</EmptyState>
            )}
            {thread.kind !== 'none' && msgsQ.data && msgsQ.data.length === 0 && (
              <EmptyState>No messages yet. Say something.</EmptyState>
            )}
            {msgsQ.data?.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                isSelf={user?.user_id === m.sender_id}
              />
            ))}
          </div>

          {/* Composer */}
          <form
            onSubmit={onSubmit}
            style={{
              borderTop: `1px solid ${color.borderSubtle}`,
              background: 'rgba(19, 22, 25, 0.6)',
              padding: '10px 12px',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <input
              ref={composerRef}
              className="bb-input"
              style={{ flex: 1, fontSize: '12px' }}
              placeholder={
                thread.kind === 'none'
                  ? 'Select a room or DM…'
                  : thread.kind === 'room'
                  ? `Message #${thread.slug}`
                  : `Message @${thread.username}`
              }
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              disabled={thread.kind === 'none' || sendMut.isPending}
              maxLength={2000}
            />
            <button
              type="submit"
              className="bb-btn bb-btn-active"
              disabled={thread.kind === 'none' || !composer.trim() || sendMut.isPending}
              style={{
                fontSize: '11px',
                padding: '6px 14px',
                letterSpacing: '0.15em',
                opacity: thread.kind === 'none' || !composer.trim() ? 0.4 : 1,
              }}
            >
              SEND
            </button>
          </form>
          {error && (
            <div style={{
              padding: '6px 16px',
              background: '#1a0000',
              borderTop: `1px solid ${color.accentNegativeDim}`,
              color: color.accentNegative,
              fontSize: '11px',
              letterSpacing: '0.05em',
            }}>
              ERROR: {error.toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {showNewRoom && (
        <NewRoomDialog
          onClose={() => setShowNewRoom(false)}
          onCreated={(slug) => {
            setShowNewRoom(false)
            qc.invalidateQueries({ queryKey: ['chat', 'rooms'] })
            onNavigate(`CHAT #${slug}`)
          }}
        />
      )}
      {showNewDM && (
        <NewDMDialog
          onClose={() => setShowNewDM(false)}
          onPick={(username) => {
            setShowNewDM(false)
            onNavigate(`CHAT @${username}`)
          }}
        />
      )}
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function SidebarSection({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto' }}>
      <div style={{
        padding: '10px 12px 6px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${color.borderSubtle}`,
        color: color.textPrimary,
        fontFamily: font.sans,
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.2em',
      }}>
        <span>{title}</span>
        {action}
      </div>
      <div style={{ overflowY: 'auto', padding: '4px 0' }}>
        {children}
      </div>
    </div>
  )
}

function SidebarItem({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        textAlign: 'left',
        padding: '6px 12px',
        border: 'none',
        background: active ? color.bgSurface : 'transparent',
        borderLeft: `2px solid ${active ? color.accentPositive : 'transparent'}`,
        color: active ? color.accentPositive : color.textSecondary,
        fontFamily: font.mono,
        fontSize: '12px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function SidebarHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 12px',
      color: color.textTertiary,
      fontSize: '11px',
      fontStyle: 'italic',
    }}>
      {children}
    </div>
  )
}

function TinyButton({
  onClick,
  children,
  primary,
}: {
  onClick: () => void
  children: React.ReactNode
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: primary ? color.accentPositive : 'transparent',
        color: primary ? color.textInverse : color.textSecondary,
        border: `1px solid ${primary ? color.accentPositive : color.borderSubtle}`,
        padding: '2px 8px',
        fontFamily: font.sans,
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: color.textTertiary,
      fontSize: '11px',
      textAlign: 'center',
      fontFamily: font.sans,
    }}>
      <div>{children}</div>
    </div>
  )
}

function MessageRow({
  message,
  isSelf,
}: {
  message: ChatMessage
  isSelf: boolean
}) {
  return (
    <div style={{
      marginBottom: '8px',
      display: 'flex',
      gap: '8px',
      alignItems: 'baseline',
    }}>
      <span style={{
        color: isSelf ? color.accentPositive : color.accentInfo,
        fontWeight: 700,
        minWidth: '120px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {message.sender_username}
      </span>
      <span style={{
        color: color.textTertiary,
        fontSize: '10px',
        minWidth: '80px',
      }}>
        {formatTime(message.created_at)}
      </span>
      <span style={{
        color: color.textPrimary,
        flex: 1,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
      }}>
        {message.body}
      </span>
    </div>
  )
}

// ─── Create-room dialog ────────────────────────────────────────────────────

function NewRoomDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (slug: string) => void
}) {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const mut = useMutation({
    mutationFn: () => chatCreateRoom(slug.trim(), name.trim(), description.trim() || undefined),
    onSuccess: (room) => onCreated(room.slug),
    onError: (e) => setErr(errorMessage(e)),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(slug.trim().toLowerCase())) {
      setErr('Slug must be lowercase letters, numbers, or dashes')
      return
    }
    if (!name.trim()) {
      setErr('Name is required')
      return
    }
    mut.mutate()
  }

  return (
    <ModalShell title="CREATE ROOM" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <DialogField label="SLUG (URL-friendly)">
          <input
            className="bb-input"
            style={{ width: '100%', fontSize: '13px' }}
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            autoFocus
            placeholder="trading-ideas"
            maxLength={32}
            spellCheck={false}
          />
        </DialogField>
        <DialogField label="NAME">
          <input
            className="bb-input"
            style={{ width: '100%', fontSize: '13px' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Trading Ideas"
            maxLength={64}
          />
        </DialogField>
        <DialogField label="DESCRIPTION (optional)">
          <input
            className="bb-input"
            style={{ width: '100%', fontSize: '13px' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={240}
          />
        </DialogField>
        {err && <DialogError>{err}</DialogError>}
        <DialogFooter>
          <TinyButton onClick={onClose}>CANCEL</TinyButton>
          <button
            type="submit"
            disabled={mut.isPending}
            style={{
              background: color.accentPositive,
              color: color.textInverse,
              border: 'none',
              padding: '6px 16px',
              fontSize: '11px',
              fontFamily: font.sans,
              fontWeight: 700,
              letterSpacing: '0.15em',
              cursor: 'pointer',
              opacity: mut.isPending ? 0.7 : 1,
            }}
          >
            {mut.isPending ? 'CREATING…' : 'CREATE'}
          </button>
        </DialogFooter>
      </form>
    </ModalShell>
  )
}

// ─── Start-DM dialog ───────────────────────────────────────────────────────

function NewDMDialog({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (username: string) => void
}) {
  const [q, setQ] = useState('')
  const usersQ = useQuery({
    queryKey: ['chat', 'users', q],
    queryFn: () => chatSearchUsers(q),
    staleTime: 5_000,
  })

  return (
    <ModalShell title="NEW DIRECT MESSAGE" onClose={onClose}>
      <DialogField label="SEARCH USERS">
        <input
          className="bb-input"
          style={{ width: '100%', fontSize: '13px' }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          placeholder="start typing…"
          maxLength={32}
          spellCheck={false}
        />
      </DialogField>
      <div style={{
        maxHeight: '240px',
        overflowY: 'auto',
        border: `1px solid ${color.borderSubtle}`,
        marginTop: '6px',
      }}>
        {usersQ.data?.length === 0 && (
          <div style={{ padding: '10px', color: color.textTertiary, fontSize: '11px' }}>
            No users found.
          </div>
        )}
        {usersQ.data?.map((u) => (
          <button
            key={u.id}
            onClick={() => onPick(u.username)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '8px 12px',
              color: color.textPrimary,
              fontFamily: font.mono,
              fontSize: '12px',
              cursor: 'pointer',
              borderBottom: `1px solid ${color.borderSubtle}`,
            }}
          >
            <span style={{ color: color.accentInfo }}>@</span>{u.username}
          </button>
        ))}
      </div>
      <DialogFooter>
        <TinyButton onClick={onClose}>CLOSE</TinyButton>
      </DialogFooter>
    </ModalShell>
  )
}

// ─── Shared dialog primitives ──────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: `${color.bgBase}E6`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1200,
    }}>
      <div style={{
        background: 'rgba(19, 22, 25, 0.6)',
        border: `1px solid ${color.borderMedium}`,
        padding: '22px 26px',
        width: '380px',
        maxWidth: '90vw',
        boxShadow: theme.shadow.md,
        fontFamily: font.sans,
      }}>
        <div style={{
          color: color.textPrimary,
          fontFamily: font.sans,
          fontSize: '13px',
          fontWeight: 700,
          letterSpacing: '0.2em',
          marginBottom: '16px',
        }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  )
}

function DialogField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label className="bb-label" style={{ display: 'block', marginBottom: '4px', fontSize: '10px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function DialogError({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: color.accentNegative,
      border: `1px solid ${color.accentNegativeDim}`,
      background: '#1a0000',
      padding: '6px 8px',
      fontSize: '11px',
      letterSpacing: '0.05em',
      marginBottom: '10px',
    }}>
      ERROR: {String(children).toUpperCase()}
    </div>
  )
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '14px' }}>
      {children}
    </div>
  )
}