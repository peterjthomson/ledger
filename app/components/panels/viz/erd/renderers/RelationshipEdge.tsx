/**
 * RelationshipEdge - Custom React Flow edge for ERD relationships
 *
 * Renders relationship lines between entities with optional labels
 * and cardinality indicators.
 */

import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { ERDCardinality } from '@/lib/services/erd/erd-types'

// Edge data type
export interface RelationshipEdgeData {
  label?: string
  fromCardinality?: ERDCardinality
  toCardinality?: ERDCardinality
}

/**
 * Get cardinality symbol for display
 */
function getCardinalitySymbol(cardinality: ERDCardinality | undefined): string {
  switch (cardinality) {
    case 'one':
      return '1'
    case 'zero-or-one':
      return '0..1'
    case 'many':
      return '*'
    case 'one-or-more':
      return '1..*'
    default:
      return ''
  }
}

/**
 * React Flow custom edge for ERD relationships
 */
function RelationshipEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  style,
}: EdgeProps<RelationshipEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const fromSymbol = getCardinalitySymbol(data?.fromCardinality)
  const toSymbol = getCardinalitySymbol(data?.toCardinality)

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: selected ? 2.5 : 1.5,
          stroke: selected ? 'var(--accent)' : 'var(--border-primary)',
        }}
        className={`erd-relationship-edge ${selected ? 'selected' : ''}`}
      />
      <EdgeLabelRenderer>
        {/* Relationship label */}
        {data?.label && (
          <div
            className="erd-edge-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            {data.label}
          </div>
        )}
        {/* From cardinality */}
        {fromSymbol && (
          <div
            className="erd-edge-cardinality erd-edge-cardinality-from"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * 0.15}px,${sourceY + (targetY - sourceY) * 0.15}px)`,
              pointerEvents: 'none',
            }}
          >
            {fromSymbol}
          </div>
        )}
        {/* To cardinality */}
        {toSymbol && (
          <div
            className="erd-edge-cardinality erd-edge-cardinality-to"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * 0.85}px,${sourceY + (targetY - sourceY) * 0.85}px)`,
              pointerEvents: 'none',
            }}
          >
            {toSymbol}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

// Memoize to prevent unnecessary re-renders
export const RelationshipEdge = memo(RelationshipEdgeComponent)
export default RelationshipEdge
