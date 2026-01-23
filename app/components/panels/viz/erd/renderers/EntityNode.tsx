/**
 * EntityNode - Custom React Flow node for ERD entities (tables)
 *
 * Renders database tables as rectangular boxes with:
 * - Header showing table name
 * - List of attributes with type and constraint icons
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ERDEntity, ERDAttribute, ERDConstraint } from '@/lib/services/erd/erd-types'

// Node data type
export interface EntityNodeData {
  entity: ERDEntity
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

/**
 * React Flow custom node for ERD entities
 */
function EntityNodeComponent({ data, selected }: NodeProps<EntityNodeData>) {
  const { entity } = data

  return (
    <div className={`erd-entity-node ${selected ? 'selected' : ''}`}>
      {/* Connection handles - each position can be both source and target */}
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        className="erd-handle erd-handle-top"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top-source"
        className="erd-handle erd-handle-top"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        className="erd-handle erd-handle-bottom"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        className="erd-handle erd-handle-bottom"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="erd-handle erd-handle-left"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        className="erd-handle erd-handle-left"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className="erd-handle erd-handle-right"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="erd-handle erd-handle-right"
      />

      {/* Entity content */}
      <div className="erd-entity-header">{entity.displayName || entity.name}</div>
      <div className="erd-entity-attributes">
        {entity.attributes.length === 0 ? (
          <div className="erd-attribute erd-attribute-empty">
            <span className="erd-attr-name">No columns defined</span>
          </div>
        ) : (
          entity.attributes.map((attr, index) => <AttributeRow key={`${attr.name}-${index}`} attribute={attr} />)
        )}
      </div>
    </div>
  )
}

// Memoize to prevent unnecessary re-renders
export const EntityNode = memo(EntityNodeComponent)
export default EntityNode
