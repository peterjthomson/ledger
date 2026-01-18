/**
 * ERD Utility Functions
 *
 * Helper functions for ERD layout and rendering
 */

import type { Box, Editor, TLShapeId } from '@tldraw/editor'
import { Box as TLBox } from '@tldraw/editor'
import { toRichText } from '@tldraw/tlschema'
import type { ERDSchema, ERDEntity, ERDRelationship, ERDCardinality } from '@/lib/services/erd/erd-types'
import type { ERDEntityShape } from './EntityShapeUtil'
import dagre from 'dagre'

// Layout constants
const NODE_WIDTH = 220
const HEADER_HEIGHT = 32
const ROW_HEIGHT = 24
const PADDING = 8
const NODE_MARGIN_X = 80
const NODE_MARGIN_Y = 60

/**
 * Calculate node height based on attributes
 */
function calculateNodeHeight(entity: ERDEntity): number {
  return HEADER_HEIGHT + Math.max(1, entity.attributes.length) * ROW_HEIGHT + PADDING
}

/**
 * Filter schema to entities with at least N relationships
 */
export function filterSchemaByRelationshipCount(schema: ERDSchema, minRelationships: number): ERDSchema {
  const relationshipCounts = new Map<string, number>()

  for (const rel of schema.relationships) {
    relationshipCounts.set(rel.from.entity, (relationshipCounts.get(rel.from.entity) ?? 0) + 1)
    relationshipCounts.set(rel.to.entity, (relationshipCounts.get(rel.to.entity) ?? 0) + 1)
  }

  const filteredEntities = schema.entities.filter(
    (entity) => (relationshipCounts.get(entity.id) ?? 0) >= minRelationships
  )
  const allowedEntityIds = new Set(filteredEntities.map((entity) => entity.id))
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
 */
export function layoutEntities(
  schema: ERDSchema
): Map<string, { x: number; y: number; width: number; height: number }> {
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
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>()

  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId)
    if (node) {
      // Dagre gives center positions, convert to top-left
      positions.set(nodeId, {
        x: node.x - node.width / 2,
        y: node.y - node.height / 2,
        width: node.width,
        height: node.height,
      })
    }
  }

  return positions
}

/**
 * Create entity shapes on the canvas
 */
export function createEntityShapes(editor: Editor, schema: ERDSchema): Map<string, TLShapeId> {
  const positions = layoutEntities(schema)
  const shapeIds = new Map<string, TLShapeId>()

  const shapes: Array<{
    id: TLShapeId
    type: 'erd-entity'
    x: number
    y: number
    props: ERDEntityShape['props']
  }> = []

  for (const entity of schema.entities) {
    const pos = positions.get(entity.id)
    if (!pos) continue

    const id = `shape:erd-entity-${entity.id}` as TLShapeId
    shapeIds.set(entity.id, id)

    shapes.push({
      id,
      type: 'erd-entity',
      x: pos.x,
      y: pos.y,
      props: {
        w: pos.width,
        h: pos.height,
        entity,
      },
    })
  }

  editor.createShapes(shapes)
  return shapeIds
}

/**
 * Create relationship arrows between entities
 */
export function createRelationshipArrows(
  editor: Editor,
  schema: ERDSchema,
  entityShapeIds: Map<string, TLShapeId>
): void {
  const arrows: Array<{
    id: TLShapeId
    type: 'arrow'
    x: number
    y: number
    props: {
      start: { x: number; y: number }
      end: { x: number; y: number }
      richText: ReturnType<typeof toRichText>
      labelPosition: number
    }
  }> = []

  for (const rel of schema.relationships) {
    const fromShapeId = entityShapeIds.get(rel.from.entity)
    const toShapeId = entityShapeIds.get(rel.to.entity)

    if (!fromShapeId || !toShapeId) continue

    const fromShape = editor.getShape(fromShapeId)
    const toShape = editor.getShape(toShapeId)

    if (!fromShape || !toShape) continue

    // Calculate connection points (center of shapes)
    const fromCenter = {
      x: fromShape.x + (fromShape.props as ERDEntityShape['props']).w / 2,
      y: fromShape.y + (fromShape.props as ERDEntityShape['props']).h / 2,
    }

    const toCenter = {
      x: toShape.x + (toShape.props as ERDEntityShape['props']).w / 2,
      y: toShape.y + (toShape.props as ERDEntityShape['props']).h / 2,
    }

    // Find best edge points
    const fromPoint = findEdgePoint(fromShape, toCenter)
    const toPoint = findEdgePoint(toShape, fromCenter)

    const id = `shape:erd-rel-${rel.id}` as TLShapeId

    // Create label with cardinality notation
    const label = formatRelationshipLabel(rel)

    if (
      !Number.isFinite(fromPoint.x) ||
      !Number.isFinite(fromPoint.y) ||
      !Number.isFinite(toPoint.x) ||
      !Number.isFinite(toPoint.y)
    ) {
      continue
    }

    arrows.push({
      id,
      type: 'arrow',
      x: fromPoint.x,
      y: fromPoint.y,
      props: {
        start: { x: 0, y: 0 },
        end: { x: toPoint.x - fromPoint.x, y: toPoint.y - fromPoint.y },
        richText: toRichText(label),
        labelPosition: 0.5,
      },
    })
  }

  if (arrows.length > 0) {
    editor.createShapes(arrows)
  }
}

/**
 * Find the best edge point on a shape for connecting to a target
 */
function findEdgePoint(
  shape: { x: number; y: number; props: { w: number; h: number } },
  target: { x: number; y: number }
): { x: number; y: number } {
  const props = shape.props as { w: number; h: number }
  const cx = shape.x + props.w / 2
  const cy = shape.y + props.h / 2

  const dx = target.x - cx
  const dy = target.y - cy

  // Determine which edge to use
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  if (absX * props.h > absY * props.w) {
    // Connect to left or right edge
    if (dx > 0) {
      return { x: shape.x + props.w, y: cy }
    } else {
      return { x: shape.x, y: cy }
    }
  } else {
    // Connect to top or bottom edge
    if (dy > 0) {
      return { x: cx, y: shape.y + props.h }
    } else {
      return { x: cx, y: shape.y }
    }
  }
}

/**
 * Format relationship label - just show the label name without cardinality symbols
 */
function formatRelationshipLabel(rel: ERDRelationship): string {
  // Only show the relationship name/label, skip cardinality notation
  // Cardinality is better shown visually with arrow heads
  return rel.label || ''
}

/**
 * Clear all ERD shapes from the canvas
 */
export function clearERDShapes(editor: Editor): void {
  const allShapes = editor.getCurrentPageShapes()
  const erdShapeIds = allShapes
    .filter(
      (shape) => shape.type === 'erd-entity' || (shape.type === 'arrow' && shape.id.toString().includes('erd-rel'))
    )
    .map((shape) => shape.id)

  if (erdShapeIds.length > 0) {
    editor.deleteShapes(erdShapeIds)
  }
}

/**
 * Render full ERD schema on canvas
 */
export function renderERDSchema(editor: Editor, schema: ERDSchema): void {
  // Clear existing ERD shapes
  clearERDShapes(editor)

  // Create entity shapes
  const shapeIds = createEntityShapes(editor, schema)

  // Create relationship arrows
  createRelationshipArrows(editor, schema, shapeIds)

  // Zoom to fit ERD shapes with extra padding and a max zoom
  requestAnimationFrame(() => {
    zoomToERDShapes(editor, { inset: 160, maxZoom: 0.8 })
  })
}

/**
 * Zoom to fit ERD entity shapes with padding and max zoom limit
 */
export function zoomToERDShapes(
  editor: Editor,
  options: { inset?: number; maxZoom?: number } = {}
): void {
  const shapes = editor.getCurrentPageShapes().filter((shape) => shape.type === 'erd-entity')
  if (shapes.length === 0) return

  const boundsList: Box[] = shapes
    .map((shape) => editor.getShapePageBounds(shape.id))
    .filter((bounds): bounds is Box => Boolean(bounds))

  if (boundsList.length === 0) return

  const bounds = TLBox.Common(boundsList)
  editor.zoomToBounds(bounds, {
    animation: { duration: 300 },
    inset: options.inset,
    targetZoom: options.maxZoom,
  })
}
