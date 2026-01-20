/**
 * ERD Canvas Panel
 *
 * Visualizes Entity Relationship Diagrams with multiple renderer options:
 * - Canvas (tldraw): Freeform infinite canvas
 * - Graph (React Flow): Structured node graph
 * - JSON: Raw data inspector
 *
 * Supports Laravel and Rails schema parsing.
 */

import { useCallback, useEffect, useState, useRef } from 'react'
import { TldrawRenderer, ReactFlowRenderer, JsonRenderer } from './renderers'
import { filterSchemaByRelationshipCount } from './layout/erd-layout'
import type { ERDSchema, ERDFramework } from '@/lib/services/erd/erd-types'

const INITIAL_RELATIONSHIP_FILTER_MIN = 3

// Renderer types
type RendererType = 'tldraw' | 'reactflow' | 'json'

interface RendererOption {
  id: RendererType
  label: string
  icon: string
  title: string
}

const RENDERER_OPTIONS: RendererOption[] = [
  { id: 'tldraw', label: 'Canvas', icon: '◫', title: 'Infinite canvas (tldraw)' },
  { id: 'reactflow', label: 'Graph', icon: '◉', title: 'Node graph (React Flow)' },
  { id: 'json', label: 'JSON', icon: '{ }', title: 'Raw data inspector' },
]

interface ERDCanvasPanelProps {
  repoPath: string | null
}

type LoadingState = 'idle' | 'loading' | 'success' | 'error' | 'no-schema'

export function ERDCanvasPanel({ repoPath }: ERDCanvasPanelProps) {
  const initialFilterApplied = useRef(false)
  const loadVersionRef = useRef(0) // Track load version to prevent stale updates
  const [schema, setSchema] = useState<ERDSchema | null>(null)
  const [framework, setFramework] = useState<ERDFramework | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [renderer, setRenderer] = useState<RendererType>('tldraw')

  // Reset initial filter when repo changes
  useEffect(() => {
    initialFilterApplied.current = false
  }, [repoPath])

  // Load ERD schema when repo path changes
  const loadSchema = useCallback(async () => {
    if (!repoPath) {
      setLoadingState('idle')
      setSchema(null)
      return
    }

    // Increment version to invalidate any in-flight requests
    const currentVersion = ++loadVersionRef.current

    setLoadingState('loading')
    setErrorMessage(null)

    try {
      // Detect framework first
      const frameworkResult = await window.electronAPI.detectERDFramework(repoPath)
      
      // Check if this request is still current (user may have switched repos)
      if (loadVersionRef.current !== currentVersion) return
      
      if (frameworkResult.success && frameworkResult.data) {
        setFramework(frameworkResult.data as ERDFramework)
      }

      // Parse schema
      const result = await window.electronAPI.getERDSchema(repoPath)

      // Check again after async operation
      if (loadVersionRef.current !== currentVersion) return

      if (result.success && result.data) {
        const parsedSchema = result.data as ERDSchema
        let schemaToRender = parsedSchema

        if (!initialFilterApplied.current) {
          const filteredSchema = filterSchemaByRelationshipCount(parsedSchema, INITIAL_RELATIONSHIP_FILTER_MIN)
          if (filteredSchema.entities.length > 0) {
            schemaToRender = filteredSchema
          }
          initialFilterApplied.current = true
        }

        if (schemaToRender.entities.length === 0) {
          setLoadingState('no-schema')
          setSchema(null)
        } else {
          setSchema(schemaToRender)
          setLoadingState('success')
        }
      } else {
        setErrorMessage(result.message || 'Failed to parse schema')
        setLoadingState('error')
      }
    } catch (err) {
      // Only update error state if this request is still current
      if (loadVersionRef.current !== currentVersion) return
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      setLoadingState('error')
    }
  }, [repoPath])

  // Load schema on mount and when repo changes
  useEffect(() => {
    loadSchema()
  }, [loadSchema])

  // Refresh handler
  const handleRefresh = useCallback(() => {
    // Reset filter flag so the improved filter runs again
    initialFilterApplied.current = false
    loadSchema()
  }, [loadSchema])

  // Framework badge
  const frameworkBadge = framework && framework !== 'generic' && (
    <span className={`erd-framework-badge erd-framework-${framework}`}>
      {framework === 'laravel' ? '🐘 Laravel' : '💎 Rails'}
    </span>
  )

  // Render the selected renderer
  const renderContent = () => {
    switch (renderer) {
      case 'tldraw':
        return <TldrawRenderer schema={schema} />
      case 'reactflow':
        return <ReactFlowRenderer schema={schema} />
      case 'json':
        return <JsonRenderer schema={schema} />
      default:
        return <TldrawRenderer schema={schema} />
    }
  }

  // Render loading/error states
  if (loadingState === 'idle' || !repoPath) {
    return (
      <div className="erd-canvas-container erd-empty-state">
        <div className="erd-empty-content">
          <span className="erd-empty-icon">📊</span>
          <p>Select a repository to visualize its ERD</p>
        </div>
      </div>
    )
  }

  if (loadingState === 'loading') {
    return (
      <div className="erd-canvas-container erd-loading-state">
        <div className="erd-loading-content">
          <span className="erd-loading-spinner" />
          <p>Parsing database schema...</p>
        </div>
      </div>
    )
  }

  if (loadingState === 'error') {
    return (
      <div className="erd-canvas-container erd-error-state">
        <div className="erd-error-content">
          <span className="erd-error-icon">⚠️</span>
          <p>Failed to parse schema</p>
          <p className="erd-error-message">{errorMessage}</p>
          <button className="erd-retry-button" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (loadingState === 'no-schema') {
    return (
      <div className="erd-canvas-container erd-empty-state">
        <div className="erd-empty-content">
          <span className="erd-empty-icon">🔍</span>
          <p>No database schema found</p>
          <p className="erd-empty-hint">Supports Laravel migrations, Rails schema.rb, and Mermaid ERD files</p>
          <button className="erd-retry-button" onClick={handleRefresh}>
            Scan Again
          </button>
        </div>
      </div>
    )
  }

  // Success state - render selected visualization
  return (
    <div className="erd-canvas-container">
      <div className="erd-canvas-header">
        <div className="erd-canvas-title">
          {frameworkBadge}
          <span className="erd-entity-count">
            {schema?.entities.length || 0} tables, {schema?.relationships.length || 0} relationships
          </span>
        </div>
        <div className="erd-canvas-actions">
          {/* Renderer toggle */}
          <div className="erd-renderer-toggle">
            {RENDERER_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`erd-renderer-btn ${renderer === option.id ? 'active' : ''}`}
                onClick={() => setRenderer(option.id)}
                title={option.title}
              >
                <span className="erd-renderer-icon">{option.icon}</span>
                <span className="erd-renderer-label">{option.label}</span>
              </button>
            ))}
          </div>
          {/* Refresh button */}
          <button className="erd-action-button" onClick={handleRefresh} title="Refresh schema">
            ↻
          </button>
        </div>
      </div>
      <div className="erd-canvas-wrapper">{renderContent()}</div>
    </div>
  )
}

export default ERDCanvasPanel
