/**
 * Column - Generic column wrapper that handles sizing, resize, and drag
 *
 * Features:
 * - Fixed width or flex sizing
 * - Resize handle on the right edge
 * - Drag handle for reordering
 * - Minimum width enforcement
 * - Slot type data attribute for CSS styling
 */

import { useRef, useCallback, type ReactNode, type DragEvent } from 'react'
import type { Column as ColumnType } from '../../types/app-types'
import { ResizeHandle } from './ResizeHandle'

export interface ColumnProps {
  column: ColumnType
  children?: ReactNode
  index?: number
  isLast?: boolean
  fillRemaining?: boolean  // Force flex behavior when no flex column exists
  isDragging?: boolean
  isDragOver?: boolean
  onResize?: (width: number) => void
  onDragStart?: () => void
  onDragOver?: () => void
  onDragEnd?: () => void
  onDragLeave?: () => void
}

export function Column({
  column,
  children,
  index: _index,
  isLast,
  fillRemaining,
  isDragging,
  isDragOver,
  onResize,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragLeave,
}: ColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null)

  const handleResize = useCallback(
    (deltaX: number) => {
      if (!onResize || !columnRef.current) return

      const currentWidth = columnRef.current.offsetWidth
      const newWidth = Math.max(column.minWidth || 100, currentWidth + deltaX)
      onResize(newWidth)
    },
    [onResize, column.minWidth]
  )

  // Drag event handlers
  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      onDragStart?.()
    },
    [onDragStart]
  )

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      onDragOver?.()
    },
    [onDragOver]
  )

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      onDragEnd?.()
    },
    [onDragEnd]
  )

  const handleDragEnd = useCallback(() => {
    onDragEnd?.()
  }, [onDragEnd])

  // Calculate style based on width configuration
  const style: React.CSSProperties = {}
  if (column.width === 'flex' || fillRemaining) {
    // Flex column fills remaining space
    style.flex = 1
    style.minWidth = column.minWidth || 100
  } else {
    // Fixed width column
    style.width = column.width
    style.flexShrink = 0
    style.minWidth = column.minWidth || 100
  }

  const canDrag = !!onDragStart

  return (
    <div
      ref={columnRef}
      className={`canvas-column ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
      data-testid={`canvas-column-${column.panel}`}
      data-slot={column.slotType}
      data-panel={column.panel}
      data-column-id={column.id}
      data-width-mode={column.width === 'flex' ? 'flex' : 'fixed'}
      style={style}
      draggable={canDrag}
      onDragStart={canDrag ? handleDragStart : undefined}
      onDragOver={canDrag ? handleDragOver : undefined}
      onDrop={canDrag ? handleDrop : undefined}
      onDragEnd={canDrag ? handleDragEnd : undefined}
      onDragLeave={canDrag ? onDragLeave : undefined}
    >
      {/* Drag handle - only show if dragging is enabled */}
      {canDrag && (
        <div className="canvas-column-drag-handle" title="Drag to reorder">
          ⋮⋮
        </div>
      )}
      <div className="canvas-column-content">{children}</div>
      {/* Resize handle on right edge - show for all non-last columns */}
      {!isLast && onResize && (
        <ResizeHandle onResize={handleResize} />
      )}
    </div>
  )
}
