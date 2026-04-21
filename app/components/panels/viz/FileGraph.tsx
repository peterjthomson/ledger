/**
 * FileGraph - Treemap visualization of repository code by line count
 *
 * Displays files as nested rectangles sized by line count, colored by language.
 * Supports drill-down navigation into folders with breadcrumb path.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { FileGraphData, FileNode } from '../../../types/electron'
import { squarify } from './file-graph/layout/treemap-layout'

export interface FileGraphProps {
  data: FileGraphData | null
  loading?: boolean
}

const DEFAULT_LANGUAGE_COLOR = 'var(--chart-1)'
const FALLBACK_LANGUAGE_COLOR = 'var(--chart-8)'

function formatLines(lines: number): string {
  if (lines >= 1000000) return `${(lines / 1000000).toFixed(1)}M`
  if (lines >= 1000) return `${(lines / 1000).toFixed(1)}K`
  return lines.toString()
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

  const languageColorMap = useMemo(() => {
    const map = new Map<string, string>()
    if (!data) return map
    for (const language of data.languages) {
      map.set(language.language, language.color || DEFAULT_LANGUAGE_COLOR)
    }
    if (!map.has('Other')) {
      map.set('Other', FALLBACK_LANGUAGE_COLOR)
    }
    return map
  }, [data])

  const legendLanguages = useMemo(() => {
    if (!data) return []
    return data.languages.slice(0, 8).map((lang) => ({
      ...lang,
      color: languageColorMap.get(lang.language) || lang.color || DEFAULT_LANGUAGE_COLOR,
    }))
  }, [data, languageColorMap])

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
    if (node.isDirectory) return 'var(--bg-hover)'
    const language = node.language || 'Other'
    return languageColorMap.get(language) || DEFAULT_LANGUAGE_COLOR
  }, [languageColorMap])

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
        {legendLanguages.map((lang) => (
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
