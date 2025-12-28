/**
 * Canvas - Main container that renders columns based on canvas configuration
 *
 * Handles:
 * - Column layout and sizing
 * - Drag-and-drop reordering (future)
 * - Delegating to slot-specific renderers
 */

import { type ReactNode } from 'react'
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
}: CanvasProps) {
  return (
    <div className="canvas-layout" data-canvas-id={canvas.id}>
      {canvas.columns.map((column, index) => (
        <Column
          key={column.id}
          column={column}
          isLast={index === canvas.columns.length - 1}
          onResize={onResizeColumn ? (width) => onResizeColumn(column.id, width) : undefined}
        >
          {column.slotType === 'list' && renderListSlot?.(column)}
          {column.slotType === 'editor' && renderEditorSlot?.(column)}
          {column.slotType === 'viz' && renderVizSlot?.(column)}
        </Column>
      ))}
    </div>
  )
}
