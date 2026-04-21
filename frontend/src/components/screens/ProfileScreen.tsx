import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchUserProfile } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'

const { color, font } = theme

function formatDate(iso: string): string {
  if (!iso) return '\u2014'
  const utc = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'
  const d = new Date(utc)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

interface Props {
  username?: string
  onNavigate: (cmd: string) => void
}

const ProfileScreen: React.FC<Props> = ({ username, onNavigate }) => {
  const { user } = useAuth()
  const target = username || user?.username || ''

  const { data, isLoading, error } = useQuery({
    queryKey: ['user-profile', target.toLowerCase()],
    queryFn: () => fetchUserProfile(target),
    enabled: !!target,
    staleTime: 30_000,
  })

  const isSelf = user?.username?.toLowerCase() === target.toLowerCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      <div
        className="bb-header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, padding: '6px 12px' }}
      >
        <span>USER PROFILE {isSelf && '\u2014 YOU'}</span>
      </div>

      {error && !isLoading && (
        <div style={{ padding: '12px', color: color.accentNegative, fontSize: '12px' }}>
          ERR: {(error as Error).message ?? 'Failed to load profile'}
        </div>
      )}

      {isLoading && !data && (
        <div style={{ padding: '32px', color: color.textTertiary, fontSize: '12px', textAlign: 'center' }}>
          Loading profile...
        </div>
      )}

      {data && (
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {/* Profile card */}
          <div style={{
            border: `1px solid ${color.borderMedium}`,
            background: 'rgba(19, 22, 25, 0.6)',
            maxWidth: '480px',
          }}>
            {/* Header bar */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${color.borderSubtle}`,
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}>
              {/* Avatar circle */}
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: color.bgSurface,
                border: `2px solid ${data.online ? color.accentPositive : color.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                fontWeight: 700,
                fontFamily: font.mono,
                color: color.textPrimary,
                flexShrink: 0,
              }}>
                {data.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: font.mono,
                  color: color.textPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  {data.username}
                  <span style={{
                    fontSize: '9px',
                    fontFamily: font.sans,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    padding: '2px 6px',
                    borderRadius: '2px',
                    background: data.online ? color.accentPositiveDim : 'rgba(255,255,255,0.05)',
                    color: data.online ? color.accentPositive : color.textTertiary,
                    border: `1px solid ${data.online ? color.accentPositive : color.borderSubtle}`,
                  }}>
                    {data.online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: color.textTertiary, marginTop: '2px' }}>
                  MEMBER SINCE {formatDate(data.created_at).toUpperCase()}
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${color.borderSubtle}` }}>
              <StatCell label="ROOMS JOINED" value={data.rooms_joined} />
              <StatCell label="MESSAGES SENT" value={data.messages_sent} border />
            </div>

            {/* Actions */}
            <div style={{ padding: '12px 20px', display: 'flex', gap: '8px' }}>
              {!isSelf && (
                <button
                  className="bb-btn bb-btn-active"
                  style={{ fontSize: '11px', padding: '6px 16px', letterSpacing: '0.1em' }}
                  onClick={() => onNavigate(`CHAT @${data.username}`)}
                >
                  SEND MESSAGE
                </button>
              )}
              {isSelf && (
                <div style={{ fontSize: '11px', color: color.textTertiary, fontFamily: font.sans }}>
                  This is your profile.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCell({ label, value, border }: { label: string; value: number; border?: boolean }) {
  return (
    <div style={{
      padding: '14px 20px',
      borderLeft: border ? `1px solid ${color.borderSubtle}` : undefined,
    }}>
      <div style={{ fontSize: '9px', color: color.textTertiary, fontFamily: font.sans, fontWeight: 600, letterSpacing: '0.15em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: font.mono, color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}

export default ProfileScreen
