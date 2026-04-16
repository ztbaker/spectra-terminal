import React from 'react'
import C from '../../lib/colors'

interface SkeletonRowProps {
  width?: string
  height?: string
  delay?: number
}

export const SkeletonRow: React.FC<SkeletonRowProps> = ({
  width = '100%',
  height = '14px',
  delay = 0,
}) => {
  return (
    <div
      className="bb-shimmer"
      style={{
        width,
        height,
        borderRadius: '3px',
        animationDelay: `${delay}ms`,
        marginBottom: '6px',
      }}
    />
  )
}

interface SkeletonBlockProps {
  rows?: number
  lineHeight?: string
  gap?: string
}

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
  rows = 3,
  lineHeight = '14px',
  gap = '6px',
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow
          key={i}
          height={lineHeight}
          width={i === rows - 1 ? '60%' : '100%'}
          delay={i * 100}
        />
      ))}
    </div>
  )
}

interface SkeletonOverlayProps {
  loading: boolean
  children?: React.ReactNode
}

export const SkeletonOverlay: React.FC<SkeletonOverlayProps> = ({ loading, children }) => {
  if (!loading) return null
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: `${C.surface0}cc`,
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '16px',
    }}>
      {children ?? <SkeletonBlock rows={5} />}
    </div>
  )
}

