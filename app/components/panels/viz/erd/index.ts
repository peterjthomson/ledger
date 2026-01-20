/**
 * ERD Visualization Components
 *
 * Exports for the Entity Relationship Diagram multi-renderer panel.
 */

// Main panel component
export { ERDCanvasPanel, default } from './ERDCanvasPanel'

// tldraw shape utilities (for backwards compatibility)
export { EntityShapeUtil, calculateEntityHeight } from './EntityShapeUtil'
export type { ERDEntityShape } from './EntityShapeUtil'

// Shared layout utilities
export {
  filterSchemaByRelationshipCount,
  layoutEntities,
  calculateNodeHeight,
  getLayoutBounds,
  LAYOUT_CONSTANTS,
  type EntityPosition,
} from './layout/erd-layout'

// Individual renderers
export { TldrawRenderer, ReactFlowRenderer, JsonRenderer } from './renderers'

// tldraw-specific utilities (legacy)
export { renderERDSchema, clearERDShapes } from './erdUtils'
