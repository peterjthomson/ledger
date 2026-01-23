/**
 * CodeNode - Custom React Flow node for code graph nodes
 *
 * Renders code symbols (files, classes, functions) as rectangular boxes.
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CodeNode as CodeNodeType } from '@/app/types/electron'

// Node data type
export interface CodeNodeData {
  node: CodeNodeType
}

/**
 * Get icon based on category (Laravel) or kind
 */
function getNodeIcon(node: CodeNodeType): string {
  const category = (node as unknown as { category?: string }).category
  if (category) {
    switch (category) {
      case 'model':
        return '🟢' // green circle for models
      case 'controller':
        return '🔵' // blue circle for controllers
      case 'service':
        return '🟠' // orange circle for services
    }
  }
  
  switch (node.kind) {
    case 'file':
      return '📄'
    case 'class':
      return '🔷'
    case 'interface':
      return '🔶'
    case 'function':
      return 'ƒ'
    case 'module':
      return '📦'
    case 'trait':
      return '🔸'
    case 'enum':
      return '🔢'
    default:
      return '•'
  }
}

/**
 * Get CSS class based on category or kind
 */
function getNodeClass(node: CodeNodeType): string {
  const category = (node as unknown as { category?: string }).category
  if (category) {
    return `codegraph-node-${category}`
  }
  return `codegraph-node-${node.kind}`
}

/**
 * React Flow custom node for code graph
 */
function CodeNodeComponent({ data, selected }: NodeProps<CodeNodeData>) {
  const { node } = data
  const icon = getNodeIcon(node)
  const nodeClass = getNodeClass(node)

  return (
    <div className={`codegraph-node ${nodeClass} ${selected ? 'selected' : ''}`}>
      {/* Connection handles */}
      <Handle type="target" position={Position.Top} id="top" className="codegraph-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="codegraph-handle" />

      {/* Node content */}
      <div className="codegraph-node-header">
        <span className="codegraph-node-icon">{icon}</span>
        <span className="codegraph-node-name" title={node.id}>
          {node.displayName || node.name}
        </span>
        {node.exported && <span className="codegraph-node-exported" title="Exported">↗</span>}
      </div>
      {node.kind !== 'file' && (
        <div className="codegraph-node-path" title={node.filePath}>
          {node.filePath.split('/').pop()}
        </div>
      )}
    </div>
  )
}

// Memoize to prevent unnecessary re-renders
export const CodeNode = memo(CodeNodeComponent)
export default CodeNode
