/**
 * FileGraph - Treemap visualization of repository code by line count
 *
 * Displays files as nested rectangles sized by line count, colored by language.
 * Supports drill-down navigation into folders with breadcrumb path.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { FileGraphData, FileNode } from '../../../types/electron'

export interface FileGraphProps {
  data: FileGraphData | null
  loading?: boolean
}

// Language colors
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  CSS: '#563D7C',
  SCSS: '#CC6699',
  HTML: '#E34C26',
  JSON: '#F5D800',
  Markdown: '#083FA1',
  Python: '#3776AB',
  Go: '#00ADD8',
  Rust: '#DEA584',
  Java: '#B07219',
  Ruby: '#CC342D',
  PHP: '#4F5D95',
  C: '#555555',
  'C++': '#F34B7D',
  'C#': '#178600',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Shell: '#89E051',
  YAML: '#CB171E',
  TOML: '#9C4221',
  XML: '#0060AC',
  SQL: '#E38C00',
  GraphQL: '#E535AB',
  Vue: '#41B883',
  Svelte: '#FF3E00',
  Other: '#6B7280',
}

interface TreemapRect {
  node: FileNode
  x: number
  y: number
  width: number
  height: number
}

/** Squarified treemap layout */
function squarify(
  nodes: FileNode[],
  x: number,
  y: number,
  width: number,
  height: number,
  totalValue: number
): TreemapRect[] {
  if (nodes.length === 0 || totalValue === 0) return []

  const rects: TreemapRect[] = []
  const sorted = [...nodes].sort((a, b) => b.lines - a.lines)

  let currentX = x
  let currentY = y
  let remainingWidth = width
  let remainingHeight = height
  let remainingValue = totalValue

  let row: FileNode[] = []
  let rowValue = 0

  function aspectRatio(areas: number[], length: number): number {
    if (areas.length === 0 || length === 0) return Infinity
    const sum = areas.reduce((a, b) => a + b, 0)
    const min = Math.min(...areas)
    const max = Math.max(...areas)
    const s2 = sum * sum
    const l2 = length * length
    return Math.max((l2 * max) / s2, s2 / (l2 * min))
  }

  function layoutRow(row: FileNode[], rowValue: number, isHorizontal: boolean) {
    if (row.length === 0) return
    const rowLength = isHorizontal
      ? (rowValue / remainingValue) * remainingHeight
      : (rowValue / remainingValue) * remainingWidth
    let offset = 0
    for (const node of row) {
      const nodeRatio = node.lines / rowValue
      const nodeLength = isHorizontal ? nodeRatio * remainingWidth : nodeRatio * remainingHeight
      rects.push({
        node,
        x: isHorizontal ? currentX + offset : currentX,
        y: isHorizontal ? currentY : currentY + offset,
        width: isHorizontal ? nodeLength : rowLength,
        height: isHorizontal ? rowLength : nodeLength,
      })
      offset += nodeLength
    }
    if (isHorizontal) {
      currentY += rowLength
      remainingHeight -= rowLength
    } else {
      currentX += rowLength
      remainingWidth -= rowLength
    }
    remainingValue -= rowValue
  }

  for (const node of sorted) {
    const isHorizontal = remainingWidth >= remainingHeight
    const length = isHorizontal ? remainingWidth : remainingHeight
    const rowAreas = row.map((n) => (n.lines / remainingValue) * length * (isHorizontal ? remainingHeight : remainingWidth))
    const newAreas = [...rowAreas, (node.lines / remainingValue) * length * (isHorizontal ? remainingHeight : remainingWidth)]
    const currentAspect = aspectRatio(rowAreas, length)
    const newAspect = aspectRatio(newAreas, length)

    if (row.length === 0 || newAspect <= currentAspect) {
      row.push(node)
      rowValue += node.lines
    } else {
      layoutRow(row, rowValue, isHorizontal)
      row = [node]
      rowValue = node.lines
    }
  }

  if (row.length > 0) {
    layoutRow(row, rowValue, remainingWidth >= remainingHeight)
  }

  return rects
}

function formatLines(lines: number): string {
  if (lines >= 1000000) return `${(lines / 1000000).toFixed(1)}M`
  if (lines >= 1000) return `${(lines / 1000).toFixed(1)}K`
  return lines.toString()
}

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}

function truncateLabel(label: string, width: number): string {
  const maxChars = Math.floor(width / 7)
  if (label.length <= maxChars) return label
  if (maxChars <= 3) return ''
  return label.slice(0, maxChars - 2) + '…'
}

export function FileGraph({ data, loading }: FileGraphProps) {
  const [currentPath, setCurrentPath] = useState<string[]>([])
  const [hoveredNode, setHoveredNode] = useState<FileNode | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // Reset path when data changes (new repo)
  useEffect(() => {
    setCurrentPath([])
  }, [data])

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Get current node based on path
  const currentNode = useMemo(() => {
    if (!data) return null
    let node = data.root
    for (const segment of currentPath) {
      const child = node.children?.find((c) => c.name === segment)
      if (!child) return node
      node = child
    }
    return node
  }, [data, currentPath])

  // Calculate treemap layout
  const treemapRects = useMemo(() => {
    if (!currentNode?.children) return []
    const padding = 2
    return squarify(
      currentNode.children,
      padding,
      padding,
      dimensions.width - padding * 2,
      dimensions.height - padding * 2,
      currentNode.lines
    )
  }, [currentNode, dimensions])

  const handleClick = useCallback((node: FileNode) => {
    if (node.isDirectory && node.children?.length) {
      setCurrentPath((prev) => [...prev, node.name])
    }
  }, [])

  const navigateTo = useCallback((index: number) => {
    setCurrentPath((prev) => prev.slice(0, index))
  }, [])

  const getNodeColor = useCallback((node: FileNode): string => {
    if (node.isDirectory) return 'var(--bg-tertiary)'
    return LANGUAGE_COLORS[node.language || 'Other'] || LANGUAGE_COLORS.Other
  }, [])

  if (loading) {
    return (
      <div className="file-graph-loading">
        <div className="file-graph-spinner" />
        <span>Scanning repository...</span>
      </div>
    )
  }

  if (!data || !currentNode) {
    return (
      <div className="file-graph-empty">
        <span>No files found</span>
      </div>
    )
  }

  return (
    <div className="file-graph" onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}>
      {/* Breadcrumb */}
      <div className="file-graph-breadcrumb">
        <button className={`breadcrumb-item ${currentPath.length === 0 ? 'current' : ''}`} onClick={() => navigateTo(0)}>
          {data.root.name || 'root'}
        </button>
        {currentPath.map((segment, index) => (
          <span key={index}>
            <span className="breadcrumb-separator">/</span>
            <button
              className={`breadcrumb-item ${index === currentPath.length - 1 ? 'current' : ''}`}
              onClick={() => navigateTo(index + 1)}
            >
              {segment}
            </button>
          </span>
        ))}
        <span className="breadcrumb-lines">{formatLines(currentNode.lines)} lines</span>
      </div>

      {/* Treemap */}
      <div className="file-graph-container" ref={containerRef}>
        <svg width={dimensions.width} height={dimensions.height} className="file-graph-svg">
          {treemapRects.map((rect, index) => {
            const isHovered = hoveredNode === rect.node
            const minDim = Math.min(rect.width, rect.height)
            const showLabel = minDim > 30
            return (
              <g
                key={rect.node.path || index}
                className={`file-graph-node ${rect.node.isDirectory ? 'directory' : 'file'} ${isHovered ? 'hovered' : ''}`}
                onClick={() => handleClick(rect.node)}
                onMouseEnter={() => setHoveredNode(rect.node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={Math.max(0, rect.width - 1)}
                  height={Math.max(0, rect.height - 1)}
                  fill={getNodeColor(rect.node)}
                  stroke={isHovered ? 'var(--text-primary)' : 'var(--border-primary)'}
                  strokeWidth={isHovered ? 2 : 0.5}
                  rx={2}
                />
                {showLabel && (
                  <text
                    x={rect.x + rect.width / 2}
                    y={rect.y + rect.height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="file-graph-label"
                    style={{
                      fontSize: Math.min(12, minDim / 4),
                      fill: rect.node.isDirectory ? 'var(--text-primary)' : getContrastColor(getNodeColor(rect.node)),
                    }}
                  >
                    {truncateLabel(rect.node.name, rect.width)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="file-graph-legend">
        {data.languages.slice(0, 8).map((lang) => (
          <div key={lang.language} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: lang.color }} />
            <span className="legend-label">{lang.language}</span>
            <span className="legend-count">{formatLines(lang.lines)}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredNode && (
        <div className="file-graph-tooltip" style={{ left: mousePos.x + 12, top: mousePos.y + 12 }}>
          <div className="tooltip-name">{hoveredNode.name}</div>
          <div className="tooltip-path">{hoveredNode.path}</div>
          <div className="tooltip-stats">
            <span>{formatLines(hoveredNode.lines)} lines</span>
            {hoveredNode.language && <span className="tooltip-lang">{hoveredNode.language}</span>}
            {hoveredNode.isDirectory && hoveredNode.children && <span>{hoveredNode.children.length} items</span>}
          </div>
        </div>
      )}
    </div>
  )
}
