/**
 * JsonRenderer - Code Graph visualization as expandable JSON tree
 *
 * Displays the raw CodeGraphSchema data in a collapsible tree view.
 * Useful for debugging, inspection, and data export.
 */

import { useCallback, useMemo } from 'react'
import { JsonView, darkStyles, defaultStyles } from 'react-json-view-lite'
import 'react-json-view-lite/dist/index.css'
import type { CodeGraphSchema, CodeNode, CodeEdge } from '@/app/types/electron'

interface JsonRendererProps {
  schema: CodeGraphSchema | null
}

/**
 * Custom styles that blend with our app theme
 */
const customDarkStyles = {
  ...darkStyles,
  container: 'codegraph-json-container codegraph-json-dark',
}

const customLightStyles = {
  ...defaultStyles,
  container: 'codegraph-json-container codegraph-json-light',
}

/**
 * Transform schema data to show names in collapsed previews
 */
function transformForDisplay(schema: CodeGraphSchema): object {
  // Group nodes by kind
  const nodesByKind: Record<string, CodeNode[]> = {}
  for (const node of schema.nodes) {
    if (!nodesByKind[node.kind]) {
      nodesByKind[node.kind] = []
    }
    nodesByKind[node.kind].push(node)
  }

  // Group edges by kind
  const edgesByKind: Record<string, CodeEdge[]> = {}
  for (const edge of schema.edges) {
    if (!edgesByKind[edge.kind]) {
      edgesByKind[edge.kind] = []
    }
    edgesByKind[edge.kind].push(edge)
  }

  return {
    language: schema.language,
    rootPath: schema.rootPath,
    parsedAt: schema.parsedAt,
    parserVersion: schema.parserVersion,
    summary: {
      totalNodes: schema.nodes.length,
      totalEdges: schema.edges.length,
      nodesByKind: Object.fromEntries(Object.entries(nodesByKind).map(([k, v]) => [k, v.length])),
      edgesByKind: Object.fromEntries(Object.entries(edgesByKind).map(([k, v]) => [k, v.length])),
    },
    nodes: nodesByKind,
    edges: edgesByKind,
  }
}

export function JsonRenderer({ schema }: JsonRendererProps) {
  // Detect dark mode
  const isDarkMode = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }, [])

  // Transform schema for better display
  const displayData = useMemo(() => {
    if (!schema) return null
    return transformForDisplay(schema)
  }, [schema])

  // Control which nodes are expanded by default
  const shouldExpandNode = useCallback((level: number, _value: unknown, _field?: string) => {
    return level < 2
  }, [])

  if (!schema || !displayData) {
    return (
      <div className="codegraph-renderer codegraph-json-renderer codegraph-empty">
        <p>No schema data to display</p>
      </div>
    )
  }

  return (
    <div className="codegraph-renderer codegraph-json-renderer">
      <div className="codegraph-json-content">
        <JsonView
          data={displayData}
          shouldExpandNode={shouldExpandNode}
          style={isDarkMode ? customDarkStyles : customLightStyles}
        />
      </div>
    </div>
  )
}

export default JsonRenderer
