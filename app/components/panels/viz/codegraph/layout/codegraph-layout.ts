/**
 * Code Graph Layout Utilities
 *
 * Shared layout functions used by all code graph renderers.
 * Uses dagre for hierarchical layout.
 */

import dagre from 'dagre'
import type { CodeGraphSchema, CodeNode } from '@/app/types/electron'

// Layout constants
export const LAYOUT_CONSTANTS = {
  NODE_WIDTH: 180,
  NODE_HEIGHT_BASE: 40,
  NODE_HEIGHT_PER_LINE: 0,
  NODE_MARGIN_X: 60,
  NODE_MARGIN_Y: 40,
} as const

/**
 * Position data for a laid-out node
 */
export interface NodePosition {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Calculate node height based on kind
 */
export function calculateNodeHeight(_node: CodeNode): number {
  return LAYOUT_CONSTANTS.NODE_HEIGHT_BASE
}

/**
 * Layout code graph nodes using Dagre algorithm
 */
export function layoutCodeGraph(schema: CodeGraphSchema): Map<string, NodePosition> {
  const { NODE_WIDTH, NODE_MARGIN_X, NODE_MARGIN_Y } = LAYOUT_CONSTANTS
  const g = new dagre.graphlib.Graph()

  g.setGraph({
    rankdir: 'TB', // Top to bottom
    nodesep: NODE_MARGIN_X,
    ranksep: NODE_MARGIN_Y,
    marginx: 50,
    marginy: 50,
  })

  g.setDefaultEdgeLabel(() => ({}))

  // Add nodes
  for (const node of schema.nodes) {
    const height = calculateNodeHeight(node)
    g.setNode(node.id, {
      width: NODE_WIDTH,
      height,
      node,
    })
  }

  // Add edges (only resolved ones to avoid layout issues with missing targets)
  for (const edge of schema.edges) {
    // Only add edges where both source and target exist in nodes
    const sourceExists = schema.nodes.some((n) => n.id === edge.source)
    const targetExists = schema.nodes.some((n) => n.id === edge.target)

    if (sourceExists && targetExists) {
      g.setEdge(edge.source, edge.target)
    }
  }

  // Run layout
  dagre.layout(g)

  // Extract positions
  const positions = new Map<string, NodePosition>()

  let index = 0
  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId)
    if (node) {
      // Dagre gives center positions, convert to top-left
      let x = node.x - node.width / 2
      let y = node.y - node.height / 2

      // Validate coordinates
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        // Fallback to grid layout
        x = (index % 5) * (NODE_WIDTH + NODE_MARGIN_X) + 50
        y = Math.floor(index / 5) * (node.height + NODE_MARGIN_Y) + 50
      }

      positions.set(nodeId, {
        x,
        y,
        width: node.width,
        height: node.height,
      })
      index++
    }
  }

  return positions
}

/**
 * Get bounds of all laid-out nodes
 */
export function getLayoutBounds(positions: Map<string, NodePosition>): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + pos.width)
    maxY = Math.max(maxY, pos.y + pos.height)
  }

  return {
    minX: minX === Infinity ? 0 : minX,
    minY: minY === Infinity ? 0 : minY,
    maxX: maxX === -Infinity ? 0 : maxX,
    maxY: maxY === -Infinity ? 0 : maxY,
    width: maxX === -Infinity ? 0 : maxX - minX,
    height: maxY === -Infinity ? 0 : maxY - minY,
  }
}
