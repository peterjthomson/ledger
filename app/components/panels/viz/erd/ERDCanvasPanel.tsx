/**
 * ERD Canvas Panel
 *
 * Visualizes Entity Relationship Diagrams on an infinite canvas using tldraw.
 * Supports Laravel and Rails schema parsing.
 */

import { useCallback, useEffect, useState, useRef } from 'react'
import { Tldraw, Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { EntityShapeUtil } from './EntityShapeUtil'
import { renderERDSchema, clearERDShapes, filterSchemaByRelationshipCount } from './erdUtils'
import type { ERDSchema, ERDFramework } from '@/lib/services/erd/erd-types'

// Custom shape utilities
const customShapeUtils = [EntityShapeUtil]
const INITIAL_RELATIONSHIP_FILTER_MIN = 3

interface ERDCanvasPanelProps {
  repoPath: string | null
}

type LoadingState = 'idle' | 'loading' | 'success' | 'error' | 'no-schema'

export function ERDCanvasPanel({ repoPath }: ERDCanvasPanelProps) {
  const editorRef = useRef<Editor | null>(null)
  const initialFilterApplied = useRef(false)
  const [schema, setSchema] = useState<ERDSchema | null>(null)
  const [framework, setFramework] = useState<ERDFramework | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isEditorReady, setIsEditorReady] = useState(false)

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

    setLoadingState('loading')
    setErrorMessage(null)

    try {
      // Detect framework first
      const frameworkResult = await window.electronAPI.detectERDFramework(repoPath)
      if (frameworkResult.success && frameworkResult.data) {
        setFramework(frameworkResult.data as ERDFramework)
      }

      // Parse schema
      const result = await window.electronAPI.getERDSchema(repoPath)

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
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      setLoadingState('error')
    }
  }, [repoPath])

  // Load schema on mount and when repo changes
  useEffect(() => {
    loadSchema()
  }, [loadSchema])

  // Render schema when editor is ready and schema is loaded
  useEffect(() => {
    if (editorRef.current && isEditorReady && schema) {
      renderERDSchema(editorRef.current, schema)
    }
  }, [schema, isEditorReady])

  // Handle editor mount
  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      setIsEditorReady(true)
    },
    []
  )

  // Refresh handler
  const handleRefresh = useCallback(() => {
    if (editorRef.current) {
      clearERDShapes(editorRef.current)
    }
    loadSchema()
  }, [loadSchema])

  // Framework badge
  const frameworkBadge = framework && framework !== 'generic' && (
    <span className={`erd-framework-badge erd-framework-${framework}`}>
      {framework === 'laravel' ? '🐘 Laravel' : '💎 Rails'}
    </span>
  )

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
          <p className="erd-empty-hint">
            Supports Laravel migrations, Rails schema.rb, and Mermaid ERD files
          </p>
          <button className="erd-retry-button" onClick={handleRefresh}>
            Scan Again
          </button>
        </div>
      </div>
    )
  }

  // Success state - render tldraw canvas
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
          <button className="erd-action-button" onClick={handleRefresh} title="Refresh schema">
            ↻
          </button>
        </div>
      </div>
      <div className="erd-canvas-wrapper">
        <Tldraw
          shapeUtils={customShapeUtils}
          onMount={handleMount}
          inferDarkMode
          hideUi={false}
          components={{
            // Hide some default UI elements for cleaner ERD view
            PageMenu: null,
            DebugMenu: null,
            DebugPanel: null,
          }}
        />
      </div>
    </div>
  )
}

export default ERDCanvasPanel
