import React from 'react'

interface Props {
  loading: boolean
}

const LoadingBar: React.FC<Props> = ({ loading }) => {
  return (
    <div style={{
      height: '2px',
      width: '100%',
      position: 'relative',
      background: loading ? 'rgba(255,255,255,0.04)' : 'transparent',
      flexShrink: 0,
      borderRadius: '1px',
      overflow: 'hidden',
    }}>
      {loading && (
        <div className="bb-loading-bar" />
      )}
    </div>
  )
}

export default LoadingBar
