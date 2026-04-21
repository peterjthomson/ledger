/**
 * Code Graph Panel
 *
 * Visualizes code dependencies with renderer options:
 * - Force (D3): Force-directed network with organic clustering
 * - JSON: Raw data inspector
 *
 * Supports TypeScript, PHP, and Ruby codebases via AST parsing.
 */

import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { D3ForceRenderer } from './renderers/D3ForceRenderer'
import { JsonRenderer } from './renderers/JsonRenderer'
import type { CodeGraphSchema, CodeGraphLanguage, CodeNode } from '@/app/types/electron'

// Renderer types
type RendererType = 'd3force' | 'json'

interface RendererOption {
  id: RendererType
  label: string
  icon: string
  title: string
}

const RENDERER_OPTIONS: RendererOption[] = [
  { id: 'd3force', label: 'Force', icon: '◎', title: 'Force-directed network (D3)' },
  { id: 'json', label: 'JSON', icon: '{ }', title: 'Raw data inspector' },
]

interface CodeGraphPanelProps {
  repoPath: string | null
}

type LoadingState = 'idle' | 'loading' | 'success' | 'error' | 'no-graph'

const DEFAULT_NODE_LIMIT = 5 // Start minimal, user reveals more

export function CodeGraphPanel({ repoPath }: CodeGraphPanelProps) {
  const loadVersionRef = useRef(0)
  const [schema, setSchema] = useState<CodeGraphSchema | null>(null)
  const [language, setLanguage] = useState<CodeGraphLanguage | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [renderer, setRenderer] = useState<RendererType>('d3force')
  const [showDiff, setShowDiff] = useState(false)
  const [diffStatus, setDiffStatus] = useState<Record<string, 'added' | 'modified' | 'deleted'> | null>(null)
  const [nodeLimit, setNodeLimit] = useState<number>(DEFAULT_NODE_LIMIT)

  // Load code graph when repo path changes
  const loadGraph = useCallback(async () => {
    if (!repoPath) {
      setLoadingState('idle')
      setSchema(null)
      return
    }

    const currentVersion = ++loadVersionRef.current

    setLoadingState('loading')
    setErrorMessage(null)

    try {
      // Detect language first
      const languageResult = await window.electronAPI.detectCodeGraphLanguage(repoPath)

      if (loadVersionRef.current !== currentVersion) return

      if (languageResult.success && languageResult.data) {
        setLanguage(languageResult.data as CodeGraphLanguage)
      }

      // Parse code graph
      const result = await window.electronAPI.getCodeGraphSchema(repoPath, {
        includeTests: false,
        includeNodeModules: false,
      })

      if (loadVersionRef.current !== currentVersion) return

      if (result.success && result.data) {
        const parsedSchema = result.data as CodeGraphSchema

        if (parsedSchema.nodes.length === 0) {
          setLoadingState('no-graph')
          setSchema(null)
        } else {
          setSchema(parsedSchema)
          setLoadingState('success')
        }
      } else {
        setErrorMessage(result.message || 'Failed to parse code graph')
        setLoadingState('error')
      }
    } catch (err) {
      if (loadVersionRef.current !== currentVersion) return
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      setLoadingState('error')
    }
  }, [repoPath])

  // Load on mount and when repo changes
  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  // Load diff status when toggle is enabled
  const loadDiffStatus = useCallback(async () => {
    if (!repoPath) return
    try {
      const result = await window.electronAPI.getCodeGraphDiffStatus(repoPath)
      if (result.success && result.data) {
        setDiffStatus(result.data)
      }
    } catch (_err) {
      // Silently fail - diff overlay is optional
    }
  }, [repoPath])

  // Refresh handler
  const handleRefresh = useCallback(() => {
    loadGraph()
    if (showDiff) {
      loadDiffStatus()
    }
  }, [loadGraph, showDiff, loadDiffStatus])

  // Fetch diff status when showDiff changes
  useEffect(() => {
    if (showDiff && repoPath) {
      loadDiffStatus()
    } else {
      setDiffStatus(null)
    }
  }, [showDiff, repoPath, loadDiffStatus])

  // Merge diff status into schema nodes
  const schemaWithDiff = useMemo((): CodeGraphSchema | null => {
    if (!schema) return null
    if (!showDiff || !diffStatus) return schema

    const nodesWithDiff: CodeNode[] = schema.nodes.map((node) => {
      // Check if the node's file has changes
      const status = diffStatus[node.filePath]
      if (status) {
        return { ...node, changeStatus: status }
      }
      return node
    })

    return { ...schema, nodes: nodesWithDiff }
  }, [schema, showDiff, diffStatus])

  // Calculate connection counts and filter to top N nodes
  const filteredSchema = useMemo((): CodeGraphSchema | null => {
    if (!schemaWithDiff) return null

    // Count connections for each node
    const connectionCounts = new Map<string, number>()
    schemaWithDiff.nodes.forEach((node) => connectionCounts.set(node.id, 0))

    schemaWithDiff.edges.forEach((edge) => {
      connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1)
      connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1)
    })

    // Sort nodes by connection count (descending) and take top N
    const sortedNodes = [...schemaWithDiff.nodes].sort((a, b) => {
      const countA = connectionCounts.get(a.id) || 0
      const countB = connectionCounts.get(b.id) || 0
      return countB - countA
    })

    const topNodes = sortedNodes.slice(0, nodeLimit)
    const topNodeIds = new Set(topNodes.map((n) => n.id))

    // Filter edges to only include those between visible nodes
    const filteredEdges = schemaWithDiff.edges.filter(
      (edge) => topNodeIds.has(edge.source) && topNodeIds.has(edge.target)
    )

    return {
      ...schemaWithDiff,
      nodes: topNodes,
      edges: filteredEdges,
    }
  }, [schemaWithDiff, nodeLimit])

  // Max nodes for slider (total nodes in schema)
  const totalNodes = schema?.nodes.length || 0

  // Language badge
  const languageBadge = language && (
    <span className={`codegraph-language-badge codegraph-language-${language}`}>
      {language === 'typescript'
        ? '🔷 TypeScript'
        : language === 'javascript'
          ? '🟨 JavaScript'
          : language === 'php'
            ? '🐘 PHP'
            : language === 'ruby'
              ? '💎 Ruby'
              : language}
    </span>
  )

  // Render the selected renderer
  const renderContent = () => {
    switch (renderer) {
      case 'd3force':
        return <D3ForceRenderer schema={filteredSchema} totalNodes={totalNodes} />
      case 'json':
        return <JsonRenderer schema={filteredSchema} />
      default:
        return <D3ForceRenderer schema={filteredSchema} totalNodes={totalNodes} />
    }
  }

  // Render loading/error states
  if (loadingState === 'idle' || !repoPath) {
    return (
      <div className="codegraph-container codegraph-empty-state">
        <div className="codegraph-empty-content">
          <span className="codegraph-empty-icon">🔗</span>
          <p>Select a repository to visualize its code graph</p>
        </div>
      </div>
    )
  }

  if (loadingState === 'loading') {
    return (
      <div className="codegraph-container codegraph-loading-state">
        <div className="codegraph-loading-content">
          <span className="codegraph-loading-spinner" />
          <p>Parsing code dependencies...</p>
          <p className="codegraph-loading-hint">This may take a moment for large codebases</p>
        </div>
      </div>
    )
  }

  if (loadingState === 'error') {
    return (
      <div className="codegraph-container codegraph-error-state">
        <div className="codegraph-error-content">
          <span className="codegraph-error-icon">⚠️</span>
          <p>Failed to parse code graph</p>
          <p className="codegraph-error-message">{errorMessage}</p>
          <button className="codegraph-retry-button" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (loadingState === 'no-graph') {
    return (
      <div className="codegraph-container codegraph-empty-state">
        <div className="codegraph-empty-content">
          <span className="codegraph-empty-icon">🔍</span>
          <p>No code dependencies found</p>
          <p className="codegraph-empty-hint">
            Supports TypeScript, JavaScript, PHP, and Ruby projects
          </p>
          <button className="codegraph-retry-button" onClick={handleRefresh}>
            Scan Again
          </button>
        </div>
      </div>
    )
  }

  // Success state
  return (
    <div className="codegraph-container">
      <div className="codegraph-header">
        <div className="codegraph-title">
          {languageBadge}
          <span className="codegraph-stats">
            {filteredSchema?.nodes.length || 0} nodes, {filteredSchema?.edges.length || 0} edges
          </span>
        </div>
        <div className="codegraph-actions">
          {/* Node limit slider */}
          {totalNodes > 0 && (
            <div className="codegraph-slider-group" title="Show top N nodes by connection count">
              <label className="codegraph-slider-label">
                Top {nodeLimit} of {totalNodes}
              </label>
              <input
                type="range"
                className="codegraph-slider"
                min={5}
                max={Math.max(totalNodes, 5)}
                value={Math.min(nodeLimit, totalNodes)}
                onChange={(e) => setNodeLimit(parseInt(e.target.value, 10))}
              />
            </div>
          )}
          {/* Uncommitted diff toggle */}
          <label className="codegraph-toggle" title="Show uncommitted changes">
            <input
              type="checkbox"
              checked={showDiff}
              onChange={(e) => setShowDiff(e.target.checked)}
            />
            <span>Diff</span>
          </label>
          {/* Renderer toggle */}
          <div className="codegraph-renderer-toggle">
            {RENDERER_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`codegraph-renderer-btn ${renderer === option.id ? 'active' : ''}`}
                onClick={() => setRenderer(option.id)}
                title={option.title}
              >
                <span className="codegraph-renderer-icon">{option.icon}</span>
                <span className="codegraph-renderer-label">{option.label}</span>
              </button>
            ))}
          </div>
          {/* Refresh button */}
          <button className="codegraph-action-button" onClick={handleRefresh} title="Refresh graph">
            ↻
          </button>
        </div>
      </div>
      <div className="codegraph-wrapper">{renderContent()}</div>
    </div>
  )
}

export default CodeGraphPanel
