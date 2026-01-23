/**
 * TechTreeChart - StarCraft-inspired tech tree visualization
 *
 * Displays merged branches as an inverted tech tree where master/main is the
 * final destination at the bottom, with merged branches fanning upward.
 * Visual variety driven by commit metadata (size, type, badges).
 */

import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import type { TechTreeData, TechTreeNode, TechTreeSizeTier, TechTreeBranchType } from '../../../types/electron'

export interface TechTreeChartProps {
  limit?: number
  formatRelativeTime: (date: string) => string
  onSelectNode?: (node: TechTreeNode) => void
}

// Color palette by branch type
const BRANCH_COLORS: Record<TechTreeBranchType, string> = {
  feature: 'var(--chart-1)',
  fix: 'var(--chart-4)',
  chore: 'var(--chart-6)',
  refactor: 'var(--chart-7)',
  docs: 'var(--chart-2)',
  test: 'var(--chart-3)',
  release: 'var(--chart-8)',
  unknown: 'var(--text-muted)',
}

// Icons by branch type
const BRANCH_ICONS: Record<TechTreeBranchType, string> = {
  feature: '◆',
  fix: '⚠',
  chore: '⚙',
  refactor: '↻',
  docs: '◈',
  test: '✓',
  release: '★',
  unknown: '○',
}

// Size tier dimensions - increased sizes
const SIZE_CONFIG: Record<TechTreeSizeTier, { width: number; height: number; fontSize: number }> = {
  xs: { width: 140, height: 48, fontSize: 10 },
  sm: { width: 170, height: 65, fontSize: 11 },
  md: { width: 200, height: 82, fontSize: 12 },
  lg: { width: 240, height: 105, fontSize: 13 },
  xl: { width: 280, height: 130, fontSize: 14 },
}

// Badge icons
const BADGE_ICONS: Record<string, { icon: string; title: string }> = {
  massive: { icon: '🔥', title: 'Massive (top 10% by LOC)' },
  destructive: { icon: '💀', title: 'Destructive (top 15% by deletions)' },
  additive: { icon: '✚', title: 'Additive (top 15% by additions)' },
  multiFile: { icon: '📁', title: 'Multi-file (top 20% by files)' },
  surgical: { icon: '⚡', title: 'Surgical (bottom 10% - tiny change)' },
  ancient: { icon: '🕸', title: 'Ancient (oldest 15%)' },
  fresh: { icon: '✨', title: 'Fresh (newest 15%)' },
}

// Connector line thickness by tier - increased
const CONNECTOR_WIDTH: Record<TechTreeSizeTier, number> = {
  xs: 2,
  sm: 3,
  md: 4,
  lg: 5,
  xl: 7,
}

export function TechTreeChart({ limit = 25, formatRelativeTime, onSelectNode }: TechTreeChartProps) {
  const [data, setData] = useState<TechTreeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<TechTreeNode | null>(null)
  
  // Drag state for panning
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 })

  // Fetch tech tree data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.getMergedBranchTree(limit)
      setData(result)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle node click - navigate to detail panel
  const handleNodeClick = useCallback((node: TechTreeNode) => {
    const isSelected = selectedNode?.id === node.id
    setSelectedNode(isSelected ? null : node)
    
    if (!isSelected && onSelectNode) {
      onSelectNode(node)
    }
  }, [selectedNode, onSelectNode])

  // Drag handlers for canvas panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drag if clicking on the background, not a node
    if ((e.target as HTMLElement).closest('.tech-tree-node')) return
    
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    if (containerRef.current) {
      setScrollStart({ 
        x: containerRef.current.scrollLeft, 
        y: containerRef.current.scrollTop 
      })
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    
    containerRef.current.scrollLeft = scrollStart.x - dx
    containerRef.current.scrollTop = scrollStart.y - dy
  }, [isDragging, dragStart, scrollStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Layout calculation - spread items more across the page
  const layout = useMemo(() => {
    if (!data || data.nodes.length === 0) return { nodes: [], width: 0, height: 0 }

    const PADDING = 80
    const ROW_GAP = 100  // Increased from 60
    const NODE_GAP = 60  // Increased from 30
    const MASTER_HEIGHT = 140  // Increased for bigger master node

    // Arrange nodes in rows (sorted by lines added - biggest first)
    const sortedNodes = [...data.nodes].sort((a, b) => 
      (b.stats.linesAdded + b.stats.linesRemoved) - (a.stats.linesAdded + a.stats.linesRemoved)
    )

    const rows: TechTreeNode[][] = []
    let currentRow: TechTreeNode[] = []
    let currentRowWidth = 0
    const maxRowWidth = 1200  // Increased from 900

    for (const node of sortedNodes) {
      const nodeSize = SIZE_CONFIG[node.sizeTier]
      const nodeWidth = nodeSize.width + NODE_GAP

      if (currentRowWidth + nodeWidth > maxRowWidth && currentRow.length > 0) {
        rows.push(currentRow)
        currentRow = [node]
        currentRowWidth = nodeWidth
      } else {
        currentRow.push(node)
        currentRowWidth += nodeWidth
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow)
    }

    // Calculate positions
    const positioned: Array<{ node: TechTreeNode; x: number; y: number }> = []
    let y = PADDING
    let maxWidth = 0

    for (const row of rows) {
      // Calculate row width
      const rowWidth = row.reduce((sum, n) => sum + SIZE_CONFIG[n.sizeTier].width + NODE_GAP, 0) - NODE_GAP
      maxWidth = Math.max(maxWidth, rowWidth)

      // Find max height in row
      const rowHeight = Math.max(...row.map(n => SIZE_CONFIG[n.sizeTier].height))

      // Center nodes in row with more spread
      let x = PADDING + (maxRowWidth - rowWidth) / 2

      for (const node of row) {
        const size = SIZE_CONFIG[node.sizeTier]
        positioned.push({
          node,
          x: x + size.width / 2,
          y: y + rowHeight / 2,
        })
        x += size.width + NODE_GAP
      }

      y += rowHeight + ROW_GAP
    }

    const totalHeight = y + MASTER_HEIGHT + PADDING
    const totalWidth = Math.max(maxWidth + PADDING * 2, 600)

    return {
      nodes: positioned,
      width: totalWidth,
      height: totalHeight,
      masterY: y + MASTER_HEIGHT / 2 - 20,
      masterX: totalWidth / 2,
    }
  }, [data])

  // Calculate totals for master node
  const masterStats = useMemo(() => {
    if (!data) return { totalLoc: 0, contributors: 0, files: 0, merges: 0 }
    
    const authors = new Set<string>()
    let totalLoc = 0
    let totalFiles = 0
    
    for (const node of data.nodes) {
      authors.add(node.author)
      totalLoc += node.stats.linesAdded + node.stats.linesRemoved
      totalFiles += node.stats.filesChanged
    }
    
    return {
      totalLoc,
      contributors: authors.size,
      files: totalFiles,
      merges: data.nodes.length,
    }
  }, [data])

  // Render node content based on size tier
  const renderNodeContent = (node: TechTreeNode) => {
    const color = BRANCH_COLORS[node.branchType]
    const icon = BRANCH_ICONS[node.branchType]

    // Get active badges
    const activeBadges = Object.entries(node.badges)
      .filter(([_, active]) => active)
      .map(([key]) => BADGE_ICONS[key])

    const shortName = node.branchName.length > 25 
      ? node.branchName.slice(0, 22) + '...' 
      : node.branchName

    switch (node.sizeTier) {
      case 'xs':
        return (
          <div className="tech-tree-node-content tech-tree-node-xs">
            <span className="tech-tree-node-icon" style={{ color }}>{icon}</span>
            <span className="tech-tree-node-name">{shortName}</span>
          </div>
        )

      case 'sm':
        return (
          <div className="tech-tree-node-content tech-tree-node-sm">
            <div className="tech-tree-node-header">
              <span className="tech-tree-node-icon" style={{ color }}>{icon}</span>
              <span className="tech-tree-node-name">{shortName}</span>
            </div>
            <div className="tech-tree-node-stats">
              <span className="stat-add">+{node.stats.linesAdded.toLocaleString()}</span>
              <span className="stat-del">-{node.stats.linesRemoved.toLocaleString()}</span>
            </div>
          </div>
        )

      case 'md':
        return (
          <div className="tech-tree-node-content tech-tree-node-md">
            <div className="tech-tree-node-header">
              <span className="tech-tree-node-icon" style={{ color }}>{icon}</span>
              <span className="tech-tree-node-name">{shortName}</span>
            </div>
            <div className="tech-tree-node-stats">
              <span className="stat-add">+{node.stats.linesAdded.toLocaleString()}</span>
              <span className="stat-del">-{node.stats.linesRemoved.toLocaleString()}</span>
              <span className="stat-files">⬡{node.stats.filesChanged}</span>
            </div>
            <div className="tech-tree-node-meta">
              <span className="tech-tree-node-time">◷ {formatRelativeTime(node.mergeDate)}</span>
              <span className="tech-tree-node-author">• {node.author}</span>
            </div>
          </div>
        )

      case 'lg':
        return (
          <div className="tech-tree-node-content tech-tree-node-lg">
            <div className="tech-tree-node-header">
              <span className="tech-tree-node-icon" style={{ color }}>{icon}</span>
              <span className="tech-tree-node-name">{shortName}</span>
              {activeBadges.length > 0 && (
                <span className="tech-tree-badges">
                  {activeBadges.slice(0, 2).map((b, i) => (
                    <span key={i} className="tech-tree-badge" title={b.title}>{b.icon}</span>
                  ))}
                </span>
              )}
            </div>
            <div className="tech-tree-node-divider" style={{ background: color }} />
            <div className="tech-tree-node-stats">
              <span className="stat-add">+{node.stats.linesAdded.toLocaleString()}</span>
              <span className="stat-del">-{node.stats.linesRemoved.toLocaleString()}</span>
              <span className="stat-files">⬡ {node.stats.filesChanged} files</span>
            </div>
            <div className="tech-tree-node-meta">
              <span className="tech-tree-node-time">◷ {formatRelativeTime(node.mergeDate)}</span>
              <span className="tech-tree-node-author">• @{node.author}</span>
            </div>
          </div>
        )

      case 'xl':
        return (
          <div className="tech-tree-node-content tech-tree-node-xl">
            <div className="tech-tree-node-header">
              <span className="tech-tree-node-icon" style={{ color }}>{icon}</span>
              <span className="tech-tree-node-name">{shortName}</span>
              {activeBadges.length > 0 && (
                <span className="tech-tree-badges">
                  {activeBadges.map((b, i) => (
                    <span key={i} className="tech-tree-badge" title={b.title}>{b.icon}</span>
                  ))}
                </span>
              )}
            </div>
            <div className="tech-tree-node-divider tech-tree-node-divider-double" style={{ background: color }} />
            <div className="tech-tree-node-stats">
              <span className="stat-add">+{node.stats.linesAdded.toLocaleString()}</span>
              <span className="stat-del">-{node.stats.linesRemoved.toLocaleString()}</span>
              <span className="stat-files">⬡ {node.stats.filesChanged} files</span>
            </div>
            <div className="tech-tree-node-progress">
              {renderProgressBar(node.stats.linesAdded, node.stats.linesRemoved)}
            </div>
            <div className="tech-tree-node-meta">
              <span className="tech-tree-node-time">◷ {formatRelativeTime(node.mergeDate)}</span>
              <span className="tech-tree-node-author">• @{node.author}</span>
            </div>
            {node.prNumber && (
              <div className="tech-tree-node-pr">PR #{node.prNumber}</div>
            )}
          </div>
        )
    }
  }

  // Progress bar showing add/remove ratio
  const renderProgressBar = (added: number, removed: number) => {
    const total = added + removed
    if (total === 0) return null
    const addPercent = (added / total) * 100
    return (
      <div className="tech-tree-progress-bar">
        <div className="tech-tree-progress-add" style={{ width: `${addPercent}%` }} />
        <span className="tech-tree-progress-label">{Math.round(addPercent)}% additions</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="tech-tree-loading">
        <div className="tech-tree-loading-spinner" />
        <span>Analyzing merge history...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tech-tree-error">
        <span className="tech-tree-error-icon">⚠</span>
        <span>{error}</span>
        <button onClick={fetchData} className="tech-tree-retry">Retry</button>
      </div>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="tech-tree-empty">
        <span className="tech-tree-empty-icon">◇</span>
        <span>No merge commits found</span>
        <p className="tech-tree-empty-hint">
          Merge branches to {data?.masterBranch || 'main'} to see the tech tree
        </p>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className={`tech-tree-container ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Scanline overlay for CRT effect */}
      <div className="tech-tree-scanlines" />
      
      {/* Grid background */}
      <div className="tech-tree-grid" />
      
      {/* Draggable canvas content */}
      <div className="tech-tree-canvas" style={{ width: layout.width, height: layout.height }}>
        <svg
          className="tech-tree-svg"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          {/* Glow filter definitions */}
          <defs>
            <filter id="glow-xs" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-sm" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-md" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-lg" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-xl" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-master" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Connector lines from nodes to master */}
          {layout.nodes.map(({ node, x, y }) => {
            const color = BRANCH_COLORS[node.branchType]
            const strokeWidth = CONNECTOR_WIDTH[node.sizeTier]
            const isDashed = node.sizeTier === 'xs'
            
            return (
              <g key={`connector-${node.id}`}>
                {/* Glow line */}
                <path
                  d={`M ${x} ${y + SIZE_CONFIG[node.sizeTier].height / 2} 
                      Q ${x} ${(y + SIZE_CONFIG[node.sizeTier].height / 2 + layout.masterY!) / 2},
                        ${layout.masterX} ${layout.masterY}`}
                  stroke={color}
                  strokeWidth={strokeWidth + 6}
                  fill="none"
                  opacity={0.15}
                  filter={`url(#glow-${node.sizeTier})`}
                />
                {/* Main line */}
                <path
                  d={`M ${x} ${y + SIZE_CONFIG[node.sizeTier].height / 2} 
                      Q ${x} ${(y + SIZE_CONFIG[node.sizeTier].height / 2 + layout.masterY!) / 2},
                        ${layout.masterX} ${layout.masterY}`}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  opacity={0.85}
                  strokeDasharray={isDashed ? '6,6' : undefined}
                  className={node.sizeTier === 'xl' ? 'tech-tree-connector-pulse' : ''}
                />
              </g>
            )
          })}

          {/* Master node - rounded rectangle */}
          <g transform={`translate(${layout.masterX}, ${layout.masterY})`}>
            <rect
              x={-120}
              y={-50}
              width={240}
              height={100}
              rx={16}
              ry={16}
              fill="var(--bg-secondary)"
              stroke="var(--accent)"
              strokeWidth={4}
              filter="url(#glow-master)"
              className="tech-tree-master-node"
            />
          </g>
        </svg>

        {/* Node overlays (HTML for better text rendering) */}
        <div className="tech-tree-nodes">
          {layout.nodes.map(({ node, x, y }) => {
            const size = SIZE_CONFIG[node.sizeTier]
            const color = BRANCH_COLORS[node.branchType]
            const isSelected = selectedNode?.id === node.id

            return (
              <div
                key={node.id}
                className={`tech-tree-node tech-tree-node-tier-${node.sizeTier} ${isSelected ? 'selected' : ''}`}
                style={{
                  left: x - size.width / 2,
                  top: y - size.height / 2,
                  width: size.width,
                  height: size.height,
                  fontSize: size.fontSize,
                  '--node-color': color,
                } as React.CSSProperties}
                onClick={() => handleNodeClick(node)}
              >
                {renderNodeContent(node)}
              </div>
            )
          })}
          
          {/* Master node content (HTML overlay) */}
          <div 
            className="tech-tree-master-content"
            style={{
              left: layout.masterX! - 120,
              top: layout.masterY! - 50,
              width: 240,
              height: 100,
            }}
          >
            <div className="tech-tree-master-header">
              <span className="tech-tree-master-icon">★</span>
              <span className="tech-tree-master-name">{data.masterBranch}</span>
            </div>
            <div className="tech-tree-master-stats">
              <div className="tech-tree-master-stat">
                <span className="tech-tree-master-stat-value">{masterStats.totalLoc.toLocaleString()}</span>
                <span className="tech-tree-master-stat-label">lines</span>
              </div>
              <div className="tech-tree-master-stat">
                <span className="tech-tree-master-stat-value">{masterStats.contributors}</span>
                <span className="tech-tree-master-stat-label">authors</span>
              </div>
              <div className="tech-tree-master-stat">
                <span className="tech-tree-master-stat-value">{masterStats.files}</span>
                <span className="tech-tree-master-stat-label">files</span>
              </div>
              <div className="tech-tree-master-stat">
                <span className="tech-tree-master-stat-value">{masterStats.merges}</span>
                <span className="tech-tree-master-stat-label">merges</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="tech-tree-legend">
        <div className="tech-tree-legend-title">Branch Types</div>
        <div className="tech-tree-legend-items">
          {Object.entries(BRANCH_COLORS).map(([type, color]) => (
            <div key={type} className="tech-tree-legend-item">
              <span className="tech-tree-legend-icon" style={{ color }}>
                {BRANCH_ICONS[type as TechTreeBranchType]}
              </span>
              <span className="tech-tree-legend-label">{type}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Drag hint */}
      <div className="tech-tree-drag-hint">
        Drag to pan
      </div>
    </div>
  )
}
