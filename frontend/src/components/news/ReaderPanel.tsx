import React, { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchReaderArticle } from '../../lib/api'
import C from '../../lib/colors'
import LoadingBar from '../shared/LoadingBar'

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
        background: 'rgba(0,0,0,0.75)',
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
          background: C.surface0,
          border: `1px solid ${C.border2}`,
          boxShadow: C.shadowGlow,
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
          borderBottom: `1px solid ${C.border1}`,
          background: C.surface1,
          flexShrink: 0,
        }}>
          <span style={{
            color: C.amber,
            fontSize: 10,
            fontWeight: 700,
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
                color: C.cyan,
                fontSize: 10,
                fontFamily: 'inherit',
                letterSpacing: '0.06em',
                textDecoration: 'none',
                border: `1px solid ${C.cyanDim}`,
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
                border: `1px solid ${C.border2}`,
                color: C.whiteDim,
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
          color: C.white,
          lineHeight: 1.7,
          fontSize: 14,
        }}>
          <h1 style={{
            color: C.amberBright,
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
            color: C.whiteGhost,
            fontSize: 11,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            borderBottom: `1px solid ${C.border0}`,
            paddingBottom: 10,
            marginBottom: 18,
          }}>
            {author    && <span>By <span style={{ color: C.whiteDim }}>{author}</span></span>}
            {published && <span>{published}</span>}
            {data && data.word_count > 0 && <span>{data.word_count.toLocaleString()} words · ~{Math.max(1, Math.round(data.word_count / 220))} min read</span>}
          </div>

          {errorMsg ? (
            <div style={{
              padding: 24,
              border: `1px solid ${C.redDim}`,
              background: C.redGlow,
              color: C.redBright,
              fontSize: 12,
              lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6, letterSpacing: '0.06em' }}>
                ▌ EXTRACTION FAILED
              </div>
              <div style={{ color: C.white, marginBottom: 12 }}>{errorMsg}</div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: C.amberBright,
                  textDecoration: 'none',
                  borderBottom: `1px solid ${C.amberBright}`,
                  paddingBottom: 1,
                  fontSize: 11,
                  letterSpacing: '0.06em',
                }}
              >
                OPEN ORIGINAL IN BROWSER ↗
              </a>
            </div>
          ) : isLoading ? (
            <div style={{ color: C.whiteGhost, fontSize: 12, padding: 24 }}>
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
