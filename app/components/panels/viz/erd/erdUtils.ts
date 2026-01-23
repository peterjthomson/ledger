/**
 * ERD tldraw Utility Functions
 *
 * tldraw-specific helper functions for ERD rendering.
 * Uses shared layout utilities from ./layout/erd-layout.ts
 */

import { Box as TLBox, type Box, type Editor, type TLShapeId } from '@tldraw/editor'
import { toRichText } from '@tldraw/tlschema'
import type { ERDSchema, ERDRelationship } from '@/lib/services/erd/erd-types'
import type { ERDEntityShape } from './EntityShapeUtil'
import { layoutEntities } from './layout/erd-layout'

// Re-export shared utilities for backwards compatibility
export { filterSchemaByRelationshipCount, layoutEntities, LAYOUT_CONSTANTS } from './layout/erd-layout'

/**
 * Create entity shapes on the tldraw canvas
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

    // Validate all numeric values are finite
    if (
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.width) ||
      !Number.isFinite(pos.height) ||
      pos.width <= 0 ||
      pos.height <= 0
    ) {
      console.warn(`[ERD] Skipping entity ${entity.id} with invalid position:`, pos)
      continue
    }

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
 * Create relationship arrows between entities on tldraw canvas
 */
export function createRelationshipArrows(
  editor: Editor,
  schema: ERDSchema,
  entityShapeIds: Map<string, TLShapeId>
): void {
  // Build a set of valid entity IDs from the schema
  const validEntityIds = new Set(schema.entities.map((e) => e.id))

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
    // Skip relationships where either entity doesn't exist in the current schema
    if (!validEntityIds.has(rel.from.entity) || !validEntityIds.has(rel.to.entity)) {
      continue
    }

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
 * Clear all ERD shapes from the tldraw canvas
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
 * Render full ERD schema on tldraw canvas
 *
 * @returns Cleanup function to cancel pending animations (call in useEffect cleanup)
 */
export function renderERDSchema(editor: Editor, schema: ERDSchema): () => void {
  // Clear existing ERD shapes
  clearERDShapes(editor)

  // Create entity shapes
  const shapeIds = createEntityShapes(editor, schema)

  // Create relationship arrows
  createRelationshipArrows(editor, schema, shapeIds)

  // Zoom to fit ERD shapes with extra padding and a max zoom
  const rafId = requestAnimationFrame(() => {
    // Guard against disposed editor (component may have unmounted)
    try {
      zoomToERDShapes(editor, { inset: 160, maxZoom: 0.8 })
    } catch (_e) {
      // Editor may be disposed, ignore
    }
  })

  // Return cleanup function to cancel pending RAF
  return () => {
    cancelAnimationFrame(rafId)
  }
}

/**
 * Zoom to fit ERD entity shapes with padding and max zoom limit
 *
 * @param options.inset - Padding around the bounds
 * @param options.maxZoom - Maximum zoom level (ceiling, not exact target)
 */
export function zoomToERDShapes(editor: Editor, options: { inset?: number; maxZoom?: number } = {}): void {
  const shapes = editor.getCurrentPageShapes().filter((shape) => shape.type === 'erd-entity')
  if (shapes.length === 0) return

  const boundsList: Box[] = shapes
    .map((shape) => editor.getShapePageBounds(shape.id))
    .filter((bounds): bounds is Box => Boolean(bounds))

  if (boundsList.length === 0) return

  const bounds = TLBox.Common(boundsList)
  const inset = options.inset ?? 0
  const maxZoom = options.maxZoom ?? 1

  // Get viewport dimensions
  const viewportBounds = editor.getViewportScreenBounds()
  const viewportWidth = viewportBounds.width - inset * 2
  const viewportHeight = viewportBounds.height - inset * 2

  // Calculate zoom to fit bounds in viewport
  const zoomX = viewportWidth / bounds.width
  const zoomY = viewportHeight / bounds.height
  const fitZoom = Math.min(zoomX, zoomY)

  // Apply maxZoom as a ceiling, not an exact target
  const targetZoom = Math.min(fitZoom, maxZoom)

  editor.zoomToBounds(bounds, {
    animation: { duration: 300 },
    inset,
    targetZoom,
  })
}
