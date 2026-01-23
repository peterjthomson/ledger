/**
 * EntityShapeUtil - Custom tldraw shape for ERD entities (tables)
 *
 * Renders database tables as rectangular boxes with:
 * - Header showing table name
 * - List of attributes with type and constraint icons
 */

import { ShapeUtil, HTMLContainer, Rectangle2d, TLBaseShape, TLResizeInfo, resizeBox } from '@tldraw/editor'
import { ERDEntity, ERDAttribute, ERDConstraint } from '@/lib/services/erd/erd-types'

// Define the shape type
export type ERDEntityShape = TLBaseShape<
  'erd-entity',
  {
    w: number
    h: number
    entity: ERDEntity
  }
>

// Header height + row height for attribute calculation
const HEADER_HEIGHT = 32
const ROW_HEIGHT = 24
const MIN_WIDTH = 180
const PADDING = 8

/**
 * Calculate shape height based on number of attributes
 */
export function calculateEntityHeight(entity: ERDEntity): number {
  return HEADER_HEIGHT + Math.max(1, entity.attributes.length) * ROW_HEIGHT + PADDING
}

/**
 * Get constraint icon for an attribute
 */
function getConstraintIcon(constraints: ERDConstraint[]): string {
  const icons: string[] = []
  if (constraints.includes('PK')) icons.push('🔑')
  if (constraints.includes('FK')) icons.push('🔗')
  if (constraints.includes('UK')) icons.push('✦')
  if (constraints.includes('indexed')) icons.push('⚡')
  return icons.join('')
}

/**
 * ShapeUtil for ERD Entity shapes
 */
export class EntityShapeUtil extends ShapeUtil<ERDEntityShape> {
  static override type = 'erd-entity' as const

  getDefaultProps(): ERDEntityShape['props'] {
    return {
      w: MIN_WIDTH,
      h: HEADER_HEIGHT + ROW_HEIGHT + PADDING,
      entity: {
        id: '',
        name: 'new_table',
        displayName: 'New Table',
        attributes: [],
      },
    }
  }

  getGeometry(shape: ERDEntityShape) {
    // Ensure valid dimensions (fallback to defaults if NaN)
    const width = Number.isFinite(shape.props.w) && shape.props.w > 0 ? shape.props.w : MIN_WIDTH
    const height = Number.isFinite(shape.props.h) && shape.props.h > 0 ? shape.props.h : HEADER_HEIGHT + ROW_HEIGHT + PADDING

    return new Rectangle2d({
      width,
      height,
      isFilled: true,
    })
  }

  override canResize() {
    return true
  }

  override onResize(shape: ERDEntityShape, info: TLResizeInfo<ERDEntityShape>) {
    return resizeBox(shape, info)
  }

  component(shape: ERDEntityShape) {
    const { entity } = shape.props

    return (
      <HTMLContainer
        className="erd-entity-shape"
        style={{
          width: shape.props.w,
          height: shape.props.h,
          pointerEvents: 'all',
        }}
      >
        <div className="erd-entity-header">{entity.displayName || entity.name}</div>
        <div className="erd-entity-attributes">
          {entity.attributes.length === 0 ? (
            <div className="erd-attribute erd-attribute-empty">
              <span className="erd-attr-name">No columns defined</span>
            </div>
          ) : (
            entity.attributes.map((attr, index) => (
              <AttributeRow key={`${attr.name}-${index}`} attribute={attr} />
            ))
          )}
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: ERDEntityShape) {
    // Ensure valid dimensions for the indicator rect
    const width = Number.isFinite(shape.props.w) && shape.props.w > 0 ? shape.props.w : MIN_WIDTH
    const height = Number.isFinite(shape.props.h) && shape.props.h > 0 ? shape.props.h : HEADER_HEIGHT + ROW_HEIGHT + PADDING

    return <rect width={width} height={height} rx={4} ry={4} />
  }
}

/**
 * Single attribute row component
 */
function AttributeRow({ attribute }: { attribute: ERDAttribute }) {
  const icon = getConstraintIcon(attribute.constraints)
  const isNullable = attribute.constraints.includes('nullable')

  return (
    <div className="erd-attribute" title={attribute.comment}>
      <span className="erd-attr-key">{icon}</span>
      <span className={`erd-attr-name ${isNullable ? 'erd-attr-nullable' : ''}`}>{attribute.name}</span>
      <span className="erd-attr-type">{attribute.type}</span>
    </div>
  )
}
