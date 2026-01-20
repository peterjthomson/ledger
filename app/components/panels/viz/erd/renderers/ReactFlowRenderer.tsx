/**
 * ReactFlowRenderer - ERD visualization using React Flow
 *
 * Renders ERDSchema as a structured node graph with draggable entities
 * and relationship edges.
 */

import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { EntityNode, type EntityNodeData } from './EntityNode'
import { layoutEntities, calculateNodeHeight, LAYOUT_CONSTANTS } from '../layout/erd-layout'
import type { ERDSchema } from '@/lib/services/erd/erd-types'

// Register custom node types only
const nodeTypes: NodeTypes = {
  entity: EntityNode,
}

interface ReactFlowRendererProps {
  schema: ERDSchema | null
}

/**
 * Convert ERDSchema to React Flow nodes and edges
 */
function schemaToFlow(schema: ERDSchema): { nodes: Node<EntityNodeData>[]; edges: Edge[] } {
  if (!schema || schema.entities.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Get positions from shared layout
  const positions = layoutEntities(schema)

  // Create a set of entity IDs for validation
  const entityIds = new Set(schema.entities.map((e) => e.id))

  // Create nodes
  const nodes: Node<EntityNodeData>[] = schema.entities.map((entity) => {
    const pos = positions.get(entity.id)
    const height = calculateNodeHeight(entity)

    return {
      id: entity.id,
      type: 'entity',
      position: {
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
      },
      data: { entity },
      style: {
        width: LAYOUT_CONSTANTS.NODE_WIDTH,
        height,
      },
    }
  })

  // Create edges from relationships - only if both entities exist
  const edges: Edge[] = schema.relationships
    .filter((rel) => entityIds.has(rel.from.entity) && entityIds.has(rel.to.entity))
    .map((rel) => ({
      id: rel.id,
      source: rel.from.entity,
      target: rel.to.entity,
      type: 'smoothstep',
      animated: false,
      label: rel.label || undefined,
      labelStyle: { fontSize: 10, fill: '#666' },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      style: {
        stroke: '#999',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 15,
        height: 15,
        color: '#999',
      },
    }))

  return { nodes, edges }
}

export function ReactFlowRenderer({ schema }: ReactFlowRendererProps) {
  // Convert schema to React Flow format
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => (schema ? schemaToFlow(schema) : { nodes: [], edges: [] }),
    // Only compute once on mount - useEffect handles updates
     
    []
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes/edges when schema changes
  useEffect(() => {
    if (schema) {
      const { nodes: newNodes, edges: newEdges } = schemaToFlow(schema)
      setNodes(newNodes)
      setEdges(newEdges)
    }
  }, [schema, setNodes, setEdges])

  // Fit view on initial load
  const onInit = useCallback((instance: { fitView: () => void }) => {
    // Small delay to ensure nodes are rendered
    setTimeout(() => {
      instance.fitView()
    }, 100)
  }, [])

  if (!schema || schema.entities.length === 0) {
    return (
      <div className="erd-renderer erd-reactflow-renderer erd-empty">
        <p>No entities to display</p>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className="erd-renderer erd-reactflow-renderer">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onInit={onInit}
          fitView
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              const entity = (node.data as EntityNodeData)?.entity
              if (!entity) return 'var(--bg-tertiary)'
              // Color by number of relationships (more = darker)
              const relCount = entity.attributes.filter((a) => a.constraints.includes('FK')).length
              if (relCount >= 3) return 'var(--accent)'
              if (relCount >= 1) return 'var(--accent-secondary)'
              return 'var(--bg-tertiary)'
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  )
}

export default ReactFlowRenderer
