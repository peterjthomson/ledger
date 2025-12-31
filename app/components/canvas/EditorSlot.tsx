/**
 * EditorSlot - Renders the editor panel with navigation controls
 *
 * Features:
 * - Back/forward navigation buttons
 * - Renders current editor entry from global state
 * - Empty state when no editor content
 */

import { useCanvas } from './CanvasContext'
import type { Column } from '../../types/app-types'

export interface EditorSlotProps {
  column: Column
  // Render function for the actual panel content
  renderPanel: (panel: string, data?: unknown) => React.ReactNode
}

export function EditorSlot({ column, renderPanel }: EditorSlotProps) {
  const { currentEditorEntry, canGoBack, canGoForward, goBack, goForward } = useCanvas()

  return (
    <div className="editor-slot" data-column-id={column.id}>
      {/* Header with navigation */}
      <div className="column-header editor-header">
        <div className="column-title">
          <h2>
            <span className="column-icon">{column.icon || '◇'}</span>
            {column.label || 'Details'}
          </h2>
        </div>
        <div className="editor-nav">
          <button
            className="editor-nav-btn"
            onClick={goBack}
            disabled={!canGoBack}
            title="Go back (⌘[)"
          >
            ←
          </button>
          <button
            className="editor-nav-btn"
            onClick={goForward}
            disabled={!canGoForward}
            title="Go forward (⌘])"
          >
            →
          </button>
        </div>
      </div>

      {/* Panel Content */}
      <div className="editor-slot-content">
        {currentEditorEntry ? (
          renderPanel(currentEditorEntry.panel, currentEditorEntry.data)
        ) : (
          <div className="editor-slot-empty">
            <div className="editor-slot-empty-icon">◇</div>
            <p>Select an item to view details</p>
            <p className="editor-slot-empty-hint">
              Click on a PR, branch, or worktree
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
