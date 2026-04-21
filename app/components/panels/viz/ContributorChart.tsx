/**
 * ContributorChart - Joy Division "Unknown Pleasures" style ridgeline chart
 * 
 * Displays commit activity from top contributors as stacked waveforms,
 * inspired by the iconic album cover visualization.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { ContributorStats } from '../../../types/electron'

export interface ContributorChartProps {
  /** Number of top contributors to display */
  topN?: number
  /** Time bucket size for grouping commits */
  bucketSize?: 'day' | 'week' | 'month'
  /** Chart height in pixels */
  height?: number
  /** Whether to use dark/inverted theme (Joy Division style) */
  invertedTheme?: boolean
  /** Callback to open the mailmap management panel */
  onManageUsers?: () => void
}

// Smooth a data series using a simple moving average
function smoothData(data: number[], windowSize: number = 3): number[] {
  const result: number[] = []
  const halfWindow = Math.floor(windowSize / 2)
  
  for (let i = 0; i < data.length; i++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(data.length - 1, i + halfWindow); j++) {
      sum += data[j]
      count++
    }
    result.push(sum / count)
  }
  return result
}

// Generate SVG path for a ridgeline using cubic bezier curves
function generateRidgePath(
  data: number[],
  baseY: number,
  xScale: number,
  yScale: number,
  startX: number
): string {
  if (data.length === 0) return ''
  
  const smoothed = smoothData(data, 5)
  const points: [number, number][] = smoothed.map((val, i) => [
    startX + i * xScale,
    baseY - val * yScale
  ])
  
  if (points.length < 2) {
    return `M ${points[0][0]} ${points[0][1]}`
  }
  
  // Create smooth bezier curve through points
  let path = `M ${points[0][0]} ${baseY}`
  path += ` L ${points[0][0]} ${points[0][1]}`
  
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    
    // Control points for smooth curve
    const cpX = (x0 + x1) / 2
    path += ` C ${cpX} ${y0}, ${cpX} ${y1}, ${x1} ${y1}`
  }
  
  // Close the path back to baseline for fill
  path += ` L ${points[points.length - 1][0]} ${baseY}`
  path += ' Z'
  
  return path
}

// Generate just the line path (not filled) for the ridge
function generateRidgeLinePath(
  data: number[],
  baseY: number,
  xScale: number,
  yScale: number,
  startX: number
): string {
  if (data.length === 0) return ''
  
  const smoothed = smoothData(data, 5)
  const points: [number, number][] = smoothed.map((val, i) => [
    startX + i * xScale,
    baseY - val * yScale
  ])
  
  if (points.length < 2) {
    return `M ${points[0][0]} ${points[0][1]}`
  }
  
  let path = `M ${points[0][0]} ${points[0][1]}`
  
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const cpX = (x0 + x1) / 2
    path += ` C ${cpX} ${y0}, ${cpX} ${y1}, ${x1} ${y1}`
  }
  
  return path
}

export function ContributorChart({
  topN = 10,
  bucketSize = 'week',
  height = 500,
  invertedTheme = true,
  onManageUsers,
}: ContributorChartProps) {
  const [stats, setStats] = useState<ContributorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredAuthor, setHoveredAuthor] = useState<string | null>(null)

  // Fetch contributor stats
  useEffect(() => {
    let mounted = true
    
    async function fetchStats() {
      setLoading(true)
      setError(null)
      try {
        const result = await window.electronAPI.getContributorStats(topN, bucketSize)
        if (mounted) {
          setStats(result)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load statistics')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    
    fetchStats()
    return () => { mounted = false }
  }, [topN, bucketSize])

  // Calculate chart dimensions and scaling
  const chartConfig = useMemo(() => {
    if (!stats || stats.contributors.length === 0) {
      return null
    }

    const labelWidth = 140
    const rightPadding = 20
    const topPadding = 30
    const bottomPadding = 50
    const chartWidth = 800
    
    const numContributors = stats.contributors.length
    const rowHeight = (height - topPadding - bottomPadding) / numContributors
    const rowOverlap = rowHeight * 0.4 // Overlap rows for ridgeline effect
    
    // Find max commit count for scaling
    const maxCount = Math.max(
      ...stats.contributors.flatMap(c => c.timeSeries.map(t => t.count))
    )
    
    // Time series length
    const seriesLength = stats.contributors[0]?.timeSeries.length || 0
    const dataWidth = chartWidth - labelWidth - rightPadding
    const xScale = seriesLength > 1 ? dataWidth / (seriesLength - 1) : dataWidth
    const yScale = (rowHeight + rowOverlap) / (maxCount || 1)

    return {
      labelWidth,
      rightPadding,
      topPadding,
      bottomPadding,
      chartWidth,
      rowHeight,
      rowOverlap,
      maxCount,
      seriesLength,
      dataWidth,
      xScale,
      yScale,
    }
  }, [stats, height])

  // Generate time axis labels
  const timeLabels = useMemo(() => {
    if (!stats || !chartConfig) return []
    
    const series = stats.contributors[0]?.timeSeries || []
    if (series.length === 0) return []
    
    // Show ~5-6 labels along the axis
    const step = Math.max(1, Math.floor(series.length / 5))
    const labels: { x: number; label: string }[] = []
    
    for (let i = 0; i < series.length; i += step) {
      const date = new Date(series[i].date)
      const label = date.toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit'
      })
      labels.push({
        x: chartConfig.labelWidth + i * chartConfig.xScale,
        label
      })
    }
    
    return labels
  }, [stats, chartConfig])

  const handleMouseEnter = useCallback((author: string) => {
    setHoveredAuthor(author)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredAuthor(null)
  }, [])

  if (loading) {
    return (
      <div className="contributor-chart-container loading">
        <div className="loading-spinner" />
        <span>Loading contributor statistics...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="contributor-chart-container error">
        <span className="error-message">{error}</span>
      </div>
    )
  }

  if (!stats || !chartConfig || stats.contributors.length === 0) {
    return (
      <div className="contributor-chart-container empty">
        <span>No contributor data available</span>
      </div>
    )
  }

  const { labelWidth, topPadding, bottomPadding, chartWidth, rowHeight, rowOverlap, xScale, yScale } = chartConfig

  return (
    <div className={`contributor-chart-container ${invertedTheme ? 'inverted' : ''}`}>
      <div className="contributor-chart-header">
        <h3>Commit Activity by Contributor</h3>
        <div className="chart-meta">
          <span className="date-range">
            {new Date(stats.startDate).toLocaleDateString()} — {new Date(stats.endDate).toLocaleDateString()}
          </span>
          <span className="bucket-size">{bucketSize}ly</span>
        </div>
      </div>
      
      {/* Manage Users button */}
      {onManageUsers && (
        <button
          className="manage-users-button"
          onClick={onManageUsers}
          title="Manage author identities via .mailmap"
        >
          <span className="manage-users-icon">⚙</span>
          Manage Users
        </button>
      )}
      
      <svg
        className="contributor-chart-svg"
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Gradient for the glow effect */}
          <linearGradient id="ridge-glow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={invertedTheme ? 'var(--text-primary)' : 'var(--accent)'} stopOpacity="0.8" />
            <stop offset="100%" stopColor={invertedTheme ? 'var(--text-primary)' : 'var(--accent)'} stopOpacity="0" />
          </linearGradient>
          
          {/* Clip path for clean edges */}
          <clipPath id="chart-clip">
            <rect x={labelWidth} y={0} width={chartWidth - labelWidth} height={height - bottomPadding} />
          </clipPath>
        </defs>

        {/* Background */}
        <rect
          x="0"
          y="0"
          width={chartWidth}
          height={height}
          fill={invertedTheme ? 'var(--bg-primary)' : 'var(--bg-secondary)'}
        />

        {/* Ridgelines - render back to front for proper overlap */}
        <g clipPath="url(#chart-clip)">
          {[...stats.contributors].reverse().map((contributor, reverseIdx) => {
            const idx = stats.contributors.length - 1 - reverseIdx
            const baseY = topPadding + (idx + 1) * (rowHeight - rowOverlap * 0.5) + rowOverlap
            const data = contributor.timeSeries.map(t => t.count)
            const isHovered = hoveredAuthor === contributor.author
            
            const fillPath = generateRidgePath(data, baseY, xScale, yScale, labelWidth)
            const linePath = generateRidgeLinePath(data, baseY, xScale, yScale, labelWidth)
            
            return (
              <g
                key={contributor.author}
                className={`ridge-group ${isHovered ? 'hovered' : ''}`}
                onMouseEnter={() => handleMouseEnter(contributor.author)}
                onMouseLeave={handleMouseLeave}
              >
                {/* Fill area - solid background to occlude lines behind */}
                <path
                  d={fillPath}
                  fill={invertedTheme ? 'var(--bg-primary)' : 'var(--bg-secondary)'}
                  className="ridge-fill-bg"
                />
                
                {/* Subtle gradient fill */}
                <path
                  d={fillPath}
                  fill="url(#ridge-glow)"
                  opacity={isHovered ? 0.3 : 0.1}
                  className="ridge-fill-glow"
                />
                
                {/* Main line */}
                <path
                  d={linePath}
                  fill="none"
                  stroke={invertedTheme ? 'var(--text-primary)' : 'var(--accent)'}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  opacity={isHovered ? 1 : 0.85}
                  className="ridge-line"
                />
              </g>
            )
          })}
        </g>

        {/* Author labels */}
        <g className="author-labels">
          {stats.contributors.map((contributor, idx) => {
            const baseY = topPadding + (idx + 1) * (rowHeight - rowOverlap * 0.5) + rowOverlap
            const isHovered = hoveredAuthor === contributor.author
            
            return (
              <g
                key={`label-${contributor.author}`}
                onMouseEnter={() => handleMouseEnter(contributor.author)}
                onMouseLeave={handleMouseLeave}
              >
                <text
                  x={labelWidth - 10}
                  y={baseY + 4}
                  textAnchor="end"
                  className={`author-label ${isHovered ? 'hovered' : ''}`}
                  fill="var(--text-primary)"
                  opacity={isHovered ? 1 : 0.7}
                  fontSize="12"
                  fontFamily="var(--font-sans, system-ui)"
                >
                  {contributor.author.length > 15 
                    ? contributor.author.slice(0, 14) + '…' 
                    : contributor.author}
                </text>
                <text
                  x={labelWidth - 10}
                  y={baseY + 18}
                  textAnchor="end"
                  className="commit-count"
                  fill="var(--text-muted)"
                  fontSize="10"
                  fontFamily="var(--font-mono, monospace)"
                >
                  {contributor.totalCommits.toLocaleString()} commits
                </text>
              </g>
            )
          })}
        </g>

        {/* Time axis */}
        <g className="time-axis">
          <line
            x1={labelWidth}
            y1={height - bottomPadding + 10}
            x2={chartWidth - 20}
            y2={height - bottomPadding + 10}
            stroke="var(--border)"
            strokeWidth="1"
          />
          {timeLabels.map((label, i) => (
            <text
              key={i}
              x={label.x}
              y={height - bottomPadding + 28}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="11"
              fontFamily="var(--font-sans, system-ui)"
            >
              {label.label}
            </text>
          ))}
        </g>
      </svg>
      
      {/* Legend / tooltip area */}
      {hoveredAuthor && (
        <div className="chart-tooltip">
          {(() => {
            const contributor = stats.contributors.find(c => c.author === hoveredAuthor)
            if (!contributor) return null
            const maxCommits = Math.max(...contributor.timeSeries.map(t => t.count))
            const avgCommits = contributor.timeSeries.reduce((a, b) => a + b.count, 0) / contributor.timeSeries.length
            return (
              <>
                <strong>{contributor.author}</strong>
                <span>{contributor.totalCommits.toLocaleString()} total commits</span>
                <span>Peak: {maxCommits} / {bucketSize}</span>
                <span>Avg: {avgCommits.toFixed(1)} / {bucketSize}</span>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

