/**
 * Column - Generic column wrapper that handles sizing and resize
 *
 * Features:
 * - Fixed width or flex sizing
 * - Resize handle on the right edge
 * - Minimum width enforcement
 * - Slot type data attribute for CSS styling
 */

import { useRef, useCallback, type ReactNode } from 'react'
import type { Column as ColumnType } from '../../types/app-types'
import { ResizeHandle } from './ResizeHandle'

export interface ColumnProps {
  column: ColumnType
  children?: ReactNode
  isLast?: boolean
  onResize?: (width: number) => void
}

export function Column({ column, children, isLast, onResize }: ColumnProps) {
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

  // Calculate style based on width configuration
  const style: React.CSSProperties = {}
  if (column.width === 'flex') {
    style.flex = 1
    style.minWidth = column.minWidth || 100
  } else {
    style.width = column.width
    style.flexShrink = 0
    style.minWidth = column.minWidth || 100
  }

  return (
    <div
      ref={columnRef}
      className="canvas-column"
      data-slot={column.slotType}
      data-panel={column.panel}
      data-column-id={column.id}
      data-width-mode={column.width === 'flex' ? 'flex' : 'fixed'}
      style={style}
    >
      <div className="canvas-column-content">{children}</div>
      {!isLast && onResize && column.width !== 'flex' && (
        <ResizeHandle onResize={handleResize} />
      )}
    </div>
  )
}
