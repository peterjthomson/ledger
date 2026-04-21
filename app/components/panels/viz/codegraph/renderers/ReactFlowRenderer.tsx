/**
 * ReactFlowRenderer - Code Graph visualization using React Flow
 *
 * Renders CodeGraphSchema as a structured node graph with draggable nodes
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

import { CodeNode, type CodeNodeData } from './CodeNode'
import { layoutCodeGraph, calculateNodeHeight, LAYOUT_CONSTANTS } from '../layout/codegraph-layout'
import type { CodeGraphSchema, CodeEdgeKind } from '@/app/types/electron'

// Register custom node types
const nodeTypes: NodeTypes = {
  codeNode: CodeNode,
}

interface ReactFlowRendererProps {
  schema: CodeGraphSchema | null
}

/**
 * Get edge style based on kind
 */
function getEdgeStyle(kind: CodeEdgeKind): { stroke: string; strokeDasharray?: string } {
  switch (kind) {
    case 'imports':
      return { stroke: '#6b7280' } // gray
    case 'extends':
      return { stroke: '#3b82f6' } // blue
    case 'implements':
      return { stroke: '#8b5cf6', strokeDasharray: '5 5' } // purple dashed
    case 'includes':
      return { stroke: '#f59e0b' } // amber
    case 'exports':
      return { stroke: '#10b981' } // green
    default:
      return { stroke: '#9ca3af' }
  }
}

/**
 * Convert CodeGraphSchema to React Flow nodes and edges
 */
function schemaToFlow(schema: CodeGraphSchema): { nodes: Node<CodeNodeData>[]; edges: Edge[] } {
  if (!schema || schema.nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Get positions from layout
  const positions = layoutCodeGraph(schema)

  // Create a set of node IDs for validation
  const nodeIds = new Set(schema.nodes.map((n) => n.id))

  // Create nodes
  const nodes: Node<CodeNodeData>[] = schema.nodes.map((node) => {
    const pos = positions.get(node.id)
    const height = calculateNodeHeight(node)

    return {
      id: node.id,
      type: 'codeNode',
      position: {
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
      },
      data: { node },
      style: {
        width: LAYOUT_CONSTANTS.NODE_WIDTH,
        height,
      },
    }
  })

  // Create edges - only if both nodes exist
  const edges: Edge[] = schema.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => {
      const style = getEdgeStyle(edge.kind)
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: edge.kind === 'imports',
        label: edge.kind !== 'imports' ? edge.kind : undefined,
        labelStyle: { fontSize: 10, fill: '#666' },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: style.stroke,
          strokeWidth: 1.5,
          strokeDasharray: style.strokeDasharray,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: style.stroke,
        },
      }
    })

  return { nodes, edges }
}

export function ReactFlowRenderer({ schema }: ReactFlowRendererProps) {
  // Convert schema to React Flow format (memoized)
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => (schema ? schemaToFlow(schema) : { nodes: [], edges: [] }),
    []
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update when schema changes
  useEffect(() => {
    if (schema) {
      const { nodes: newNodes, edges: newEdges } = schemaToFlow(schema)
      setNodes(newNodes)
      setEdges(newEdges)
    }
  }, [schema, setNodes, setEdges])

  // Fit view on initial load
  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => {
      instance.fitView()
    }, 100)
  }, [])

  if (!schema || schema.nodes.length === 0) {
    return (
      <div className="codegraph-renderer codegraph-reactflow-renderer codegraph-empty">
        <p>No nodes to display</p>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className="codegraph-renderer codegraph-reactflow-renderer">
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
              const codeNode = (node.data as CodeNodeData)?.node
              if (!codeNode) return 'var(--bg-tertiary)'

              // Check for category first (Laravel: model/controller/service)
              const category = (codeNode as unknown as { category?: string }).category
              if (category) {
                switch (category) {
                  case 'model':
                    return '#10b981' // green
                  case 'controller':
                    return '#3b82f6' // blue
                  case 'service':
                    return '#f59e0b' // amber
                }
              }

              switch (codeNode.kind) {
                case 'file':
                  return '#6b7280'
                case 'class':
                  return '#3b82f6'
                case 'interface':
                  return '#8b5cf6'
                case 'function':
                  return '#10b981'
                case 'module':
                  return '#f59e0b'
                case 'trait':
                  return '#ec4899'
                default:
                  return 'var(--bg-tertiary)'
              }
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
