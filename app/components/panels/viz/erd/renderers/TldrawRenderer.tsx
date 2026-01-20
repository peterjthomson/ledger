/**
 * TldrawRenderer - ERD visualization using tldraw infinite canvas
 *
 * Renders ERDSchema as draggable entity shapes with relationship arrows
 * on a freeform infinite canvas.
 */

import { useCallback, useEffect, useState, useRef } from 'react'
import { Tldraw, Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { EntityShapeUtil } from '../EntityShapeUtil'
import { renderERDSchema, clearERDShapes } from '../erdUtils'
import type { ERDSchema } from '@/lib/services/erd/erd-types'

// Custom shape utilities for tldraw
const customShapeUtils = [EntityShapeUtil]

interface TldrawRendererProps {
  schema: ERDSchema | null
}

export function TldrawRenderer({ schema }: TldrawRendererProps) {
  const editorRef = useRef<Editor | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isEditorReady, setIsEditorReady] = useState(false)

  // Handle pointercancel - macOS Tahoe (26) can trigger this with 3-finger drag
  // causing the pen to get "stuck" because pointerup never fires
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePointerCancel = (_e: PointerEvent) => {
      // Force tldraw to reset its pointer state by completing the current tool action
      const editor = editorRef.current
      if (editor) {
        editor.cancel()
      }
    }

    container.addEventListener('pointercancel', handlePointerCancel, { capture: true })

    return () => {
      container.removeEventListener('pointercancel', handlePointerCancel, { capture: true })
    }
  }, [])

  // Render schema when editor is ready and schema changes
  useEffect(() => {
    if (editorRef.current && isEditorReady && schema) {
      // renderERDSchema returns a cleanup function to cancel pending RAFs
      const cleanup = renderERDSchema(editorRef.current, schema)
      return cleanup
    }
  }, [schema, isEditorReady])

  // Handle editor mount
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    setIsEditorReady(true)
  }, [])

  // Clear shapes when unmounting or schema becomes null
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        clearERDShapes(editorRef.current)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="erd-renderer erd-tldraw-renderer"
    >
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
  )
}

export default TldrawRenderer
