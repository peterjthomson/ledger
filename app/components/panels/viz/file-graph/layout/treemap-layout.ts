/**
 * FileGraph Treemap Layout
 *
 * Renderer-agnostic layout helpers for squarified treemaps.
 */

import type { FileNode } from '@/app/types/electron'

export interface TreemapRect {
  node: FileNode
  x: number
  y: number
  width: number
  height: number
}

/** Squarified treemap layout */
export function squarify(
  nodes: FileNode[],
  x: number,
  y: number,
  width: number,
  height: number,
  totalValue: number
): TreemapRect[] {
  if (nodes.length === 0 || totalValue === 0) return []

  const rects: TreemapRect[] = []
  const sorted = [...nodes].sort((a, b) => b.lines - a.lines)

  let currentX = x
  let currentY = y
  let remainingWidth = width
  let remainingHeight = height
  let remainingValue = totalValue

  let row: FileNode[] = []
  let rowValue = 0

  function aspectRatio(areas: number[], length: number): number {
    if (areas.length === 0 || length === 0) return Infinity
    const sum = areas.reduce((a, b) => a + b, 0)
    const min = Math.min(...areas)
    const max = Math.max(...areas)
    const s2 = sum * sum
    const l2 = length * length
    return Math.max((l2 * max) / s2, s2 / (l2 * min))
  }

  function layoutRow(rowNodes: FileNode[], value: number, isHorizontal: boolean) {
    if (rowNodes.length === 0) return
    const rowLength = isHorizontal
      ? (value / remainingValue) * remainingHeight
      : (value / remainingValue) * remainingWidth
    let offset = 0
    for (const node of rowNodes) {
      const nodeRatio = node.lines / value
      const nodeLength = isHorizontal ? nodeRatio * remainingWidth : nodeRatio * remainingHeight
      rects.push({
        node,
        x: isHorizontal ? currentX + offset : currentX,
        y: isHorizontal ? currentY : currentY + offset,
        width: isHorizontal ? nodeLength : rowLength,
        height: isHorizontal ? rowLength : nodeLength,
      })
      offset += nodeLength
    }
    if (isHorizontal) {
      currentY += rowLength
      remainingHeight -= rowLength
    } else {
      currentX += rowLength
      remainingWidth -= rowLength
    }
    remainingValue -= value
  }

  for (const node of sorted) {
    const isHorizontal = remainingWidth >= remainingHeight
    const length = isHorizontal ? remainingWidth : remainingHeight
    const rowAreas = row.map((n) => (n.lines / remainingValue) * length * (isHorizontal ? remainingHeight : remainingWidth))
    const newAreas = [...rowAreas, (node.lines / remainingValue) * length * (isHorizontal ? remainingHeight : remainingWidth)]
    const currentAspect = aspectRatio(rowAreas, length)
    const newAspect = aspectRatio(newAreas, length)

    if (row.length === 0 || newAspect <= currentAspect) {
      row.push(node)
      rowValue += node.lines
    } else {
      layoutRow(row, rowValue, isHorizontal)
      row = [node]
      rowValue = node.lines
    }
  }

  if (row.length > 0) {
    layoutRow(row, rowValue, remainingWidth >= remainingHeight)
  }

  return rects
}
