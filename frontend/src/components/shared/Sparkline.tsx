import React from 'react'

interface Props {
  data: (number | null)[]
  width?: number   // default 80
  height?: number  // default 24
  color?: string   // default #ff9900
}

/**
 * Tiny inline SVG sparkline chart.
 * Filters out null values, normalises the remaining data to fit the given
 * height, and draws a single polyline. Renders nothing if fewer than 2
 * valid data points are available.
 */
const Sparkline: React.FC<Props> = ({
  data,
  width = 80,
  height = 24,
  color = '#F59E0B',
}) => {
  const values = data.filter((v): v is number => v !== null)

  if (values.length < 2) return null

  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal

  // Avoid division-by-zero when all values are identical
  const normalise = (v: number): number =>
    range === 0 ? height / 2 : height - ((v - minVal) / range) * height

  const stepX = width / (values.length - 1)

  const points = values
    .map((v, i) => `${(i * stepX).toFixed(2)},${normalise(v).toFixed(2)}`)
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default Sparkline
