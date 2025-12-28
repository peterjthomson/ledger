/**
 * ResizeHandle - Draggable handle for resizing columns
 *
 * Features:
 * - Visual feedback on hover and drag
 * - Smooth dragging with pointer capture
 * - Calls onResize with delta on each move
 */

import { useCallback, useRef } from 'react'

export interface ResizeHandleProps {
  onResize: (deltaX: number) => void
}

export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const isDragging = useRef(false)
  const lastX = useRef(0)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      isDragging.current = true
      lastX.current = e.clientX
      ;(e.target as HTMLDivElement).setPointerCapture(e.pointerId)
    },
    []
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return
      const deltaX = e.clientX - lastX.current
      lastX.current = e.clientX
      onResize(deltaX)
    },
    [onResize]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false
    ;(e.target as HTMLDivElement).releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div
      className="canvas-resize-handle"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  )
}
