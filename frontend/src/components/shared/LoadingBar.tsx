import React from 'react'
import C from '../../lib/colors'

interface Props {
  loading: boolean
}

const LoadingBar: React.FC<Props> = ({ loading }) => {
  return (
    <div style={{
      height: '2px',
      width: '100%',
      position: 'relative',
      background: 'transparent',
      flexShrink: 0,
    }}>
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '2px',
          width: '40%',
          background: `linear-gradient(90deg, transparent, ${C.amber}, transparent)`,
          animation: 'shimmer 1.5s ease-in-out infinite',
          backgroundSize: '200% 100%',
        }} />
      )}
    </div>
  )
}

export default LoadingBar