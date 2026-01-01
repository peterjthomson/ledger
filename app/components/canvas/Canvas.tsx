/**
 * Canvas - Main container that renders columns based on canvas configuration
 *
 * Handles:
 * - Column layout and sizing
 * - Column visibility (filters out columns with visible: false)
 * - Drag-and-drop reordering
 * - Delegating to slot-specific renderers
 */

import { useState, useCallback, useMemo, type ReactNode } from 'react'
import type { Canvas as CanvasType, Column as ColumnType } from '../../types/app-types'
import { Column } from './Column'

export interface CanvasProps {
  canvas: CanvasType
  children?: ReactNode
  // Slot renderers - passed from parent to allow custom rendering
  renderListSlot?: (column: ColumnType) => ReactNode
  renderEditorSlot?: (column: ColumnType) => ReactNode
  renderVizSlot?: (column: ColumnType) => ReactNode
  // Column operations
  onResizeColumn?: (columnId: string, width: number) => void
  onReorderColumns?: (fromIndex: number, toIndex: number) => void
}

export function Canvas({
  canvas,
  renderListSlot,
  renderEditorSlot,
  renderVizSlot,
  onResizeColumn,
  onReorderColumns,
}: CanvasProps) {
  // Drag state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Filter to visible columns only
  const visibleColumns = useMemo(
    () => canvas.columns.filter((col) => col.visible !== false),
    [canvas.columns]
  )
  
  // Check if any visible column is flex
  const hasFlexColumn = visibleColumns.some((col) => col.width === 'flex')

  // Drag handlers
  const handleDragStart = useCallback((index: number) => {
    setDraggingIndex(index)
  }, [])

  const handleDragOver = useCallback((index: number) => {
    setDragOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
      onReorderColumns?.(draggingIndex, dragOverIndex)
    }
    setDraggingIndex(null)
    setDragOverIndex(null)
  }, [draggingIndex, dragOverIndex, onReorderColumns])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  return (
    <div className="canvas-layout" data-canvas-id={canvas.id} data-testid={`canvas-layout-${canvas.id}`}>
      {visibleColumns.map((column, index) => {
        const isLast = index === visibleColumns.length - 1
        // If no flex column exists, make last column fill remaining space
        const fillRemaining = !hasFlexColumn && isLast
        
        return (
          <Column
            key={column.id}
            column={column}
            index={index}
            isLast={isLast}
            fillRemaining={fillRemaining}
            isDragging={draggingIndex === index}
            isDragOver={dragOverIndex === index}
            onResize={onResizeColumn ? (width) => onResizeColumn(column.id, width) : undefined}
            onDragStart={onReorderColumns ? () => handleDragStart(index) : undefined}
            onDragOver={onReorderColumns ? () => handleDragOver(index) : undefined}
            onDragEnd={onReorderColumns ? handleDragEnd : undefined}
            onDragLeave={onReorderColumns ? handleDragLeave : undefined}
          >
            {column.slotType === 'list' && renderListSlot?.(column)}
            {column.slotType === 'editor' && renderEditorSlot?.(column)}
            {column.slotType === 'viz' && renderVizSlot?.(column)}
          </Column>
        )
      })}
    </div>
  )
}
