import React, { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchReaderArticle } from '../../lib/api'
import theme from '../../lib/theme'
import LoadingBar from '../shared/LoadingBar'

const { color, font } = theme

interface Props {
  url: string
  fallbackHeadline?: string
  fallbackSource?: string
  onClose: () => void
}

function formatPublished(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const ReaderPanel: React.FC<Props> = ({ url, fallbackHeadline, fallbackSource, onClose }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reader', url],
    queryFn: () => fetchReaderArticle(url),
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const title     = data?.title     ?? fallbackHeadline ?? 'Loading…'
  const site      = data?.site      ?? fallbackSource   ?? ''
  const author    = data?.author    ?? ''
  const published = formatPublished(data?.published ?? null)
  const text      = data?.text      ?? ''
  const errorMsg  = data?.error     ?? (error ? (error as Error).message : null)

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: `${color.bgBase}DA`,
        backdropFilter: 'blur(2px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: color.bgBase,
          border: `1px solid ${color.borderMedium}`,
          boxShadow: theme.shadow.md,
          width: 'min(960px, 100%)',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <LoadingBar loading={isLoading} />

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: `1px solid ${color.borderSubtle}`,
          background: 'rgba(19, 22, 25, 0.8)',
          flexShrink: 0,
        }}>
          <span style={{
            color: color.textPrimary,
            fontSize: 10,
            fontWeight: 700,
            fontFamily: font.mono,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            ▌ READER · {site || '—'}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: color.accentInfo,
                fontSize: 10,
                fontFamily: 'inherit',
                letterSpacing: '0.06em',
                textDecoration: 'none',
                border: `1px solid ${color.accentInfoDim}`,
                padding: '3px 8px',
                borderRadius: 2,
              }}
              title="Open original in external browser"
            >
              OPEN EXT ↗
            </a>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: `1px solid ${color.borderMedium}`,
                color: color.textSecondary,
                fontSize: 10,
                fontFamily: 'inherit',
                padding: '3px 8px',
                cursor: 'pointer',
                borderRadius: 2,
                letterSpacing: '0.06em',
              }}
              title="Close (Esc)"
            >
              CLOSE ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{
          padding: '20px 28px 28px',
          overflowY: 'auto',
          color: color.textPrimary,
          fontFamily: font.sans,
          lineHeight: 1.7,
          fontSize: 14,
        }}>
          <h1 style={{
            color: color.textPrimary,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.25,
            margin: '0 0 10px',
            letterSpacing: '-0.01em',
          }}>
            {title}
          </h1>

          <div style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            color: color.textTertiary,
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            borderBottom: `1px solid ${color.borderSubtle}`,
            paddingBottom: 10,
            marginBottom: 18,
          }}>
            {author    && <span>By <span style={{ color: color.textSecondary }}>{author}</span></span>}
            {published && <span>{published}</span>}
            {data && data.word_count > 0 && <span>{data.word_count.toLocaleString()} words · ~{Math.max(1, Math.round(data.word_count / 220))} min read</span>}
          </div>

          {errorMsg ? (
            <div style={{
              padding: 24,
              border: `1px solid ${color.accentNegativeDim}`,
              background: color.accentNegativeDim,
              color: color.accentNegative,
              fontSize: 12,
              lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6, letterSpacing: '0.06em' }}>
                ▌ EXTRACTION FAILED
              </div>
              <div style={{ color: color.textPrimary, marginBottom: 12 }}>{errorMsg}</div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: color.textPrimary,
                  textDecoration: 'none',
                  borderBottom: `1px solid ${color.textPrimary}`,
                  paddingBottom: 1,
                  fontSize: 11,
                  letterSpacing: '0.06em',
                }}
              >
                OPEN ORIGINAL IN BROWSER ↗
              </a>
            </div>
          ) : isLoading ? (
            <div style={{ color: color.textTertiary, fontSize: 12, padding: 24 }}>
              Extracting article…
            </div>
          ) : (
            text.split(/\n{2,}/).map((para, i) => (
              <p key={i} style={{
                margin: '0 0 16px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {para.trim()}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default ReaderPanel