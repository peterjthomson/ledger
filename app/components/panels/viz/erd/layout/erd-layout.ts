/**
 * ERD Layout Utilities
 *
 * Shared layout functions used by all ERD renderers (tldraw, React Flow, etc.)
 * These functions are renderer-agnostic and work with pure ERDSchema data.
 */

import type { ERDSchema, ERDEntity } from '@/lib/services/erd/erd-types'
import dagre from 'dagre'

// Layout constants - shared across all renderers
export const LAYOUT_CONSTANTS = {
  NODE_WIDTH: 220,
  HEADER_HEIGHT: 32,
  ROW_HEIGHT: 24,
  PADDING: 8,
  NODE_MARGIN_X: 80,
  NODE_MARGIN_Y: 60,
} as const

/**
 * Position data for a laid-out entity
 */
export interface EntityPosition {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Calculate node height based on number of attributes
 */
export function calculateNodeHeight(entity: ERDEntity): number {
  const { HEADER_HEIGHT, ROW_HEIGHT, PADDING } = LAYOUT_CONSTANTS
  return HEADER_HEIGHT + Math.max(1, entity.attributes.length) * ROW_HEIGHT + PADDING
}

/**
 * Filter schema to entities with at least N relationships to OTHER filtered entities.
 * Uses iterative filtering to ensure all displayed entities actually have
 * the minimum number of visible connections.
 */
export function filterSchemaByRelationshipCount(schema: ERDSchema, minRelationships: number): ERDSchema {
  // Start with all entities
  let allowedEntityIds = new Set(schema.entities.map((e) => e.id))

  // Iteratively remove entities until stable
  // This handles the case where an entity has 3+ relationships but those
  // related entities don't meet the threshold, leaving it orphaned
  let changed = true
  while (changed) {
    changed = false

    // Count relationships only among currently allowed entities
    const relationshipCounts = new Map<string, number>()

    for (const rel of schema.relationships) {
      // Only count relationships where both entities are in the allowed set
      if (allowedEntityIds.has(rel.from.entity) && allowedEntityIds.has(rel.to.entity)) {
        relationshipCounts.set(rel.from.entity, (relationshipCounts.get(rel.from.entity) ?? 0) + 1)
        relationshipCounts.set(rel.to.entity, (relationshipCounts.get(rel.to.entity) ?? 0) + 1)
      }
    }

    // Remove entities that don't meet threshold
    const newAllowedIds = new Set<string>()
    for (const entityId of allowedEntityIds) {
      if ((relationshipCounts.get(entityId) ?? 0) >= minRelationships) {
        newAllowedIds.add(entityId)
      } else {
        changed = true // We removed something, need to re-check
      }
    }

    allowedEntityIds = newAllowedIds
  }

  const filteredEntities = schema.entities.filter((entity) => allowedEntityIds.has(entity.id))
  const filteredRelationships = schema.relationships.filter(
    (rel) => allowedEntityIds.has(rel.from.entity) && allowedEntityIds.has(rel.to.entity)
  )

  return {
    ...schema,
    entities: filteredEntities,
    relationships: filteredRelationships,
  }
}

/**
 * Layout entities using Dagre algorithm
 * Returns a map of entity ID to position data
 */
export function layoutEntities(schema: ERDSchema): Map<string, EntityPosition> {
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
  for (const entity of schema.entities) {
    const height = calculateNodeHeight(entity)
    g.setNode(entity.id, {
      width: NODE_WIDTH,
      height,
      entity,
    })
  }

  // Add edges from relationships
  for (const rel of schema.relationships) {
    g.setEdge(rel.from.entity, rel.to.entity)
  }

  // Run layout
  dagre.layout(g)

  // Extract positions
  const positions = new Map<string, EntityPosition>()

  let index = 0
  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId)
    if (node) {
      // Dagre gives center positions, convert to top-left
      let x = node.x - node.width / 2
      let y = node.y - node.height / 2

      // Validate coordinates - dagre can return NaN for edge cases
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        // Fallback to grid layout if dagre fails
        x = (index % 4) * (NODE_WIDTH + NODE_MARGIN_X) + 50
        y = Math.floor(index / 4) * (node.height + NODE_MARGIN_Y) + 50
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
 * Get bounds of all laid-out entities
 */
export function getLayoutBounds(positions: Map<string, EntityPosition>): {
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
